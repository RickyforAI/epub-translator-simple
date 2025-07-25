import JSZip from 'jszip'
import { v4 as uuidv4 } from 'uuid'
import { Chapter, Image } from '@shared/types'
import { createLogger } from '../utils/logger'
import { AppError } from '../utils/errorHandler'
import { parseStringPromise } from 'xml2js'

const logger = createLogger('epubService')

export interface ParsedEPUB {
  chapters: Chapter[]
  images: Image[]
  metadata: {
    title?: string
    author?: string
    language?: string
  }
}

export class EPUBProcessor {
  private zip: JSZip | null = null

  async parse(buffer: Buffer): Promise<ParsedEPUB> {
    try {
      this.zip = await JSZip.loadAsync(buffer)
      
      // 读取container.xml获取根文件路径
      const containerXml = await this.readFile('META-INF/container.xml')
      const rootfilePath = await this.extractRootfilePath(containerXml)
      
      // 读取content.opf
      const contentOpf = await this.readFile(rootfilePath)
      const { manifest, spine, metadata } = await this.parseContentOpf(contentOpf)
      
      // 按照spine顺序提取章节
      const chapters = await this.extractChapters(manifest, spine)
      
      // 提取图片资源
      const images = await this.extractImages(manifest)
      
      return { chapters, images, metadata }
    } catch (error) {
      logger.error('EPUB解析失败', error)
      throw new AppError(400, 'EPUB文件解析失败')
    }
  }

  private async readFile(path: string): Promise<string> {
    const file = this.zip!.file(path)
    if (!file) {
      throw new Error(`文件不存在: ${path}`)
    }
    return file.async('string')
  }

  private async extractRootfilePath(containerXml: string): Promise<string> {
    const result = await parseStringPromise(containerXml)
    const rootfiles = result.container?.rootfiles?.[0]?.rootfile
    if (!rootfiles || rootfiles.length === 0) {
      throw new Error('无法找到rootfile')
    }
    return rootfiles[0].$['full-path']
  }

  private async parseContentOpf(contentOpf: string): Promise<{
    manifest: Map<string, any>
    spine: string[]
    metadata: any
  }> {
    const result = await parseStringPromise(contentOpf)
    const pkg = result.package
    
    // 解析manifest
    const manifest = new Map()
    const manifestItems = pkg.manifest?.[0]?.item || []
    manifestItems.forEach((item: any) => {
      manifest.set(item.$.id, {
        href: item.$.href,
        mediaType: item.$['media-type']
      })
    })
    
    // 解析spine
    const spineItems = pkg.spine?.[0]?.itemref || []
    const spine = spineItems.map((item: any) => item.$.idref)
    
    // 解析metadata
    const meta = pkg.metadata?.[0] || {}
    const metadata = {
      title: meta['dc:title']?.[0],
      author: meta['dc:creator']?.[0],
      language: meta['dc:language']?.[0]
    }
    
    return { manifest, spine, metadata }
  }

  private async extractChapters(
    manifest: Map<string, any>,
    spine: string[]
  ): Promise<Chapter[]> {
    const chapters: Chapter[] = []
    
    for (let i = 0; i < spine.length; i++) {
      const itemId = spine[i]
      const item = manifest.get(itemId)
      
      if (!item || !item.mediaType.includes('html')) {
        continue
      }
      
      const content = await this.readFile(item.href)
      const { text, title } = this.extractTextFromHtml(content)
      
      chapters.push({
        id: uuidv4(),
        title: title || `Chapter ${i + 1}`,
        content: text,
        order: i,
        wordCount: text.split(/\s+/).length,
        images: [] // 暂时简化处理
      })
    }
    
    return chapters
  }

  private extractTextFromHtml(html: string): { text: string; title?: string } {
    // 提取标题
    const titleMatch = html.match(/<title>(.*?)<\/title>/i)
    const title = titleMatch ? titleMatch[1] : undefined
    
    // 移除script和style标签
    let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    
    // 移除HTML标签但保留内容
    text = text.replace(/<[^>]+>/g, ' ')
    
    // 清理多余空白
    text = text.replace(/\s+/g, ' ').trim()
    
    return { text, title }
  }

  private async extractImages(manifest: Map<string, any>): Promise<Image[]> {
    const images: Image[] = []
    
    for (const [id, item] of manifest.entries()) {
      if (item.mediaType.startsWith('image/')) {
        images.push({
          id: uuidv4(),
          src: item.href,
          alt: id
        })
      }
    }
    
    return images
  }

