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

  // 调试：检查元素是否存在
  console.log('Elements found:', {
    fileUpload: !!fileUpload,
    fileInput: !!fileInput,
    translateBtn: !!translateBtn
  })

  // 文件选择
  if (fileUpload && fileInput) {
    fileUpload.addEventListener('click', (e) => {
      e.preventDefault()
      console.log('File upload clicked')
      fileInput.click()
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
        if (text.length > 100) {
          chapters.push({ fileName, text, html: content })
        }
      }
    }
    
    return { zip, chapters }
  }

  // 提取文本
  function extractText(html) {
    const div = document.createElement('div')
    div.innerHTML = html
    return div.textContent || div.innerText || ''
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
        const translated = await callMoonshotAPI(text.original_text, apiKey, style)
        
        await supabase
          .from('translations')
          .update({ 
            translated_text: translated,
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

  // 调用 Moonshot API
  async function callMoonshotAPI(text, apiKey, style) {
    // 限制文本长度
    const maxLength = 1500
    if (text.length > maxLength) {
      text = text.substring(0, maxLength)
    }
    
    const prompts = {
      fiction: '你是一位资深的文学翻译家。请将下面的英文小说翻译成中文，保持文学性和流畅度：\n\n',
      science: '你是一位专业的科技翻译专家。请将下面的科技内容翻译成中文，确保术语准确：\n\n',
      general: '请将下面的英文翻译成中文：\n\n'
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
    return data.choices[0].message.content
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
        // 简单替换文本内容
        const newHtml = chapter.html.replace(
          /<body[^>]*>[\s\S]*<\/body>/i,
          `<body><p>${translation.translated_text.replace(/\n/g, '</p><p>')}</p></body>`
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