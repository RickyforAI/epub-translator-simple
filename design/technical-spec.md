# EPUB翻译器技术规范

## 项目结构
```
epub-translator/
├── design/                    # 设计文档
│   ├── architecture.md       # 系统架构
│   ├── api-integration.md    # API集成设计
│   ├── ui-design.md          # UI设计
│   └── technical-spec.md     # 技术规范
├── frontend/                 # React前端
│   ├── src/
│   │   ├── components/       # UI组件
│   │   ├── services/         # API服务
│   │   ├── hooks/           # 自定义Hooks
│   │   ├── utils/           # 工具函数
│   │   └── types/           # TypeScript类型
│   └── package.json
├── backend/                  # Node.js后端
│   ├── src/
│   │   ├── api/             # API路由
│   │   ├── services/        # 业务逻辑
│   │   ├── utils/           # 工具类
│   │   └── types/           # TypeScript类型
│   └── package.json
└── shared/                   # 共享代码
    └── types/               # 共享类型定义
```

## 技术栈详细说明

### 前端技术栈
- **React 18.2+**: 主框架
- **TypeScript 5.0+**: 类型安全
- **Tailwind CSS 3.3+**: 样式框架
- **Vite 4.4+**: 构建工具
- **React Query**: 服务端状态管理
- **React Hook Form**: 表单处理
- **Axios**: HTTP客户端

### 后端技术栈
- **Node.js 18+**: 运行环境
- **Express 4.18+**: Web框架
- **TypeScript 5.0+**: 类型安全
- **Multer**: 文件上传
- **node-epub**: EPUB解析（备选：epub.js）
- **Archiver**: EPUB打包
- **Winston**: 日志管理
- **Socket.io**: WebSocket通信

### 开发工具
- **ESLint**: 代码规范
- **Prettier**: 代码格式化
- **Jest**: 单元测试
- **Playwright**: E2E测试

## 核心数据模型

### 共享类型定义
```typescript
// shared/types/index.ts

export interface EPUBFile {
  id: string
  fileName: string
  fileSize: number
  uploadTime: Date
  status: FileStatus
}

export type FileStatus = 'uploaded' | 'parsing' | 'translating' | 'completed' | 'error'

export interface Chapter {
  id: string
  title: string
  content: string
  order: number
  wordCount: number
  images: Image[]
}

export interface Image {
  id: string
  src: string
  alt?: string
  width?: number
  height?: number
}

export interface TranslationTask {
  id: string
  fileId: string
  status: TaskStatus
  progress: number
  chapters: ChapterTranslation[]
  createdAt: Date
  completedAt?: Date
  error?: string
}

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface ChapterTranslation {
  chapterId: string
  originalText: string
  translatedText?: string
  status: TaskStatus
  progress: number
  error?: string
}

export interface APIConfig {
  apiKey: string
  model?: string
  style?: ContentStyle
}

export type ContentStyle = 'fiction' | 'science' | 'general' | 'auto'

export interface TranslationOptions {
  preserveFormatting: boolean
  contextWindow: boolean
  batchSize: number
}
```

## API接口规范

### RESTful API设计
```typescript
// API端点定义
interface APIEndpoints {
  // 文件管理
  'POST /api/files/upload': {
    body: FormData
    response: { fileId: string, fileName: string, size: number }
  }
  
  'GET /api/files/:fileId': {
    params: { fileId: string }
    response: EPUBFile
  }
  
  // 翻译任务
  'POST /api/translations': {
    body: {
      fileId: string
      config: APIConfig
      options?: TranslationOptions
    }
    response: { taskId: string }
  }
  
  'GET /api/translations/:taskId': {
    params: { taskId: string }
    response: TranslationTask
  }
  
  'GET /api/translations/:taskId/download': {
    params: { taskId: string }
    response: Blob // EPUB文件
  }
  
  // 任务控制
  'POST /api/translations/:taskId/pause': {
    params: { taskId: string }
    response: { success: boolean }
  }
  
  'POST /api/translations/:taskId/resume': {
    params: { taskId: string }
    response: { success: boolean }
  }
  
  'DELETE /api/translations/:taskId': {
    params: { taskId: string }
    response: { success: boolean }
  }
}
```