  async rebuild(
    originalEpub: ParsedEPUB,
    translations: Map<string, string>
  ): Promise<Buffer> {
    // 这里简化处理，实际实现需要完整保持EPUB结构
    const newZip = new JSZip()
    
    // 添加mimetype
    newZip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
    
    // 添加META-INF/container.xml
    newZip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`)
    
    // 添加content.opf
    const contentOpf = this.generateContentOpf(originalEpub)
    newZip.file('OEBPS/content.opf', contentOpf)
    
    // 添加翻译后的章节
    for (const chapter of originalEpub.chapters) {
      const translatedContent = translations.get(chapter.id) || chapter.content
      const htmlContent = this.generateChapterHtml(chapter.title, translatedContent)
      newZip.file(`OEBPS/Text/chapter${chapter.order + 1}.xhtml`, htmlContent)
    }
    
    // 添加toc.ncx
    const tocNcx = this.generateTocNcx(originalEpub)
    newZip.file('OEBPS/toc.ncx', tocNcx)
    
    return newZip.generateAsync({ type: 'nodebuffer' })
  }

  private generateContentOpf(epub: ParsedEPUB): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${epub.metadata.title || 'Translated Book'}</dc:title>
    <dc:creator>${epub.metadata.author || 'Unknown'}</dc:creator>
    <dc:language>zh-CN</dc:language>
    <dc:identifier id="BookId">urn:uuid:${uuidv4()}</dc:identifier>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    ${epub.chapters.map((ch, i) => 
      `<item id="chapter${i + 1}" href="Text/chapter${i + 1}.xhtml" media-type="application/xhtml+xml"/>`
    ).join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${epub.chapters.map((ch, i) => 
      `<itemref idref="chapter${i + 1}"/>`
    ).join('\n    ')}
  </spine>
</package>`
  }

  private generateChapterHtml(title: string, content: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${title}</title>
  <meta content="text/html; charset=utf-8" http-equiv="Content-Type"/>
</head>
<body>
  <h1>${title}</h1>
  ${content.split('\n\n').map(p => `<p>${p}</p>`).join('\n  ')}
</body>
</html>`
  }

  private generateTocNcx(epub: ParsedEPUB): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${uuidv4()}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${epub.metadata.title || 'Translated Book'}</text>
  </docTitle>
  <navMap>
    ${epub.chapters.map((ch, i) => `
    <navPoint id="navPoint-${i + 1}" playOrder="${i + 1}">
      <navLabel>
        <text>${ch.title}</text>
      </navLabel>
      <content src="Text/chapter${i + 1}.xhtml"/>
    </navPoint>`).join('')}
  </navMap>
</ncx>`
  }
}

// 智能分段器
export class SmartChunker {
  constructor(private maxChunkSize: number = 1500) {}

  chunk(text: string): Array<{ id: string; text: string; index: number }> {
    const chunks: Array<{ id: string; text: string; index: number }> = []
    const paragraphs = text.split(/\n\n+/)
    
    let currentChunk = ''
    let currentIndex = 0
    
    for (const paragraph of paragraphs) {
      if (paragraph.length > this.maxChunkSize) {
        // 处理超长段落
        if (currentChunk) {
          chunks.push({
            id: `chunk_${currentIndex}`,
            text: currentChunk.trim(),
            index: currentIndex++
          })
          currentChunk = ''
        }
        
        // 按句子分割
        const sentences = this.splitBySentence(paragraph)
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length > this.maxChunkSize) {
            chunks.push({
              id: `chunk_${currentIndex}`,
              text: currentChunk.trim(),
              index: currentIndex++
            })
            currentChunk = sentence
          } else {
            currentChunk += (currentChunk ? ' ' : '') + sentence
          }
        }
      } else {
        // 正常段落
        if (currentChunk.length + paragraph.length + 2 > this.maxChunkSize) {
          chunks.push({
            id: `chunk_${currentIndex}`,
            text: currentChunk.trim(),
            index: currentIndex++
          })
          currentChunk = paragraph
        } else {
          currentChunk += (currentChunk ? '\n\n' : '') + paragraph
        }
      }
    }
    
    // 最后一个块
    if (currentChunk) {
      chunks.push({
        id: `chunk_${currentIndex}`,
        text: currentChunk.trim(),
        index: currentIndex
      })
    }
    
    return chunks
  }
  
  private splitBySentence(text: string): string[] {
    // 智能句子分割，考虑缩写等情况
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]
    return sentences.map(s => s.trim())
  }
}