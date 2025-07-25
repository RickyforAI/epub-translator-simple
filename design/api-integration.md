# Moonshot API 集成设计

## API 集成架构

### Moonshot API 配置
```typescript
interface MoonshotConfig {
  apiKey: string
  baseURL: string
  model: string // 推荐使用 moonshot-v1-8k
  maxTokens: number
  temperature: number
}

const DEFAULT_CONFIG: MoonshotConfig = {
  apiKey: '', // 用户输入
  baseURL: 'https://api.moonshot.cn/v1',
  model: 'moonshot-v1-8k',
  maxTokens: 4000,
  temperature: 0.3 // 翻译任务需要较低温度
}
```

### API 客户端设计
```typescript
class MoonshotClient {
  private config: MoonshotConfig
  private rateLimiter: RateLimiter
  
  constructor(config: MoonshotConfig) {
    this.config = config
    this.rateLimiter = new RateLimiter({
      maxRequests: 10,
      perSeconds: 60
    })
  }
  
  async translate(text: string, prompt: PromptTemplate): Promise<string> {
    await this.rateLimiter.wait()
    
    const messages = [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user.replace('{text}', text) }
    ]
    
    try {
      const response = await fetch(`${this.config.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens
        })
      })
      
      const data = await response.json()
      return data.choices[0].message.content
    } catch (error) {
      throw new TranslationError('API调用失败', error)
    }
  }
}
```

## 智能提示词系统

### 风格检测器
```typescript
class StyleDetector {
  private patterns = {
    fiction: {
      keywords: ['chapter', 'said', 'asked', 'replied', 'thought', 'felt'],
      structures: [/["'].*?["']/g, /Chapter \d+/i],
      weight: 0
    },
    science: {
      keywords: ['research', 'study', 'data', 'analysis', 'theory', 'experiment'],
      structures: [/\b\d+%\b/, /Figure \d+/, /Table \d+/],
      weight: 0
    }
  }
  
  detect(text: string): ContentStyle {
    // 重置权重
    this.patterns.fiction.weight = 0
    this.patterns.science.weight = 0
    
    // 关键词匹配
    const words = text.toLowerCase().split(/\s+/)
    for (const word of words) {
      if (this.patterns.fiction.keywords.includes(word)) {
        this.patterns.fiction.weight += 1
      }
      if (this.patterns.science.keywords.includes(word)) {
        this.patterns.science.weight += 1
      }
    }
    
    // 结构匹配
    for (const pattern of this.patterns.fiction.structures) {
      if (pattern.test(text)) {
        this.patterns.fiction.weight += 3
      }
    }
    for (const pattern of this.patterns.science.structures) {
      if (pattern.test(text)) {
        this.patterns.science.weight += 3
      }
    }
    
    // 判定
    if (this.patterns.fiction.weight > this.patterns.science.weight * 1.5) {
      return 'fiction'
    } else if (this.patterns.science.weight > this.patterns.fiction.weight * 1.5) {
      return 'science'
    }
    return 'general'
  }
}
```

### 高级提示词模板
```typescript
const ADVANCED_PROMPTS = {
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
```

### 上下文管理器
```typescript
class ContextManager {
  private contextWindow: string[] = []
  private maxContextSize = 500 // 字符数
  
  // 维护翻译上下文，提高连贯性
  addContext(original: string, translated: string) {
    this.contextWindow.push(`原文：${original.slice(-100)}\n译文：${translated.slice(-100)}`)
    
    // 保持窗口大小
    while (this.getContextSize() > this.maxContextSize) {
      this.contextWindow.shift()
    }
  }
  
  getContext(): string {
    if (this.contextWindow.length === 0) return ''
    return `参考上文翻译风格：\n${this.contextWindow.join('\n\n')}\n\n`
  }
  
  private getContextSize(): number {
    return this.contextWindow.join('').length
  }
}
```

## 分段处理策略

### 智能分段器
```typescript
class SmartChunker {
  private maxChunkSize = 1500 // 留余地给提示词
  
  chunk(text: string): ChunkInfo[] {
    const chunks: ChunkInfo[] = []
    const paragraphs = text.split(/\n\n+/)
    
    let currentChunk = ''
    let currentIndex = 0
    
    for (const paragraph of paragraphs) {
      // 如果单个段落超过限制，需要进一步分割
      if (paragraph.length > this.maxChunkSize) {
        if (currentChunk) {
          chunks.push(this.createChunk(currentChunk, currentIndex))
          currentChunk = ''
        }
        
        // 按句子分割超长段落
        const sentences = this.splitBySentence(paragraph)
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length > this.maxChunkSize) {
            chunks.push(this.createChunk(currentChunk, currentIndex))
            currentChunk = sentence
          } else {
            currentChunk += (currentChunk ? ' ' : '') + sentence
          }
        }
      } else {
        // 正常段落
        if (currentChunk.length + paragraph.length + 2 > this.maxChunkSize) {
          chunks.push(this.createChunk(currentChunk, currentIndex))
          currentChunk = paragraph
        } else {
          currentChunk += (currentChunk ? '\n\n' : '') + paragraph
        }
      }
    }
    
    // 最后一个块
    if (currentChunk) {
      chunks.push(this.createChunk(currentChunk, currentIndex))
    }
    
    return chunks
  }
  
  private splitBySentence(text: string): string[] {
    // 智能句子分割，考虑缩写等情况
    return text.match(/[^.!?]+[.!?]+/g) || [text]
  }
  
  private createChunk(text: string, index: number): ChunkInfo {
    return {
      id: `chunk_${index}`,
      text: text.trim(),
      index,
      size: text.length
    }
  }
}

interface ChunkInfo {
  id: string
  text: string
  index: number
  size: number
}
```

## 错误处理和重试机制

```typescript
class TranslationErrorHandler {
  private maxRetries = 3
  private retryDelay = 1000 // 起始延迟
  
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: Error | null = null
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error as Error
        
