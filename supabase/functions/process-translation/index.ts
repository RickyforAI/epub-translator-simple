import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'
import { parse as parseXML } from 'https://deno.land/x/xml@2.1.1/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Moonshot API 配置
const MOONSHOT_API_URL = 'https://api.moonshot.cn/v1/chat/completions'
const MAX_TOKENS_PER_REQUEST = 4000
const CHUNK_SIZE = 2000 // 每次翻译的字符数

interface TranslateRequest {
  taskId: string
}

interface Chapter {
  id: string
  title: string
  content: string
  order: number
}

interface EPUBMetadata {
  title?: string
  author?: string
  language?: string
}

interface ParsedEPUB {
  metadata: EPUBMetadata
  chapters: Chapter[]
  manifest: Map<string, any>
  spine: string[]
  opfPath: string
}

// 翻译提示模板
const TRANSLATION_PROMPTS = {
  fiction: {
    system: '你是一位专业的文学翻译专家，擅长翻译英文小说。请将下面的英文内容翻译成优美流畅的中文，保持原文的文学性和情感色彩。注意保留人名、地名等专有名词的音译。',
    user: '请翻译以下内容：\n\n{text}'
  },
  science: {
    system: '你是一位专业的科技文献翻译专家。请将下面的英文内容准确翻译成中文，确保专业术语的准确性，保持学术文献的严谨性。',
    user: '请翻译以下内容：\n\n{text}'
  },
  general: {
    system: '你是一位专业的翻译专家。请将下面的英文内容翻译成准确、流畅的中文，保持原文的语义和风格。',
    user: '请翻译以下内容：\n\n{text}'
  }
}

