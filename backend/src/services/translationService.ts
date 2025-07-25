import axios from 'axios'
import { v4 as uuidv4 } from 'uuid'
import { ContentStyle, ChapterTranslation, TranslationTask } from '@shared/types'
import { createLogger } from '../utils/logger'
import { AppError } from '../utils/errorHandler'
import { SmartChunker } from './epubService'

const logger = createLogger('translationService')

interface MoonshotConfig {
  apiKey: string
  baseURL: string
  model: string
  maxTokens: number
  temperature: number
}

// 提示词模板
const PROMPT_TEMPLATES = {
  fiction: {
    system: `你是一位资深的文学翻译家，专精于英文小说的中文翻译。你的翻译特点：
1. 保持原作的文学风格和语言韵味
2. 准确传达人物的情感和性格特征
3. 处理对话时保持角色的语言特色
4. 适当使用中文成语和习语，但不过度
5. 保持叙事的流畅性和可读性`,
    user: `请将下面的英文小说段落翻译成中文。注意：
- 保持原文的语气和氛围
- 人名和地名使用通用译法
- 对话部分要自然流畅
- 不要添加解释性内容

原文：
{text}

翻译：`
  },
  science: {
    system: `你是一位专业的科技翻译专家，擅长翻译科普和学术内容。你的翻译原则：
1. 专业术语使用标准译法
2. 保持逻辑的严谨性和准确性
3. 数据和引用必须精确
4. 使用学术性的中文表达
5. 必要时在括号内保留英文原词`,
    user: `请将下面的科技/科普内容翻译成中文。要求：
- 专业术语准确
- 保持原文的逻辑结构
- 数字、单位、公式等保持原样
- 首次出现的专业术语可在括号内注明英文

原文：
{text}

翻译：`
  },
  general: {
    system: `你是一位专业的翻译工作者，能够准确、流畅地进行英中翻译。`,
    user: `请将下面的英文内容翻译成中文，保持准确性和流畅性：

原文：
{text}

翻译：`
  }
}

export class TranslationService {
  private config: MoonshotConfig
  private chunker: SmartChunker
  private requestQueue: Map<string, Promise<any>> = new Map()

  constructor(apiKey: string) {
    this.config = {
      apiKey,
      baseURL: process.env.MOONSHOT_API_URL || 'https://api.moonshot.cn/v1',
      model: 'moonshot-v1-8k',
      maxTokens: 4000,
      temperature: 0.3
    }
    this.chunker = new SmartChunker(1500)
  }

