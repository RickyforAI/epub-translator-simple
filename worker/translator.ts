import { createClient } from '@supabase/supabase-js'
import axios from 'axios'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY! // 需要 service key 来绕过 RLS
)

interface TranslationJob {
  taskId: string
  apiKey: string
}

const MOONSHOT_API_URL = 'https://api.moonshot.cn/v1/chat/completions'
const MAX_CHUNK_SIZE = 1500
const CONCURRENT_CHAPTERS = 3

export async function processTranslationJob(job: TranslationJob) {
  const { taskId, apiKey } = job
  
  try {
    // 获取待翻译的章节
    const { data: chapters, error } = await supabase
      .from('chapter_translations')
      .select('*')
      .eq('task_id', taskId)
      .eq('status', 'pending')
      .order('chapter_id')
    
    if (error) throw error
    if (!chapters || chapters.length === 0) {
      console.log('No chapters to translate')
      return
    }
    
    // 获取任务配置
    const { data: task } = await supabase
      .from('translation_tasks')
      .select('api_config')
      .eq('id', taskId)
      .single()
    
    const style = task?.api_config?.style || 'auto'
    
    // 并发处理章节
    const chapterGroups = []
    for (let i = 0; i < chapters.length; i += CONCURRENT_CHAPTERS) {
      chapterGroups.push(chapters.slice(i, i + CONCURRENT_CHAPTERS))
    }
    
    for (const group of chapterGroups) {
      await Promise.all(
        group.map(chapter => translateChapter(chapter, apiKey, style))
      )
      
      // 更新总进度
      await updateTaskProgress(taskId)
    }
    
    // 检查是否所有章节都完成
    const { data: finalTask } = await supabase
      .from('translation_tasks')
      .select('total_chapters, completed_chapters')
      .eq('id', taskId)
      .single()
    
    if (finalTask?.total_chapters === finalTask?.completed_chapters) {
      // 生成最终的 EPUB 文件
      await generateTranslatedEpub(taskId)
      
      // 更新任务状态为完成
      await supabase
        .from('translation_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', taskId)
    }
  } catch (error) {
    console.error('Translation job error:', error)
    await supabase
      .from('translation_tasks')
      .update({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      .eq('id', taskId)
  }
}

async function translateChapter(
  chapter: any,
  apiKey: string,
  style: string
) {
  try {
    // 更新章节状态为处理中
    await supabase
      .from('chapter_translations')
      .update({ status: 'processing' })
      .eq('id', chapter.id)
    
    // 分段翻译
    const chunks = splitIntoChunks(chapter.original_text)
    const translatedChunks: string[] = []
    
    for (let i = 0; i < chunks.length; i++) {
      const translatedChunk = await translateChunk(
        chunks[i],
        apiKey,
        style
      )
      translatedChunks.push(translatedChunk)
      
      // 更新进度
      const progress = Math.round((i + 1) / chunks.length * 100)
      await supabase
        .from('chapter_translations')
        .update({ progress })
        .eq('id', chapter.id)
    }
    
    // 保存翻译结果
    await supabase
      .from('chapter_translations')
      .update({
        translated_text: translatedChunks.join('\n\n'),
        status: 'completed',
        progress: 100
      })
      .eq('id', chapter.id)
    
  } catch (error) {
    console.error(`Chapter translation error:`, error)
    await supabase
      .from('chapter_translations')
      .update({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      .eq('id', chapter.id)
  }
}

async function translateChunk(
  text: string,
  apiKey: string,
  style: string
): Promise<string> {
  const prompt = getPromptByStyle(style)
  
  try {
    const response = await axios.post(
      MOONSHOT_API_URL,
      {
        model: 'moonshot-v1-8k',
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user.replace('{text}', text) }
        ],
        temperature: 0.3,
        max_tokens: 4000
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    )
    
    return response.data.choices[0].message.content
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      // 速率限制，等待后重试
      await new Promise(resolve => setTimeout(resolve, 10000))
      return translateChunk(text, apiKey, style)
    }
    throw error
  }
}

function splitIntoChunks(text: string): string[] {
  const chunks: string[] = []
  const paragraphs = text.split(/\n\n+/)
  let currentChunk = ''
  
  for (const paragraph of paragraphs) {
    if (paragraph.length > MAX_CHUNK_SIZE) {
      // 段落太长，需要进一步分割
      if (currentChunk) {
        chunks.push(currentChunk)
        currentChunk = ''
      }
      
      const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph]
      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > MAX_CHUNK_SIZE) {
          chunks.push(currentChunk)
          currentChunk = sentence
        } else {
          currentChunk += (currentChunk ? ' ' : '') + sentence
        }
      }
    } else {
      if (currentChunk.length + paragraph.length + 2 > MAX_CHUNK_SIZE) {
        chunks.push(currentChunk)
        currentChunk = paragraph
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph
      }
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk)
  }
  
  return chunks
}

function getPromptByStyle(style: string) {
  const prompts = {
    fiction: {
      system: '你是一位资深的文学翻译家，专精于英文小说的中文翻译。保持原作的文学风格和语言韵味。',
      user: '请将下面的英文小说段落翻译成中文，保持原文的语气和氛围：\n\n{text}'
    },
    science: {
      system: '你是一位专业的科技翻译专家，擅长翻译科普和学术内容。确保专业术语准确，逻辑清晰。',
      user: '请将下面的科技内容翻译成中文，保持专业性和准确性：\n\n{text}'
    },
    general: {
      system: '你是一位专业的翻译工作者，能够准确、流畅地进行英中翻译。',
      user: '请将下面的英文内容翻译成中文：\n\n{text}'
    }
  }
  
  return prompts[style as keyof typeof prompts] || prompts.general
}

async function updateTaskProgress(taskId: string) {
  // 计算完成的章节数
  const { data: chapters } = await supabase
    .from('chapter_translations')
    .select('status')
    .eq('task_id', taskId)
  
  if (!chapters) return
  
  const completed = chapters.filter(c => c.status === 'completed').length
  const total = chapters.length
  const progress = Math.round((completed / total) * 100)
  
  await supabase
    .from('translation_tasks')
    .update({
      completed_chapters: completed,
      progress
    })
    .eq('id', taskId)
}

async function generateTranslatedEpub(taskId: string) {
  // 这里应该实现 EPUB 重建逻辑
  // 1. 从 Storage 下载原始 EPUB
  // 2. 获取所有翻译后的章节
  // 3. 替换原文内容
  // 4. 生成新的 EPUB
  // 5. 上传到 Storage
  // 6. 更新 result_url
  
  // 暂时使用占位实现
  const resultUrl = `https://storage.example.com/results/${taskId}/translated.epub`
  
  await supabase
    .from('translation_tasks')
    .update({ result_url: resultUrl })
    .eq('id', taskId)
}