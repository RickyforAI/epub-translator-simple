// 简化版本的生成翻译后的 EPUB - 用于测试
async function generateTranslatedEpubSimple(taskId, originalContent) {
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
      // 方法1：最简单的替换 - 直接替换body标签内容
      let newHtml = chapter.html
      
      // 查找body标签
      const bodyMatch = newHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i)
      if (bodyMatch) {
        // 创建新的body内容
        const translatedParagraphs = translation.translated_text
          .split('\n')
          .map(p => p.trim())
          .filter(p => p.length > 0)
          .map(p => `<p>${p}</p>`)
          .join('\n')
        
        // 替换body内容
        newHtml = newHtml.replace(
          bodyMatch[0],
          `${bodyMatch[0].match(/<body[^>]*>/i)[0]}${translatedParagraphs}</body>`
        )
      }
      
      zip.file(chapter.fileName, newHtml)
    }
  }
  
  // 生成新的 EPUB 文件
  const blob = await zip.generateAsync({ type: 'blob' })
  return blob
}

// 测试不同的替换方法
function testReplaceMethod1(html, translatedText) {
  // 方法1：保守的字符串替换
  const bodyStart = html.indexOf('<body')
  const bodyEnd = html.indexOf('>', bodyStart) + 1
  const bodyCloseStart = html.lastIndexOf('</body>')
  
  if (bodyStart !== -1 && bodyEnd !== -1 && bodyCloseStart !== -1) {
    const beforeBody = html.substring(0, bodyEnd)
    const afterBody = html.substring(bodyCloseStart)
    
    const paragraphs = translatedText
      .split('\n')
      .filter(p => p.trim())
      .map(p => `<p>${p.trim()}</p>`)
      .join('\n')
    
    return beforeBody + '\n' + paragraphs + '\n' + afterBody
  }
  
  return html
}

function testReplaceMethod2(html, translatedText) {
  // 方法2：保留原始结构，只替换文本内容
  // 提取所有p标签
  const pTags = html.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || []
  const translatedParagraphs = translatedText.split('\n').filter(p => p.trim())
  
  let newHtml = html
  let paragraphIndex = 0
  
  // 替换每个p标签的内容
  for (const pTag of pTags) {
    if (paragraphIndex < translatedParagraphs.length) {
      const pMatch = pTag.match(/<p([^>]*)>([\s\S]*?)<\/p>/i)
      if (pMatch) {
        const attributes = pMatch[1]
        const newPTag = `<p${attributes}>${translatedParagraphs[paragraphIndex]}</p>`
        newHtml = newHtml.replace(pTag, newPTag)
        paragraphIndex++
      }
    }
  }
  
  // 如果还有剩余的段落，添加到body结束标签之前
  if (paragraphIndex < translatedParagraphs.length) {
    const remaining = translatedParagraphs
      .slice(paragraphIndex)
      .map(p => `<p>${p}</p>`)
      .join('\n')
    
    newHtml = newHtml.replace('</body>', `\n${remaining}\n</body>`)
  }
  
  return newHtml
}