  async translateChapter(
    chapter: { id: string; title: string; content: string },
    style: ContentStyle = 'auto',
    onProgress?: (progress: number) => void
  ): Promise<string> {
    try {
      // 自动检测风格
      if (style === 'auto') {
        style = this.detectStyle(chapter.content)
      }

      // 分段
      const chunks = this.chunker.chunk(chapter.content)
      const translatedChunks: string[] = []

      // 逐段翻译
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        const progress = (i / chunks.length) * 100
        
        if (onProgress) {
          onProgress(progress)
        }

        const translated = await this.translateChunk(chunk.text, style)
        translatedChunks.push(translated)
      }

      if (onProgress) {
        onProgress(100)
      }

      return translatedChunks.join('\n\n')
    } catch (error) {
      logger.error('章节翻译失败', { chapterId: chapter.id, error })
      throw error
    }
  }

  private async translateChunk(text: string, style: ContentStyle): Promise<string> {
    const prompt = this.buildPrompt(text, style)

    try {
      const response = await this.callMoonshotAPI(prompt)
      return this.extractTranslation(response)
    } catch (error) {
      // 重试逻辑
      logger.warn('翻译API调用失败，尝试重试', { error })
      await this.delay(2000)
      
      try {
        const response = await this.callMoonshotAPI(prompt)
        return this.extractTranslation(response)
      } catch (retryError) {
        logger.error('翻译API重试失败', { retryError })
        throw new AppError(500, '翻译服务暂时不可用')
      }
    }
  }

  private async callMoonshotAPI(prompt: { system: string; user: string }): Promise<any> {
    const messages = [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ]

    const response = await axios.post(
      `${this.config.baseURL}/chat/completions`,
      {
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens
      },
      {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: parseInt(process.env.API_TIMEOUT || '30000')
      }
    )

    return response.data
  }

  private extractTranslation(response: any): string {
    const content = response.choices?.[0]?.message?.content
    if (!content) {
      throw new Error('API响应格式错误')
    }
    return content.trim()
  }

  private detectStyle(text: string): ContentStyle {
    const fictionKeywords = ['said', 'asked', 'replied', 'thought', 'felt', 'chapter']
    const scienceKeywords = ['research', 'study', 'data', 'analysis', 'theory', 'experiment']
    
    const lowerText = text.toLowerCase()
    const words = lowerText.split(/\s+/)
    
    let fictionScore = 0
    let scienceScore = 0
    
    for (const word of words) {
      if (fictionKeywords.includes(word)) fictionScore++
      if (scienceKeywords.includes(word)) scienceScore++
    }
    
    // 检查对话标记
    if (/".*?"/.test(text) || /'.*?'/.test(text)) {
      fictionScore += 5
    }
    
    // 检查数据格式
    if (/\d+%/.test(text) || /Figure \d+/i.test(text) || /Table \d+/i.test(text)) {
      scienceScore += 5
    }
    
    if (fictionScore > scienceScore * 1.5) {
      return 'fiction'
    } else if (scienceScore > fictionScore * 1.5) {
      return 'science'
    }
    
    return 'general'
  }

  private buildPrompt(text: string, style: ContentStyle): { system: string; user: string } {
    const template = PROMPT_TEMPLATES[style]
    return {
      system: template.system,
      user: template.user.replace('{text}', text)
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// 翻译任务管理器
export class TranslationTaskManager {
  private tasks: Map<string, TranslationTask> = new Map()
  private translationService: TranslationService | null = null

  createTask(fileId: string, chapters: Array<{ id: string; title: string; content: string }>): TranslationTask {
    const task: TranslationTask = {
      id: uuidv4(),
      fileId,
      status: 'pending',
      progress: 0,
      chapters: chapters.map(ch => ({
        chapterId: ch.id,
        chapterTitle: ch.title,
        originalText: ch.content,
        status: 'pending',
        progress: 0
      })),
      createdAt: new Date()
    }

    this.tasks.set(task.id, task)
    return task
  }

  getTask(taskId: string): TranslationTask | undefined {
    return this.tasks.get(taskId)
  }

  async startTranslation(
    taskId: string,
    apiKey: string,
    style: ContentStyle = 'auto',
    onProgress?: (progress: TranslationTask) => void
  ): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) {
      throw new AppError(404, '任务不存在')
    }

    this.translationService = new TranslationService(apiKey)
    task.status = 'processing'

    try {
      for (let i = 0; i < task.chapters.length; i++) {
        const chapter = task.chapters[i]
        chapter.status = 'processing'

        const translatedText = await this.translationService.translateChapter(
          {
            id: chapter.chapterId,
            title: chapter.chapterTitle,
            content: chapter.originalText
          },
          style,
          (chapterProgress) => {
            chapter.progress = chapterProgress
            task.progress = this.calculateOverallProgress(task)
            if (onProgress) onProgress(task)
          }
        )

        chapter.translatedText = translatedText
        chapter.status = 'completed'
        chapter.progress = 100

        task.progress = this.calculateOverallProgress(task)
        if (onProgress) onProgress(task)
      }

      task.status = 'completed'
      task.completedAt = new Date()
    } catch (error) {
      task.status = 'failed'
      task.error = error instanceof Error ? error.message : '未知错误'
      throw error
    }
  }

  private calculateOverallProgress(task: TranslationTask): number {
    if (task.chapters.length === 0) return 0
    
    const totalProgress = task.chapters.reduce((sum, ch) => sum + ch.progress, 0)
    return Math.round(totalProgress / task.chapters.length)
  }

  getTranslations(taskId: string): Map<string, string> {
    const task = this.tasks.get(taskId)
    if (!task) {
      throw new AppError(404, '任务不存在')
    }

    const translations = new Map<string, string>()
    for (const chapter of task.chapters) {
      if (chapter.translatedText) {
        translations.set(chapter.chapterId, chapter.translatedText)
      }
    }

    return translations
  }
}

// 全局任务管理器实例
export const taskManager = new TranslationTaskManager()