### WebSocket事件
```typescript
// Socket.io事件定义
interface SocketEvents {
  // 客户端 → 服务器
  'subscribe': { taskId: string }
  'unsubscribe': { taskId: string }
  
  // 服务器 → 客户端
  'progress': {
    taskId: string
    progress: number
    chapter?: {
      id: string
      title: string
      progress: number
    }
  }
  
  'status': {
    taskId: string
    status: TaskStatus
    error?: string
  }
  
  'complete': {
    taskId: string
    downloadUrl: string
  }
}
```

## 核心功能实现

### EPUB处理流程
```typescript
class EPUBProcessor {
  async parse(buffer: Buffer): Promise<ParsedEPUB> {
    // 1. 解压EPUB文件
    const zip = await JSZip.loadAsync(buffer)
    
    // 2. 读取META-INF/container.xml
    const containerXml = await zip.file('META-INF/container.xml').async('string')
    const rootfilePath = this.extractRootfilePath(containerXml)
    
    // 3. 读取content.opf
    const contentOpf = await zip.file(rootfilePath).async('string')
    const manifest = this.parseManifest(contentOpf)
    const spine = this.parseSpine(contentOpf)
    
    // 4. 按照spine顺序提取章节
    const chapters = await this.extractChapters(zip, manifest, spine)
    
    // 5. 提取图片资源
    const images = await this.extractImages(zip, manifest)
    
    return { chapters, images, metadata }
  }
  
  async rebuild(
    originalEpub: ParsedEPUB,
    translations: Map<string, string>
  ): Promise<Buffer> {
    // 1. 创建新的zip文件
    const zip = new JSZip()
    
    // 2. 复制所有非内容文件
    await this.copyMetaFiles(originalEpub, zip)
    
    // 3. 替换章节内容
    for (const chapter of originalEpub.chapters) {
      const translatedContent = translations.get(chapter.id)
      if (translatedContent) {
        const updatedHtml = this.updateChapterHtml(
          chapter.originalHtml,
          translatedContent
        )
        zip.file(chapter.path, updatedHtml)
      }
    }
    
    // 4. 复制图片资源
    await this.copyImages(originalEpub.images, zip)
    
    // 5. 生成EPUB文件
    return zip.generateAsync({ type: 'nodebuffer' })
  }
}
```

### 翻译队列管理
```typescript
class TranslationQueue {
  private queue: Queue<TranslationJob>
  private workers: Worker[]
  
  constructor(concurrency: number = 3) {
    this.queue = new Queue()
    this.workers = Array(concurrency).fill(null).map(() => new Worker())
  }
  
  async addTask(task: TranslationTask): Promise<void> {
    // 将章节分解为独立任务
    for (const chapter of task.chapters) {
      const job: TranslationJob = {
        taskId: task.id,
        chapterId: chapter.id,
        content: chapter.content,
        style: task.style,
        priority: this.calculatePriority(chapter)
      }
      
      await this.queue.add(job)
    }
    
    // 启动worker处理
    this.workers.forEach(worker => worker.start())
  }
  
  private calculatePriority(chapter: Chapter): number {
    // 优先翻译前面的章节
    return -chapter.order
  }
}

class Worker {
  async processJob(job: TranslationJob): Promise<void> {
    try {
      // 1. 分段
      const chunks = this.chunker.chunk(job.content)
      
      // 2. 翻译每个段落
      const translations = []
      for (const chunk of chunks) {
        const translated = await this.translator.translate(
          chunk,
          job.style
        )
        translations.push(translated)
        
        // 3. 更新进度
        await this.updateProgress(job, chunk.index / chunks.length)
      }
      
      // 4. 合并结果
      const result = translations.join('\n\n')
      await this.saveResult(job, result)
      
    } catch (error) {
      await this.handleError(job, error)
    }
  }
}
```

