import { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import JSZip from 'jszip'
import xml2js from 'xml2js'
import axios from 'axios'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

interface TranslateRequest {
  fileId: string
  fileUrl: string
  fileName: string
  fileSize: number
  config: {
    apiKey: string
    style?: 'fiction' | 'science' | 'general' | 'auto'
  }
  testMode?: boolean
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = req.body as TranslateRequest
    
    // 下载 EPUB 文件
    const response = await axios.get(body.fileUrl, {
      responseType: 'arraybuffer'
    })
    const epubBuffer = Buffer.from(response.data)
    
    // 解析 EPUB 获取章节
    const chapters = await parseEpub(epubBuffer, body.testMode)
    
    // 创建翻译任务
    const { data: task, error: taskError } = await supabase
      .from('translation_tasks')
      .insert({
        file_id: body.fileId,
        file_name: body.fileName,
        file_size: body.fileSize,
        file_url: body.fileUrl,
        status: 'processing',
        total_chapters: chapters.length,
        api_config: {
          style: body.config.style || 'auto'
        }
      })
      .select()
      .single()

    if (taskError) throw taskError

    // 创建章节记录
    const chapterRecords = chapters.map((chapter, index) => ({
      task_id: task.id,
      chapter_id: chapter.id,
      chapter_title: chapter.title,
      original_text: chapter.content,
      word_count: chapter.content.split(/\s+/).length,
      status: 'pending'
    }))

    const { error: chaptersError } = await supabase
      .from('chapter_translations')
      .insert(chapterRecords)

    if (chaptersError) throw chaptersError

    // 触发后台翻译任务
    // 注意：这里我们只是创建任务，实际翻译将由后台服务处理
    await triggerBackgroundTranslation(task.id, body.config.apiKey)

    return res.status(200).json({
      taskId: task.id,
      message: 'Translation task created successfully'
    })
  } catch (error) {
    console.error('Translation error:', error)
    return res.status(500).json({ 
      error: 'Failed to create translation task',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

async function parseEpub(buffer: Buffer, testMode: boolean = false) {
  const zip = await JSZip.loadAsync(buffer)
  const chapters: Array<{ id: string; title: string; content: string }> = []
  
  // 简化的 EPUB 解析逻辑
  // 实际应该读取 content.opf 和 spine
  const htmlFiles = Object.keys(zip.files).filter(name => 
    name.endsWith('.html') || name.endsWith('.xhtml')
  )
  
  for (const fileName of htmlFiles) {
    const content = await zip.file(fileName)!.async('string')
    // 简单提取文本内容
    let textContent = content
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    
    if (textContent.length > 100) {
      // 测试模式下限制内容长度（模拟前5个片段）
      if (testMode && textContent.length > 1500 * 5) {
        textContent = textContent.substring(0, 1500 * 5) + '...[测试模式截断]'
      }
      
      chapters.push({
        id: fileName,
        title: `Chapter ${chapters.length + 1}${testMode ? ' [测试模式]' : ''}`,
        content: textContent
      })
      
      // 测试模式下只处理前2个章节
      if (testMode && chapters.length >= 2) {
        console.log('Test mode: limiting to 2 chapters')
        break
      }
    }
  }
  
  return chapters
}

async function triggerBackgroundTranslation(taskId: string, apiKey: string) {
  // 这里可以：
  // 1. 调用 Vercel Cron Job
  // 2. 发送到消息队列
  // 3. 或者使用外部服务如 QStash
  
  // 暂时使用简单的 webhook 触发
  if (process.env.TRANSLATION_WEBHOOK_URL) {
    try {
      await axios.post(process.env.TRANSLATION_WEBHOOK_URL, {
        taskId,
        apiKey
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.WEBHOOK_SECRET}`
        }
      })
    } catch (error) {
      console.error('Failed to trigger background translation:', error)
    }
  }
}