serve(async (req) => {
  // 处理 CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { taskId } = await req.json() as TranslateRequest

    // 初始化 Supabase 客户端
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 获取任务详情
    const { data: task, error: taskError } = await supabase
      .from('translation_tasks')
      .select('*')
      .eq('id', taskId)
      .single()

    if (taskError || !task) {
      throw new Error('Task not found')
    }

    // 获取 API 配置
    const apiKey = task.api_config.moonshot_key
    const style = task.api_config.style || 'general'
    const testMode = task.api_config.test_mode || false

    // 更新任务状态为处理中
    await supabase
      .from('translation_tasks')
      .update({ status: 'processing', progress: 0 })
      .eq('id', taskId)

    // 下载 EPUB 文件
    const filePathParts = task.file_url.split('/').slice(-2)
    const filePath = filePathParts.join('/')
    
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('epub-files')
      .download(filePath)

    if (downloadError) {
      throw new Error('Failed to download file: ' + downloadError.message)
    }

    // 解析 EPUB
    const epubContent = await parseEpub(fileData)
    const chapters = epubContent.chapters

    // 测试模式只处理前2章
    const chaptersToProcess = testMode ? chapters.slice(0, 2) : chapters

    // 更新总章节数
    await supabase
      .from('translation_tasks')
      .update({ total_chapters: chaptersToProcess.length })
      .eq('id', taskId)

    // 创建章节记录
    for (const chapter of chaptersToProcess) {
      await supabase
        .from('chapter_translations')
        .insert({
          task_id: taskId,
          chapter_id: chapter.id,
          chapter_title: chapter.title,
          original_text: chapter.content,
          status: 'pending',
          word_count: chapter.content.split(' ').length
        })
    }

    // 处理每个章节
    for (let i = 0; i < chaptersToProcess.length; i++) {
      const chapter = chaptersToProcess[i]
      
      // 更新章节状态
      await supabase
        .from('chapter_translations')
        .update({ status: 'processing', progress: 0 })
        .eq('task_id', taskId)
        .eq('chapter_id', chapter.id)

      // 翻译章节内容
      const translatedText = await translateChapter(
        chapter.content,
        apiKey,
        style,
        testMode
      )

      // 保存翻译结果
      await supabase
        .from('chapter_translations')
        .update({ 
          translated_text: translatedText,
          status: 'completed',
          progress: 100
        })
        .eq('task_id', taskId)
        .eq('chapter_id', chapter.id)

      // 更新总进度
      const progress = Math.round(((i + 1) / chaptersToProcess.length) * 100)
      await supabase
        .from('translation_tasks')
        .update({ 
          progress,
          completed_chapters: i + 1
        })
        .eq('id', taskId)
    }

    // 获取所有翻译结果
    const { data: translations } = await supabase
      .from('chapter_translations')
      .select('*')
      .eq('task_id', taskId)
      .order('chapter_id')

    // 重建 EPUB
    const translatedEpub = await rebuildEpub(epubContent, translations, fileData)
    
    // 上传结果
    const resultPath = `results/${taskId}/translated.epub`
    const { error: uploadError } = await supabase.storage
      .from('epub-results')
      .upload(resultPath, translatedEpub, {
        contentType: 'application/epub+zip'
      })

    if (uploadError) {
      throw new Error('Failed to upload result: ' + uploadError.message)
    }

    // 获取公开 URL
    const { data: { publicUrl } } = supabase.storage
      .from('epub-results')
      .getPublicUrl(resultPath)

    // 更新任务为完成
    await supabase
      .from('translation_tasks')
      .update({ 
        status: 'completed',
        result_url: publicUrl,
        completed_at: new Date().toISOString(),
        progress: 100
      })
      .eq('id', taskId)

    return new Response(
      JSON.stringify({ success: true, taskId, resultUrl: publicUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Translation error:', error)
    
    // 更新任务为失败
    try {
      const { taskId } = await req.json()
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseKey)
      
      await supabase
        .from('translation_tasks')
        .update({ 
          status: 'failed',
          error: error.message
        })
        .eq('id', taskId)
    } catch (e) {
      console.error('Failed to update task status:', e)
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

// 翻译章节内容
async function translateChapter(
  content: string,
  apiKey: string,
  style: string,
  testMode: boolean
): Promise<string> {
  // 分割内容为小块
  const chunks = splitIntoChunks(content, CHUNK_SIZE)
  
  // 测试模式只翻译前5个块
  const chunksToTranslate = testMode ? chunks.slice(0, 5) : chunks
  
  const translatedChunks: string[] = []
  
  for (const chunk of chunksToTranslate) {
    const translated = await callMoonshotAPI(chunk, apiKey, style)
    translatedChunks.push(translated)
  }
  
  // 如果是测试模式且有剩余内容，添加提示
  if (testMode && chunks.length > 5) {
    translatedChunks.push('\n\n[测试模式：剩余内容未翻译]')
  }
  
  return translatedChunks.join('\n\n')
}

// 调用 Moonshot API
async function callMoonshotAPI(
  text: string,
  apiKey: string,
  style: string
): Promise<string> {
  const prompt = TRANSLATION_PROMPTS[style] || TRANSLATION_PROMPTS.general
  
  const response = await fetch(MOONSHOT_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'moonshot-v1-8k',
      messages: [
        {
          role: 'system',
          content: prompt.system
        },
        {
          role: 'user',
          content: prompt.user.replace('{text}', text)
        }
      ],
      temperature: 0.3,
      max_tokens: MAX_TOKENS_PER_REQUEST
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Moonshot API error: ${error}`)
  }

  const data = await response.json()
  return data.choices[0].message.content
}

// 分割文本为小块
function splitIntoChunks(text: string, chunkSize: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]
  const chunks: string[] = []
  let currentChunk = ''
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > chunkSize && currentChunk) {
      chunks.push(currentChunk.trim())
      currentChunk = sentence
    } else {
      currentChunk += sentence
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk.trim())
  }
  
  return chunks
}

// 解析 EPUB
async function parseEpub(epubBlob: Blob): Promise<ParsedEPUB> {
  // 将 Blob 转换为 ArrayBuffer
  const arrayBuffer = await epubBlob.arrayBuffer()
  const uint8Array = new Uint8Array(arrayBuffer)
  
  // 使用动态导入加载 fflate（Deno 兼容的解压库）
  const { unzip } = await import('https://esm.sh/fflate@0.8.1')
  
  return new Promise((resolve, reject) => {
    unzip(uint8Array, async (err, files) => {
      if (err) {
        reject(err)
        return
      }

      try {
        // 1. 读取 container.xml 获取 OPF 文件路径
        const containerPath = 'META-INF/container.xml'
        if (!files[containerPath]) {
          throw new Error('Invalid EPUB: Missing container.xml')
        }
        
        const containerXml = new TextDecoder().decode(files[containerPath])
        const containerDoc = parseXML(containerXml)
        
        // 查找 rootfile 路径
        let opfPath = ''
        const findRootfile = (node: any): void => {
          if (node.name === 'rootfile' && node.attributes?.['full-path']) {
            opfPath = node.attributes['full-path']
          }
          if (node.children) {
            for (const child of node.children) {
              findRootfile(child)
            }
          }
        }
        
        if (containerDoc.root) {
          findRootfile(containerDoc.root)
        }
        
        if (!opfPath) {
          throw new Error('Cannot find OPF file path')
        }

        // 2. 读取 OPF 文件
        if (!files[opfPath]) {
          throw new Error(`OPF file not found: ${opfPath}`)
        }
        
        const opfXml = new TextDecoder().decode(files[opfPath])
        const opfDoc = parseXML(opfXml)
        
        // 提取元数据
        const metadata: EPUBMetadata = {}
        const manifest = new Map<string, any>()
        const spine: string[] = []
        
        // 解析 OPF
        const parseNode = (node: any): void => {
          // 解析元数据
          if (node.name === 'dc:title' && node.content) {
            metadata.title = node.content
          } else if (node.name === 'dc:creator' && node.content) {
            metadata.author = node.content
          } else if (node.name === 'dc:language' && node.content) {
            metadata.language = node.content
          }
          
          // 解析 manifest
          if (node.name === 'item' && node.attributes) {
            const id = node.attributes.id
            const href = node.attributes.href
            const mediaType = node.attributes['media-type']
            if (id && href) {
              manifest.set(id, { href, mediaType })
            }
          }
          
          // 解析 spine
          if (node.name === 'itemref' && node.attributes?.idref) {
            spine.push(node.attributes.idref)
          }
          
          // 递归处理子节点
          if (node.children) {
            for (const child of node.children) {
              parseNode(child)
            }
          }
        }
        
        if (opfDoc.root) {
          parseNode(opfDoc.root)
        }

        // 3. 提取章节内容
        const chapters: Chapter[] = []
        const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1)
        
        for (let i = 0; i < spine.length; i++) {
          const itemId = spine[i]
          const item = manifest.get(itemId)
          
          if (!item || !item.mediaType?.includes('html')) {
            continue
          }
          
          const chapterPath = opfDir + item.href
          if (!files[chapterPath]) {
            console.warn(`Chapter file not found: ${chapterPath}`)
            continue
          }
          
          const chapterHtml = new TextDecoder().decode(files[chapterPath])
          const { text, title } = extractTextFromHtml(chapterHtml)
          
          chapters.push({
            id: `chapter_${i}`,
            title: title || `Chapter ${i + 1}`,
            content: text,
            order: i
          })
        }

        resolve({
          metadata,
          chapters,
          manifest,
          spine,
          opfPath
        })
      } catch (error) {
        reject(error)
      }
    })
  })
}

// 从 HTML 中提取文本
function extractTextFromHtml(html: string): { text: string; title?: string } {
  // 提取标题
  const titleMatch = html.match(/<title>(.*?)<\/title>/i)
  const title = titleMatch ? titleMatch[1] : undefined
  
  // 移除 script 和 style 标签
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
  
  // 移除 HTML 标签但保留内容
  text = text.replace(/<[^>]+>/g, ' ')
  
  // 解码 HTML 实体
  text = text.replace(/&nbsp;/g, ' ')
  text = text.replace(/&amp;/g, '&')
  text = text.replace(/&lt;/g, '<')
  text = text.replace(/&gt;/g, '>')
  text = text.replace(/&quot;/g, '"')
  text = text.replace(/&#39;/g, "'")
  
  // 清理多余空白
  text = text.replace(/\s+/g, ' ').trim()
  
  return { text, title }
}

// 重建 EPUB
async function rebuildEpub(
  originalEpub: ParsedEPUB,
  translations: any[],
  originalFile: Blob
): Promise<Blob> {
  // 将原始文件解压
  const arrayBuffer = await originalFile.arrayBuffer()
  const uint8Array = new Uint8Array(arrayBuffer)
  
  const { unzip, zip } = await import('https://esm.sh/fflate@0.8.1')
  
  return new Promise((resolve, reject) => {
    unzip(uint8Array, async (err, files) => {
      if (err) {
        reject(err)
        return
      }

      try {
        // 创建翻译映射
        const translationMap = new Map<string, string>()
        for (const trans of translations) {
          translationMap.set(trans.chapter_id, trans.translated_text)
        }

        // 获取 OPF 目录
        const opfDir = originalEpub.opfPath.substring(0, originalEpub.opfPath.lastIndexOf('/') + 1)

        // 更新章节文件
        for (let i = 0; i < originalEpub.spine.length; i++) {
          const itemId = originalEpub.spine[i]
          const item = originalEpub.manifest.get(itemId)
          
          if (!item || !item.mediaType?.includes('html')) {
            continue
          }
          
          const chapterPath = opfDir + item.href
          const chapterId = `chapter_${i}`
          const translatedText = translationMap.get(chapterId)
          
          if (translatedText && files[chapterPath]) {
            // 读取原始 HTML
            const originalHtml = new TextDecoder().decode(files[chapterPath])
            
            // 替换内容
            const updatedHtml = replaceHtmlContent(originalHtml, translatedText)
            
            // 更新文件
            files[chapterPath] = new TextEncoder().encode(updatedHtml)
          }
        }

        // 更新元数据中的语言
        if (files[originalEpub.opfPath]) {
          let opfContent = new TextDecoder().decode(files[originalEpub.opfPath])
          opfContent = opfContent.replace(/<dc:language>.*?<\/dc:language>/i, '<dc:language>zh-CN</dc:language>')
          files[originalEpub.opfPath] = new TextEncoder().encode(opfContent)
        }

        // 重新压缩为 EPUB
        const zipData: { [key: string]: Uint8Array } = {}
        for (const [path, data] of Object.entries(files)) {
          zipData[path] = data as Uint8Array
        }

        zip(zipData, { level: 0 }, (err, data) => {
          if (err) {
            reject(err)
          } else {
            resolve(new Blob([data], { type: 'application/epub+zip' }))
          }
        })
      } catch (error) {
        reject(error)
      }
    })
  })
}

// 替换 HTML 内容
function replaceHtmlContent(html: string, translatedText: string): string {
  // 保留 head 部分
  const headMatch = html.match(/<head>[\s\S]*?<\/head>/i)
  const head = headMatch ? headMatch[0] : '<head><title>Translated</title></head>'
  
  // 将翻译文本转换为段落
  const paragraphs = translatedText.split('\n\n')
    .filter(p => p.trim())
    .map(p => `<p>${p.trim()}</p>`)
    .join('\n')
  
  // 构建新的 HTML
  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
${head}
<body>
${paragraphs}
</body>
</html>`
}