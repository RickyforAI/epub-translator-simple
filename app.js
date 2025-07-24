// 等待 DOM 加载完成
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded, initializing app...')
  
  // 从配置文件加载 Supabase 配置
  const SUPABASE_URL = window.EPUB_TRANSLATOR_CONFIG.SUPABASE_URL
  const SUPABASE_KEY = window.EPUB_TRANSLATOR_CONFIG.SUPABASE_KEY

  // 初始化 Supabase
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

  // DOM 元素
  const fileUpload = document.getElementById('fileUpload')
  const fileInput = document.getElementById('fileInput')
  const fileName = document.getElementById('fileName')
  const translateBtn = document.getElementById('translateBtn')
  const progress = document.getElementById('progress')
  const progressFill = document.getElementById('progressFill')
  const status = document.getElementById('status')
  const error = document.getElementById('error')
  const success = document.getElementById('success')
  const apiKeyInput = document.getElementById('apiKey')
  const styleSelect = document.getElementById('style')

  let selectedFile = null

  // 加载保存的 API Key
  const savedApiKey = localStorage.getItem('moonshot_api_key')
  if (savedApiKey && apiKeyInput) {
    apiKeyInput.value = savedApiKey
    console.log('Loaded saved API key')
  }

  // 保存 API Key
  if (apiKeyInput) {
    apiKeyInput.addEventListener('input', () => {
      const key = apiKeyInput.value.trim()
      if (key.length > 10) { // 只有当输入看起来像是有效的 key 时才保存
        localStorage.setItem('moonshot_api_key', key)
        console.log('API key saved to localStorage')
      }
    })
  }

  // 清除 API Key
  const clearApiKeyBtn = document.getElementById('clearApiKey')
  if (clearApiKeyBtn && apiKeyInput) {
    clearApiKeyBtn.addEventListener('click', () => {
      localStorage.removeItem('moonshot_api_key')
      apiKeyInput.value = ''
      console.log('API key cleared')
      showSuccess('API Key 已清除')
      setTimeout(() => hideMessages(), 2000)
    })
  }

  // 调试：检查元素是否存在
  console.log('Elements found:', {
    fileUpload: !!fileUpload,
    fileInput: !!fileInput,
    translateBtn: !!translateBtn
  })

  // 文件选择
  if (fileUpload && fileInput) {
    // 方法1：直接点击
    fileUpload.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      console.log('File upload clicked - attempting file input click')
      
      try {
        // 尝试直接触发
        fileInput.click()
        console.log('File input clicked successfully')
      } catch (err) {
        console.error('Error clicking file input:', err)
        // 备用方案：创建一个新的 input
        const newInput = document.createElement('input')
        newInput.type = 'file'
        newInput.accept = '.epub'
        newInput.style.display = 'none'
        newInput.addEventListener('change', (e) => {
          handleFileSelect(e)
          document.body.removeChild(newInput)
        })
        document.body.appendChild(newInput)
        newInput.click()
      }
    })
    
    fileInput.addEventListener('change', handleFileSelect)
    
    fileUpload.addEventListener('dragover', (e) => {
      e.preventDefault()
      fileUpload.classList.add('active')
    })
    
    fileUpload.addEventListener('dragleave', () => {
      fileUpload.classList.remove('active')
    })
    
    fileUpload.addEventListener('drop', (e) => {
      e.preventDefault()
      fileUpload.classList.remove('active')
      if (e.dataTransfer.files[0]) {
        handleFileSelect({ target: { files: e.dataTransfer.files } })
      }
    })
  }

  function handleFileSelect(e) {
    console.log('File selected:', e.target.files)
    const file = e.target.files[0]
    if (file && file.name.endsWith('.epub')) {
      selectedFile = file
      fileName.textContent = `已选择: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`
      translateBtn.disabled = false
      hideMessages()
    } else if (file) {
      showError('请选择 EPUB 格式的文件')
    }
  }

  // 翻译按钮
  if (translateBtn) {
    translateBtn.addEventListener('click', startTranslation)
  }

  async function startTranslation() {
    const apiKey = apiKeyInput.value.trim()
    if (!apiKey) {
      showError('请输入 Moonshot API Key')
      return
    }
    
    if (!selectedFile) {
      showError('请选择要翻译的文件')
      return
    }
    
    // 检查文件大小
    if (selectedFile.size > 5 * 1024 * 1024) {
      showError('文件太大，请选择小于 5MB 的文件')
      return
    }
    
    hideMessages()
    showProgress()
    translateBtn.disabled = true
    
    try {
      // 1. 创建翻译任务
      updateStatus('创建翻译任务...')
      const { data: task, error: taskError } = await supabase
        .from('translation_tasks')
        .insert({
          file_name: selectedFile.name,
          status: 'processing',
          moonshot_key: apiKey
        })
        .select()
        .single()
      
      if (taskError) throw taskError
      
      // 2. 解析 EPUB 文件
      updateStatus('解析 EPUB 文件...')
      const content = await parseEpub(selectedFile)
      
      // 3. 保存原文到数据库
      updateStatus('准备翻译内容...')
      const texts = content.chapters.map(ch => ({
        task_id: task.id,
        original_text: ch.text,
        status: 'pending'
      }))
      
      const { error: textsError } = await supabase
        .from('translations')
        .insert(texts)
      
      if (textsError) throw textsError
      
      // 4. 开始翻译
      updateStatus('开始翻译...')
      await translateTexts(task.id, apiKey, styleSelect.value)
      
      // 5. 生成翻译后的文件
      updateStatus('生成翻译文件...')
      const translatedEpub = await generateTranslatedEpub(task.id, content)
      
      // 6. 下载文件
      downloadFile(translatedEpub, `translated_${selectedFile.name}`)
      
      showSuccess('翻译完成！文件已开始下载。')
      updateProgress(100)
      
    } catch (err) {
      console.error(err)
      showError('翻译失败: ' + err.message)
    } finally {
      translateBtn.disabled = false
      setTimeout(hideProgress, 3000)
    }
  }

  // 解析 EPUB
  async function parseEpub(file) {
    const arrayBuffer = await file.arrayBuffer()
    const zip = await JSZip.loadAsync(arrayBuffer)
    
    const chapters = []
    const files = Object.keys(zip.files)
    
    // 简单提取文本内容
    for (const fileName of files) {
      if (fileName.endsWith('.html') || fileName.endsWith('.xhtml')) {
        const content = await zip.file(fileName).async('string')
        const text = extractText(content)
        // 降低阈值，确保不遗漏短章节
        if (text.length > 10) {
          chapters.push({ fileName, text, html: content })
        }
      }
    }
    
    return { zip, chapters }
  }

  // 提取文本（保留段落结构和元素关系）
  function extractText(html) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    
    let paragraphs = []
    
    // 递归提取文本，保留段落结构
    function extractFromNode(node, inLink = false) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim()
        if (text) {
          // 如果当前没有段落，创建一个
          if (paragraphs.length === 0) {
            paragraphs.push(text)
          } else {
            // 添加到最后一个段落
            const lastParagraph = paragraphs[paragraphs.length - 1]
            if (lastParagraph.endsWith(' ') || lastParagraph === '' || text.startsWith(' ')) {
              paragraphs[paragraphs.length - 1] += text
            } else {
              paragraphs[paragraphs.length - 1] += ' ' + text
            }
          }
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // 跳过script、style和meta标签
        if (['SCRIPT', 'STYLE', 'META', 'TITLE'].includes(node.tagName)) {
          return
        }
        
        // 处理链接
        if (node.tagName === 'A') {
          // 提取链接文本但标记它是链接的一部分
          for (const child of node.childNodes) {
            extractFromNode(child, true)
          }
          return
        }
        
        // 块级元素创建新段落
        const blockTags = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BR', 'SECTION', 'ARTICLE']
        const isBlock = blockTags.includes(node.tagName)
        
        // 开始新段落
        if (isBlock && paragraphs.length > 0 && paragraphs[paragraphs.length - 1].trim()) {
          paragraphs.push('')
        }
        
        // 递归处理子节点
        for (const child of node.childNodes) {
          extractFromNode(child, inLink)
        }
        
        // 块级元素结束后确保有新段落
        if (isBlock && paragraphs.length > 0 && paragraphs[paragraphs.length - 1].trim()) {
          paragraphs.push('')
        }
      }
    }
    
    // 从body提取
    const body = doc.body
    if (body) {
      extractFromNode(body)
    }
    
    // 清理空段落并合并
    return paragraphs
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .join('\n\n')
  }

  // 翻译文本
  async function translateTexts(taskId, apiKey, style) {
    // 获取所有待翻译文本
    const { data: texts } = await supabase
      .from('translations')
      .select('*')
      .eq('task_id', taskId)
    
    const total = texts.length
    let completed = 0
    
    // 逐个翻译（简化版，不并发）
    for (const text of texts) {
      try {
        // 如果文本太长，需要分段翻译
        const chunks = splitTextIntoChunks(text.original_text, 1500)
        const translatedChunks = []
        
        for (const chunk of chunks) {
          const translatedChunk = await callMoonshotAPI(chunk, apiKey, style)
          translatedChunks.push(translatedChunk)
        }
        
        const fullTranslation = translatedChunks.join('\n\n')
        
        await supabase
          .from('translations')
          .update({ 
            translated_text: fullTranslation,
            status: 'completed'
          })
          .eq('id', text.id)
        
        completed++
        updateProgress((completed / total) * 100)
        updateStatus(`翻译进度: ${completed}/${total} 章节`)
        
      } catch (err) {
        console.error('Translation error:', err)
        // 继续处理其他章节
      }
    }
  }

  // 智能文本分割函数
  function splitTextIntoChunks(text, maxLength) {
    if (text.length <= maxLength) {
      return [text]
    }
    
    const chunks = []
    const paragraphs = text.split('\n\n')
    let currentChunk = ''
    
    for (const paragraph of paragraphs) {
      // 如果单个段落就超过最大长度，需要在句子级别分割
      if (paragraph.length > maxLength) {
        // 先处理当前块
        if (currentChunk) {
          chunks.push(currentChunk.trim())
          currentChunk = ''
        }
        
        // 按句子分割段落
        const sentences = paragraph.match(/[^。！？.!?]+[。！？.!?]+/g) || [paragraph]
        let sentenceChunk = ''
        
        for (const sentence of sentences) {
          if ((sentenceChunk + sentence).length > maxLength) {
            if (sentenceChunk) {
              chunks.push(sentenceChunk.trim())
              sentenceChunk = sentence
            } else {
              // 单个句子太长，强制分割
              chunks.push(sentence.substring(0, maxLength))
              sentenceChunk = sentence.substring(maxLength)
            }
          } else {
            sentenceChunk += sentence
          }
        }
        
        if (sentenceChunk) {
          currentChunk = sentenceChunk
        }
      } else {
        // 检查添加这个段落是否会超过限制
        if ((currentChunk + '\n\n' + paragraph).length > maxLength) {
          chunks.push(currentChunk.trim())
          currentChunk = paragraph
        } else {
          currentChunk = currentChunk ? currentChunk + '\n\n' + paragraph : paragraph
        }
      }
    }
    
    // 添加最后一个块
    if (currentChunk) {
      chunks.push(currentChunk.trim())
    }
    
    return chunks
  }
  
  // 调用 Moonshot API
  async function callMoonshotAPI(text, apiKey, style) {
    // 文本已经在外部分割，这里不再截断
    
    const prompts = {
      fiction: '直接翻译下面的英文小说内容为中文，不要添加任何解释或说明，只输出翻译结果：\n\n',
      science: '直接翻译下面的科技内容为中文，保持专业术语准确，只输出翻译结果：\n\n',
      general: '直接翻译下面的英文为中文，只输出翻译结果：\n\n'
    }
    
    const prompt = prompts[style] || prompts.general
    
    const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'moonshot-v1-8k',
        messages: [
          { role: 'user', content: prompt + text }
        ],
        temperature: 0.3
      })
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error?.message || 'API 调用失败')
    }
    
    const data = await response.json()
    const rawOutput = data.choices[0].message.content
    
    // 清理LLM输出，确保只包含翻译内容
    return cleanLLMOutput(rawOutput)
  }
  
  // 清理LLM输出，移除可能的额外内容
  function cleanLLMOutput(text) {
    // 1. 移除可能的提示词泄露（如"注意："、"翻译："等开头）
    const cleanedText = text
      .replace(/^(注意|说明|提示|翻译)[：:].*/gm, '')
      .replace(/^[\s\S]*?开始翻译[：:]\s*/i, '')
      .trim()
    
    // 2. 检查是否包含明显的英文段落（可能是原文重复）
    const lines = cleanedText.split('\n')
    const chineseLines = lines.filter(line => {
      // 统计中文字符比例
      const chineseChars = (line.match(/[\u4e00-\u9fa5]/g) || []).length
      const totalChars = line.trim().length
      // 如果中文字符少于20%，可能是英文行，过滤掉
      return totalChars === 0 || (chineseChars / totalChars) > 0.2
    })
    
    return chineseLines.join('\n').trim()
  }

  // 改进的HTML替换函数，保留结构但替换所有文本
  function replaceTextInHtml(html, originalText, translatedText) {
    try {
      // 防御性编程：验证输入
      if (!html || !translatedText) {
        console.error('Invalid input for replaceTextInHtml')
        return html
      }
      
      // 清理翻译文本，确保没有英文混入
      const cleanedTranslation = cleanLLMOutput(translatedText)
      
      // 解析HTML
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')
      
      // 创建原文和译文的映射
      const originalParagraphs = originalText.split(/\n\n+/).map(p => p.trim()).filter(p => p)
      const translatedParagraphs = cleanedTranslation.split(/\n\n+/).map(p => p.trim()).filter(p => p)
      
      console.log(`Original paragraphs: ${originalParagraphs.length}, Translated: ${translatedParagraphs.length}`)
      
      // 收集所有文本节点
      const textNodes = []
      
      function collectTextNodes(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent.trim()
          if (text && text.length > 0) {
            // 检查是否包含英文字母（排除数字和特殊字符）
            if (/[a-zA-Z]/.test(text)) {
              textNodes.push(node)
            }
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          // 跳过script、style和meta标签
          if (['SCRIPT', 'STYLE', 'META', 'TITLE'].includes(node.tagName)) {
            return
          }
          // 递归处理子节点
          Array.from(node.childNodes).forEach(collectTextNodes)
        }
      }
      
      // 处理body
      const body = doc.body
      if (body) {
        collectTextNodes(body)
      }
      
      // 创建原文文本内容的合并版本
      const allOriginalText = textNodes.map(node => node.textContent.trim()).join(' ')
      
      // 如果翻译段落数量明显少于原文，可能需要重新分配
      if (translatedParagraphs.length < originalParagraphs.length / 2) {
        // 将翻译文本平均分配到各个节点
        const avgLength = Math.ceil(cleanedTranslation.length / textNodes.length)
        let translationIndex = 0
        
        textNodes.forEach((node, index) => {
          const start = translationIndex
          const end = Math.min(start + avgLength, cleanedTranslation.length)
          const nodeTranslation = cleanedTranslation.substring(start, end).trim()
          
          if (nodeTranslation) {
            node.textContent = nodeTranslation
            translationIndex = end
          }
        })
      } else {
        // 使用段落映射方式
        let paragraphIndex = 0
        let lastMatchedIndex = -1
        
        textNodes.forEach(node => {
          const nodeText = node.textContent.trim()
          
          // 查找最匹配的原文段落
          for (let i = paragraphIndex; i < originalParagraphs.length; i++) {
            if (originalParagraphs[i].includes(nodeText) || nodeText.includes(originalParagraphs[i])) {
              if (i < translatedParagraphs.length) {
                node.textContent = translatedParagraphs[i]
                lastMatchedIndex = i
                paragraphIndex = i + 1
                return
              }
            }
          }
          
          // 如果没有找到精确匹配，使用最近的翻译
          if (lastMatchedIndex >= 0 && lastMatchedIndex < translatedParagraphs.length) {
            node.textContent = translatedParagraphs[lastMatchedIndex]
          } else if (paragraphIndex < translatedParagraphs.length) {
            node.textContent = translatedParagraphs[paragraphIndex]
            paragraphIndex++
          }
        })
      }
      
      // 序列化回HTML，保持XHTML兼容性
      let resultHtml = new XMLSerializer().serializeToString(doc)
      
      // 确保自闭合标签符合XHTML规范
      resultHtml = resultHtml
        .replace(/<img([^>]*)(?<!\/)>/gi, '<img$1 />')
        .replace(/<br(?!\s*\/>)([^>]*)>/gi, '<br$1 />')
        .replace(/<hr(?!\s*\/>)([^>]*)>/gi, '<hr$1 />')
        .replace(/<input([^>]*)(?<!\/)>/gi, '<input$1 />')
        .replace(/<meta([^>]*)(?<!\/)>/gi, '<meta$1 />')
        .replace(/<link([^>]*)(?<!\/)>/gi, '<link$1 />')
      
      // 保留原始的XML声明和DOCTYPE
      if (html.trim().startsWith('<?xml')) {
        const xmlEnd = html.indexOf('?>') + 2
        const xmlDeclaration = html.substring(0, xmlEnd)
        resultHtml = xmlDeclaration + '\n' + resultHtml.replace(/^<\?xml[^>]*>\s*/, '')
      }
      
      return resultHtml
      
    } catch (error) {
      console.error('Error in replaceTextInHtml:', error)
      return html // 出错时返回原内容
    }
  }
  
  // XML转义函数，确保文本内容安全
  function escapeXml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  // 生成翻译后的 EPUB
  async function generateTranslatedEpub(taskId, originalContent) {
    const { data: translations } = await supabase
      .from('translations')
      .select('*')
      .eq('task_id', taskId)
    
    const zip = originalContent.zip
    
    // 替换原文内容
    for (let i = 0; i < originalContent.chapters.length; i++) {
      const chapter = originalContent.chapters[i]
      const translation = translations[i]
      
      if (translation && translation.translated_text) {
        // 使用智能替换函数保留HTML格式
        const newHtml = replaceTextInHtml(
          chapter.html, 
          chapter.text, 
          translation.translated_text
        )
        zip.file(chapter.fileName, newHtml)
      }
    }
    
    // 生成新的 EPUB 文件
    const blob = await zip.generateAsync({ type: 'blob' })
    return blob
  }

  // 下载文件
  function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // UI 辅助函数
  function showProgress() {
    progress.style.display = 'block'
    progressFill.style.width = '0%'
  }

  function hideProgress() {
    progress.style.display = 'none'
  }

  function updateProgress(percent) {
    progressFill.style.width = percent + '%'
  }

  function updateStatus(text) {
    status.textContent = text
  }

  function showError(message) {
    error.textContent = message
    error.style.display = 'block'
    success.style.display = 'none'
  }

  function showSuccess(message) {
    success.textContent = message
    success.style.display = 'block'
    error.style.display = 'none'
  }

  function hideMessages() {
    error.style.display = 'none'
    success.style.display = 'none'
  }
})

// 添加一个全局错误处理
window.addEventListener('error', function(e) {
  console.error('Global error:', e)
})