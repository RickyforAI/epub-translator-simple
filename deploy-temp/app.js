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
    
    fileInput.addEventListener('change', (e) => {
      console.log('File input change event triggered')
      handleFileSelect(e)
    })
    
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
      console.log('File dropped:', e.dataTransfer.files)
      if (e.dataTransfer.files[0]) {
        handleFileSelect({ target: { files: e.dataTransfer.files } })
      }
    })
  }

  function handleFileSelect(e) {
    console.log('handleFileSelect called')
    console.log('Event:', e)
    console.log('Files:', e.target.files)
    
    const file = e.target.files[0]
    if (file) {
      // 打印详细的文件信息
      console.log('Detailed file info:', {
        name: file.name,
        type: file.type || 'no type',
        size: file.size,
        lastModified: new Date(file.lastModified).toISOString()
      })
      
      // 更宽松的EPUB检查
      const fileNameLower = file.name.toLowerCase()
      const hasEpubExtension = fileNameLower.endsWith('.epub')
      const hasEpubInName = fileNameLower.includes('.epub')
      
      console.log('EPUB checks:', {
        hasEpubExtension,
        hasEpubInName,
        mimeType: file.type
      })
      
      // 如果文件名包含.epub，直接接受
      if (hasEpubInName) {
        console.log('File accepted based on name containing .epub')
        selectedFile = file
        fileName.textContent = `已选择: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`
        translateBtn.disabled = false
        hideMessages()
      } else {
        // 否则检查文件内容
        console.log('Checking file content...')
        checkEpubContent(file)
      }
    } else {
      console.log('No file selected')
    }
  }
  
  // 检查文件内容是否为EPUB格式
  async function checkEpubContent(file) {
    try {
      console.log('Checking file content for:', file.name)
      
      // 读取文件前几个字节来检查是否是ZIP格式（EPUB本质是ZIP）
      const slice = file.slice(0, 4)
      const buffer = await slice.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      
      console.log('File magic bytes:', Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' '))
      
      // ZIP文件的魔术数字：50 4B 03 04 (PK..)
      if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) {
        console.log('File appears to be a ZIP/EPUB file based on magic bytes')
        selectedFile = file
        fileName.textContent = `已选择: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`
        translateBtn.disabled = false
        hideMessages()
      } else {
        console.log('Not a ZIP file. Magic bytes:', bytes)
        // 即使不是标准ZIP格式，如果用户坚持，也尝试处理
        showError('文件格式验证失败，但您可以尝试继续翻译')
        selectedFile = file
        fileName.textContent = `已选择: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB) - 格式未验证`
        translateBtn.disabled = false
      }
    } catch (err) {
      console.error('Error checking file content:', err)
      // 出错时也允许用户继续
      selectedFile = file
      fileName.textContent = `已选择: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB) - 未验证`
      translateBtn.disabled = false
      showError('无法验证文件格式，但您可以尝试继续')
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
    if (selectedFile.size > 10 * 1024 * 1024) {
      showError('文件太大，请选择小于 10MB 的文件')
      return
    }
    
    // 获取测试模式状态
    const testModeCheckbox = document.getElementById('testMode')
    const isTestMode = testModeCheckbox && testModeCheckbox.checked
    
    if (isTestMode) {
      console.log('Test mode enabled - will limit to 2 chapters and 5 chunks per chapter')
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
      const content = await parseEpub(selectedFile, isTestMode)
      
      // 3. 保存原文到数据库
      updateStatus(`准备翻译 ${content.chapters.length} 个章节...${isTestMode ? ' [测试模式]' : ''}`)
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
      updateStatus(`开始翻译 ${content.chapters.length} 个章节...${isTestMode ? ' [测试模式]' : ''}`)
      await translateTexts(task.id, apiKey, styleSelect.value, isTestMode)
      
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
  async function parseEpub(file, isTestMode = false) {
    const arrayBuffer = await file.arrayBuffer()
    const zip = await JSZip.loadAsync(arrayBuffer)
    
    const chapters = []
    const files = Object.keys(zip.files)
    
    console.log(`EPUB contains ${files.length} files`)
    
    // 简单提取文本内容
    for (const fileName of files) {
      if (fileName.endsWith('.html') || fileName.endsWith('.xhtml')) {
        const content = await zip.file(fileName).async('string')
        const text = extractText(content)
        console.log(`File: ${fileName}, Text length: ${text.length}`)
        
        // 降低阈值，确保不遗漏短章节
        if (text.length > 10) {
          chapters.push({ fileName, text, html: content })
          
          // 测试模式下只处理前2个章节
          if (isTestMode && chapters.length >= 2) {
            console.log('Test mode: limiting to 2 chapters')
            break
          }
        } else if (text.length > 0) {
          console.log(`Skipping short chapter: ${fileName} (${text.length} chars)`)
        }
      }
    }
    
    console.log(`Found ${chapters.length} chapters to translate${isTestMode ? ' (test mode)' : ''}`)
    
    return { zip, chapters }
  }

  // 提取文本（保留段落结构，跳过目录页）
  function extractText(html) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    
    // 检查是否是目录页（包含大量链接）
    const links = doc.querySelectorAll('a')
    const textContent = doc.body ? doc.body.textContent.trim() : ''
    const linkToTextRatio = links.length > 0 ? (links.length * 20) / textContent.length : 0
    
    // 如果链接比例过高，可能是目录页
    if (linkToTextRatio > 0.5 && links.length > 5) {
      console.log('Detected TOC page in extractText, returning minimal text')
      // 只返回标题文本，不返回链接内容
      const headings = doc.querySelectorAll('h1, h2, h3')
      if (headings.length > 0) {
        return Array.from(headings).map(h => h.textContent.trim()).join('\n\n')
      }
      return '' // 完全跳过目录页
    }
    
    let paragraphs = []
    
    // 递归提取文本，保留段落结构
    function extractFromNode(node, inLink = false) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim()
        if (text && !inLink) { // 不提取链接内的文本
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
        if (['SCRIPT', 'STYLE', 'META', 'TITLE', 'NAV'].includes(node.tagName)) {
          return
        }
        
        // 处理链接 - 跳过链接内容以避免目录项
        if (node.tagName === 'A') {
          return // 完全跳过链接内容
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

  // 翻译文本（优化大文件处理）
  async function translateTexts(taskId, apiKey, style, isTestMode = false) {
    // 获取所有待翻译文本
    const { data: texts } = await supabase
      .from('translations')
      .select('*')
      .eq('task_id', taskId)
    
    console.log(`Starting translation of ${texts.length} texts`)
    
    const total = texts.length
    let completed = 0
    let errors = 0
    const startTime = Date.now()
    
    // 动态批大小：根据章节数量调整
    let batchSize
    if (total <= 10) {
      batchSize = 2 // 小文件，每批2个
    } else if (total <= 50) {
      batchSize = 3 // 中等文件，每批3个
    } else if (total <= 100) {
      batchSize = 5 // 大文件，每批5个
    } else {
      batchSize = 10 // 超大文件，每批10个
    }
    
    const batches = []
    for (let i = 0; i < texts.length; i += batchSize) {
      batches.push(texts.slice(i, i + batchSize))
    }
    
    console.log(`Using batch size: ${batchSize} for ${total} chapters`)
    updateStatus(`准备翻译 ${total} 个章节...`)
    
    // 逐批处理
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]
      console.log(`Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} chapters`)
      
      const batchPromises = []
      
      // 批内并发，但限制并发数
      for (let i = 0; i < batch.length; i++) {
        const text = batch[i]
        const textIndex = batchIndex * batchSize + i
        
        // 计算每个文本的总chunks数（用于细粒度进度）
        const textChunks = Math.ceil(text.original_text.length / 1500)
        
        const promise = translateSingleText(text, apiKey, style, isTestMode, (chunksDone, totalChunks) => {
          // 细粒度进度更新回调
          const baseProgress = (completed / total) * 100
          const textProgress = (1 / total) * (chunksDone / totalChunks) * 100
          const totalProgress = baseProgress + textProgress
          
          updateProgress(totalProgress)
          updateStatus(`翻译进度: 章节 ${completed + 1}/${total} - 片段 ${chunksDone}/${totalChunks} (${totalProgress.toFixed(1)}%)${isTestMode ? ' [测试模式]' : ''}`)
        }).then(async (translation) => {
          if (translation) {
            await supabase
              .from('translations')
              .update({ 
                translated_text: translation,
                status: 'completed'
              })
              .eq('id', text.id)
            
            completed++
            console.log(`Completed ${completed}/${total}`)
          } else {
            errors++
            console.log(`Error translating text ${text.id}`)
          }
          
          // 章节完成时的进度更新
          const progress = (completed / total) * 100
          updateProgress(progress)
          
          const eta = calculateETA(completed, total, startTime)
          updateStatus(`翻译进度: ${completed}/${total} 章节 (${progress.toFixed(1)}%) ${eta}`)
        }).catch(err => {
          console.error('Translation promise error:', err)
          errors++
        })
        
        batchPromises.push(promise)
      }
      
      // 等待当前批次完成
      await Promise.all(batchPromises)
      
      // 批次间短暂延迟，避免API限流
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    
    if (errors > 0) {
      updateStatus(`翻译完成，成功 ${completed} 章节，失败 ${errors} 章节`)
    }
    
    console.log(`Translation completed: ${completed} success, ${errors} errors`)
  }
  
  // 翻译单个文本（支持进度回调）
  async function translateSingleText(text, apiKey, style, isTestMode, onChunkProgress) {
    try {
      console.log(`Translating text ${text.id}, length: ${text.original_text.length}${isTestMode ? ' [Test Mode]' : ''}`)
      
      // 如果文本太长，需要分段翻译
      let chunks = splitTextIntoChunks(text.original_text, 1500)
      console.log(`Split into ${chunks.length} chunks`)
      
      // 测试模式下限制为前5个片段
      if (isTestMode && chunks.length > 5) {
        console.log(`Test mode: limiting chunks from ${chunks.length} to 5`)
        chunks = chunks.slice(0, 5)
      }
      
      const translatedChunks = []
      
      for (let i = 0; i < chunks.length; i++) {
        console.log(`Translating chunk ${i + 1}/${chunks.length}, length: ${chunks[i].length}`)
        const startTime = Date.now()
        
        const translatedChunk = await callMoonshotAPI(chunks[i], apiKey, style)
        
        const elapsed = Date.now() - startTime
        console.log(`Chunk ${i + 1} translated in ${elapsed}ms`)
        
        translatedChunks.push(translatedChunk)
        
        // 通知进度更新
        if (onChunkProgress) {
          onChunkProgress(i + 1, chunks.length)
        }
        
        // 分段间短暂延迟
        if (chunks.length > 1 && i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }
      
      const result = translatedChunks.join('\n\n')
      console.log(`Text ${text.id} translation completed, result length: ${result.length}`)
      
      return result
    } catch (err) {
      console.error('Translation error for text', text.id, ':', err)
      return null
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
  
  // 调用 Moonshot API（增加重试机制）
  async function callMoonshotAPI(text, apiKey, style, retryCount = 0) {
    const prompts = {
      fiction: '直接翻译下面的英文小说内容为中文，不要添加任何解释或说明，只输出翻译结果：\n\n',
      science: '直接翻译下面的科技内容为中文，保持专业术语准确，只输出翻译结果：\n\n',
      general: '直接翻译下面的英文为中文，只输出翻译结果：\n\n'
    }
    
    const prompt = prompts[style] || prompts.general
    
    try {
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
        const errorMessage = errorData.error?.message || `API 错误: ${response.status}`
        
        // 处理限流错误
        if (response.status === 429 && retryCount < 3) {
          console.log(`API 限流，等待后重试 (${retryCount + 1}/3)...`)
          await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 2000))
          return callMoonshotAPI(text, apiKey, style, retryCount + 1)
        }
        
        throw new Error(errorMessage)
      }
      
      const data = await response.json()
      const rawOutput = data.choices[0].message.content
      
      // 清理LLM输出，确保只包含翻译内容
      return cleanLLMOutput(rawOutput)
      
    } catch (error) {
      // 网络错误重试
      if (retryCount < 3 && (error.message.includes('fetch') || error.message.includes('network'))) {
        console.log(`网络错误，等待后重试 (${retryCount + 1}/3)...`)
        await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1000))
        return callMoonshotAPI(text, apiKey, style, retryCount + 1)
      }
      
      throw error
    }
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

  // 改进的HTML替换函数，更精确地处理章节结构
  function replaceTextInHtml(html, originalText, translatedText) {
    try {
      // 防御性编程：验证输入
      if (!html || !translatedText) {
        console.error('Invalid input for replaceTextInHtml')
        return html
      }
      
      // 清理翻译文本，确保没有英文混入
      const cleanedTranslation = cleanLLMOutput(translatedText)
      
      // 保留原始的XML声明和DOCTYPE
      let xmlDeclaration = ''
      let processedHtml = html
      
      if (html.trim().startsWith('<?xml')) {
        const xmlEnd = html.indexOf('?>') + 2
        xmlDeclaration = html.substring(0, xmlEnd) + '\n'
        processedHtml = html.substring(xmlEnd)
      }
      
      // 检查是否是目录页（包含大量链接）
      const isTocPage = (processedHtml.match(/<a[^>]*>/g) || []).length > 10
      
      if (isTocPage) {
        console.log('Detected TOC page, skipping translation')
        return html // 目录页不翻译，保持原样
      }
      
      // 解析HTML
      const parser = new DOMParser()
      const doc = parser.parseFromString(processedHtml, 'text/html')
      
      // 创建原文和译文的映射
      const originalParagraphs = originalText.split(/\n\n+/).map(p => p.trim()).filter(p => p)
      const translatedParagraphs = cleanedTranslation.split(/\n\n+/).map(p => p.trim()).filter(p => p)
      
      console.log(`Replacing text: ${originalParagraphs.length} original, ${translatedParagraphs.length} translated`)
      
      // 更精确的文本替换策略
      let paragraphIndex = 0
      
      // 处理所有包含文本的元素
      const textElements = doc.querySelectorAll('p, div, span, h1, h2, h3, h4, h5, h6, li')
      
      textElements.forEach(element => {
        // 跳过只包含链接的元素
        if (element.children.length > 0 && element.textContent.trim().length < 50) {
          const hasOnlyLinks = Array.from(element.children).every(child => child.tagName === 'A')
          if (hasOnlyLinks) {
            console.log('Skipping element with only links')
            return
          }
        }
        
        // 获取元素的纯文本内容
        const elementText = element.textContent.trim()
        
        // 查找匹配的原文段落
        for (let i = paragraphIndex; i < originalParagraphs.length && i < translatedParagraphs.length; i++) {
          if (elementText.includes(originalParagraphs[i]) || originalParagraphs[i].includes(elementText)) {
            // 如果元素只包含文本节点，直接替换
            if (element.children.length === 0) {
              element.textContent = translatedParagraphs[i]
              paragraphIndex = i + 1
              return
            } else {
              // 如果包含子元素（如链接），需要更细致的处理
              replaceTextInElement(element, originalParagraphs[i], translatedParagraphs[i])
              paragraphIndex = i + 1
              return
            }
          }
        }
      })
      
      // 辅助函数：在保留子元素的情况下替换文本
      function replaceTextInElement(element, originalText, translatedText) {
        // 遍历所有子节点
        const childNodes = Array.from(element.childNodes)
        
        childNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.trim()
            if (text && originalText.includes(text)) {
              // 计算这段文本在原文中的位置比例
              const startRatio = originalText.indexOf(text) / originalText.length
              const lengthRatio = text.length / originalText.length
              
              // 按比例从翻译文本中提取对应部分
              const translatedStart = Math.floor(translatedText.length * startRatio)
              const translatedLength = Math.ceil(translatedText.length * lengthRatio)
              const translatedPart = translatedText.substring(translatedStart, translatedStart + translatedLength)
              
              node.textContent = translatedPart
            }
          }
        })
      }
      
      // 序列化回HTML
      let resultHtml = new XMLSerializer().serializeToString(doc)
      
      // 确保自闭合标签符合XHTML规范
      resultHtml = resultHtml
        .replace(/<img([^>]*)(?<!\/)>/gi, '<img$1 />')
        .replace(/<br(?!\s*\/>)([^>]*)>/gi, '<br$1 />')
        .replace(/<hr(?!\s*\/>)([^>]*)>/gi, '<hr$1 />')
        .replace(/<input([^>]*)(?<!\/)>/gi, '<input$1 />')
        .replace(/<meta([^>]*)(?<!\/)>/gi, '<meta$1 />')
        .replace(/<link([^>]*)(?<!\/)>/gi, '<link$1 />')
      
      return xmlDeclaration + resultHtml
      
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
  
  // 计算预计剩余时间
  function calculateETA(completed, total, startTime) {
    if (completed === 0) return ''
    
    const elapsed = Date.now() - startTime
    const avgTimePerItem = elapsed / completed
    const remaining = total - completed
    const etaMs = remaining * avgTimePerItem
    
    // 转换为可读格式
    const minutes = Math.floor(etaMs / 60000)
    const seconds = Math.floor((etaMs % 60000) / 1000)
    
    if (minutes > 0) {
      return `- 预计剩余: ${minutes}分${seconds}秒`
    } else {
      return `- 预计剩余: ${seconds}秒`
    }
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