### 错误处理和恢复
```typescript
class ErrorRecovery {
  private retryConfig = {
    maxAttempts: 3,
    backoffMultiplier: 2,
    initialDelay: 1000
  }
  
  async withRetry<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: Error
    
    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error as Error
        
        if (!this.isRetryable(error)) {
          throw error
        }
        
        if (attempt < this.retryConfig.maxAttempts) {
          const delay = this.calculateDelay(attempt)
          console.log(`Retry ${attempt}/${this.retryConfig.maxAttempts} after ${delay}ms`)
          await this.sleep(delay)
        }
      }
    }
    
    throw new Error(`Operation failed after ${this.retryConfig.maxAttempts} attempts: ${context}`)
  }
  
  private isRetryable(error: any): boolean {
    const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND']
    const retryableStatuses = [429, 502, 503, 504]
    
    return retryableCodes.some(code => error.code === code) ||
           retryableStatuses.includes(error.response?.status)
  }
  
  private calculateDelay(attempt: number): number {
    return this.retryConfig.initialDelay * 
           Math.pow(this.retryConfig.backoffMultiplier, attempt - 1)
  }
}
```

## 性能指标

### 目标指标
- **文件上传**: <5秒 (10MB文件)
- **EPUB解析**: <2秒 (标准EPUB)
- **翻译速度**: 500-1000字/分钟
- **内存使用**: <500MB (大文件处理)
- **并发数**: 3-5个章节同时翻译

### 监控指标
```typescript
interface PerformanceMetrics {
  // 任务级别
  taskStartTime: Date
  taskEndTime?: Date
  totalChapters: number
  completedChapters: number
  failedChapters: number
  
  // 章节级别
  chapterMetrics: {
    chapterId: string
    startTime: Date
    endTime?: Date
    wordCount: number
    apiCalls: number
    retries: number
  }[]
  
  // 系统级别
  memoryUsage: number
  cpuUsage: number
  activeConnections: number
}
```

## 安全措施

### API密钥安全
1. **前端**: 不存储密钥，仅在内存中保持
2. **传输**: HTTPS加密传输
3. **后端**: 不记录密钥，仅用于API调用
4. **过期**: 会话结束后自动清除

### 文件安全
1. **类型验证**: 严格验证EPUB文件格式
2. **大小限制**: 限制上传文件大小（默认50MB）
3. **内容扫描**: 基础恶意内容检测
4. **临时存储**: 24小时后自动删除

### 请求限制
```typescript
const rateLimiter = {
  upload: '5 requests per minute per IP',
  translate: '10 requests per minute per user',
  download: '20 requests per minute per user'
}
```

## 部署配置

### 环境变量
```env
# 服务器配置
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# 安全配置
SESSION_SECRET=your-secret-key
CORS_ORIGIN=https://your-domain.com

# 存储配置
UPLOAD_DIR=/tmp/uploads
MAX_FILE_SIZE=52428800  # 50MB

# API配置
MOONSHOT_API_URL=https://api.moonshot.cn/v1
API_TIMEOUT=30000

# 性能配置
WORKER_CONCURRENCY=3
CHUNK_SIZE=1500
CACHE_TTL=3600
```

### Docker配置
```dockerfile
# 前端构建
FROM node:18-alpine AS frontend-build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 后端构建
FROM node:18-alpine AS backend-build
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# 生产镜像
FROM node:18-alpine
WORKDIR /app
COPY --from=backend-build /app/dist ./dist
COPY --from=backend-build /app/node_modules ./node_modules
COPY --from=frontend-build /app/dist ./public
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

## 测试计划

### 单元测试
- EPUB解析器测试
- 翻译分段算法测试
- API集成测试
- 错误处理测试

### 集成测试
- 文件上传流程
- 完整翻译流程
- WebSocket通信
- 错误恢复机制

### E2E测试
- 用户完整操作流程
- 大文件处理
- 网络异常处理
- 并发测试

### 性能测试
- 负载测试（并发用户）
- 压力测试（大文件）
- 内存泄漏检测
- API响应时间