        // 判断错误类型
        if (this.isRetryable(error)) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1)
          console.log(`重试 ${attempt}/${this.maxRetries}，等待 ${delay}ms`)
          await this.sleep(delay)
        } else {
          throw error
        }
      }
    }
    
    throw new Error(`操作失败：${context}. 最后错误：${lastError?.message}`)
  }
  
  private isRetryable(error: any): boolean {
    // 可重试的错误类型
    const retryableErrors = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'rate_limit_exceeded',
      '429'
    ]
    
    const errorMessage = error.message || error.toString()
    return retryableErrors.some(e => errorMessage.includes(e))
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
```

## 翻译质量保证

### 翻译验证器
```typescript
class TranslationValidator {
  // 基础验证
  validate(original: string, translated: string): ValidationResult {
    const issues: string[] = []
    
    // 长度检查（中文通常比英文短）
    const lengthRatio = translated.length / original.length
    if (lengthRatio > 1.5) {
      issues.push('译文可能过长')
    } else if (lengthRatio < 0.3) {
      issues.push('译文可能过短')
    }
    
    // 数字一致性检查
    const originalNumbers = original.match(/\d+/g) || []
    const translatedNumbers = translated.match(/\d+/g) || []
    if (originalNumbers.length !== translatedNumbers.length) {
      issues.push('数字可能有遗漏')
    }
    
    // 检查是否有未翻译的内容
    if (/[a-zA-Z]{20,}/.test(translated)) {
      issues.push('可能存在未翻译的内容')
    }
    
    return {
      isValid: issues.length === 0,
      issues,
      confidence: 1 - (issues.length * 0.2)
    }
  }
}

interface ValidationResult {
  isValid: boolean
  issues: string[]
  confidence: number
}
```

## 批处理管理器

```typescript
class BatchTranslationManager {
  private concurrency = 3 // 同时处理的数量
  private queue: TranslationTask[] = []
  private processing = new Set<string>()
  
  async processBatch(
    chapters: Chapter[],
    style: ContentStyle,
    onProgress: (progress: TranslationProgress) => void
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>()
    const tasks = chapters.map(chapter => ({
      id: chapter.id,
      content: chapter.content,
      style
    }))
    
    // 创建任务队列
    this.queue = [...tasks]
    
    // 并发处理
    const workers = Array(this.concurrency).fill(null).map(() => 
      this.processWorker(results, onProgress)
    )
    
    await Promise.all(workers)
    return results
  }
  
  private async processWorker(
    results: Map<string, string>,
    onProgress: (progress: TranslationProgress) => void
  ) {
    while (this.queue.length > 0) {
      const task = this.queue.shift()
      if (!task) continue
      
      this.processing.add(task.id)
      
      try {
        onProgress({
          chapterId: task.id,
          progress: 0,
          status: 'processing'
        })
        
        const translated = await this.translateWithProgress(
          task.content,
          task.style,
          (p) => onProgress({
            chapterId: task.id,
            progress: p,
            status: 'processing'
          })
        )
        
        results.set(task.id, translated)
        
        onProgress({
          chapterId: task.id,
          progress: 100,
          status: 'completed',
          result: translated
        })
      } catch (error) {
        onProgress({
          chapterId: task.id,
          progress: 0,
          status: 'error',
          error: error.message
        })
      } finally {
        this.processing.delete(task.id)
      }
    }
  }
  
  private async translateWithProgress(
    content: string,
    style: ContentStyle,
    onProgress: (progress: number) => void
  ): Promise<string> {
    // 实现分段翻译和进度报告
    const chunker = new SmartChunker()
    const chunks = chunker.chunk(content)
    const translated: string[] = []
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const progress = (i / chunks.length) * 100
      onProgress(progress)
      
      const result = await this.translateChunk(chunk.text, style)
      translated.push(result)
    }
    
    return translated.join('\n\n')
  }
}
```