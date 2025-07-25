# EPUB翻译器 - 系统架构设计

## 项目概述
一个基于Moonshot LLM API的EPUB英译中翻译器MVP，支持风格识别、分段处理和进度显示。

## 核心需求
1. **翻译功能**：英文EPUB → 中文EPUB
2. **LLM集成**：调用Moonshot API进行翻译
3. **风格适配**：根据内容类型（小说/科普）调整提示词
4. **分段处理**：处理大文件，保持图片位置
5. **用户界面**：API配置、文件上传/下载、进度显示

## 系统架构

### 技术栈选择
- **前端**：React + TypeScript（组件化开发，便于调试）
- **后端**：Node.js + Express（处理文件和API调用）
- **EPUB处理**：epub.js 或 node-epub-parser
- **状态管理**：React Context（MVP简单够用）
- **样式**：Tailwind CSS（快速开发）

### 架构图
```
┌─────────────────────────────────────────────────────┐
│                    前端界面                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ API配置面板  │  │ 文件上传区   │  │ 进度显示窗  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
└────────────────────────┬────────────────────────────┘
                         │ HTTP/WebSocket
┌────────────────────────┴────────────────────────────┐
│                    后端服务                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ API路由层   │  │ 业务逻辑层   │  │ 数据处理层  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
│         │                 │                 │        │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐ │
│  │ 文件上传API │  │ EPUB处理器  │  │ 翻译管理器  │ │
│  │ 下载API     │  │ 内容解析器  │  │ 进度追踪器  │ │
│  │ 状态API     │  │ 风格识别器  │  │ 错误处理器  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
└────────────────────────┬────────────────────────────┘
                         │
                  ┌──────┴──────┐
                  │ Moonshot API │
                  └─────────────┘
```

## 核心组件设计

### 1. EPUB处理器
```typescript
interface EPUBProcessor {
  parse(file: Buffer): Promise<EPUBContent>
  extractChapters(): Chapter[]
  preserveImages(): ImageMap
  rebuild(translatedContent: TranslatedContent): Buffer
}

interface Chapter {
  id: string
  title: string
  content: string
  images: Image[]
  metadata: ChapterMetadata
}
```

### 2. 翻译管理器
```typescript
interface TranslationManager {
  // 配置API
  setAPIKey(key: string): void
  
  // 风格识别
  detectStyle(content: string): ContentStyle
  
  // 构建提示词
  buildPrompt(text: string, style: ContentStyle): string
  
  // 分段翻译
  translateChunk(chunk: string, style: ContentStyle): Promise<string>
  
  // 批量处理
  translateChapters(chapters: Chapter[]): AsyncGenerator<TranslationProgress>
}

type ContentStyle = 'fiction' | 'science' | 'general'

interface TranslationProgress {
  chapterId: string
  progress: number
  status: 'pending' | 'processing' | 'completed' | 'error'
  result?: string
  error?: string
}
```

### 3. 提示词策略
```typescript
const PROMPT_TEMPLATES = {
  fiction: {
    system: "你是一位专业的文学翻译家，擅长翻译英文小说。请保持原文的文学性、情感色彩和叙事风格。",
    user: "请将以下英文小说段落翻译成中文，保持人物对话的语气特点和叙事节奏：\n\n{text}"
  },
  science: {
    system: "你是一位专业的科技翻译专家，擅长翻译科普类文章。请确保专业术语准确，逻辑清晰。",
    user: "请将以下科普内容翻译成中文，保持专业性和准确性：\n\n{text}"
  },
  general: {
    system: "你是一位专业翻译，请准确、流畅地翻译内容。",
    user: "请将以下内容翻译成中文：\n\n{text}"
  }
}
```

### 4. 分段策略
```typescript
interface ChunkingStrategy {
  // 最大字符数（考虑API限制）
  maxChunkSize: 2000
  
  // 智能分段（按段落、句子边界）
  smartSplit(text: string): string[]
  
  // 上下文保持
  preserveContext: boolean
  contextOverlap: 200 // 字符
}
```

## API设计

### 后端API端点
```typescript
// 文件上传
POST /api/upload
Body: FormData { file: File }
Response: { fileId: string, fileName: string, size: number }

// 开始翻译
POST /api/translate
Body: { 
  fileId: string,
  apiKey: string,
  style?: ContentStyle,
  options?: TranslationOptions
}
Response: { taskId: string }

// 获取进度
GET /api/progress/:taskId
Response: { 
  progress: number,
  status: string,
  chapters: ChapterProgress[]
}

// 下载结果
GET /api/download/:taskId
Response: Binary (translated EPUB file)

// WebSocket进度推送
WS /ws/progress/:taskId
Message: { type: 'progress', data: ProgressUpdate }
```

## 前端组件结构

```typescript
// 主应用组件
<App>
  <Header />
  <MainContent>
    <ConfigPanel>
      <APIKeyInput />
      <StyleSelector />
    </ConfigPanel>
    
    <UploadArea>
      <FileDropzone />
      <FileInfo />
    </UploadArea>
    
    <ProgressPanel>
      <ProgressBar />
      <ChapterList />
      <LogWindow />
    </ProgressPanel>
    
    <DownloadSection>
      <DownloadButton />
    </DownloadSection>
  </MainContent>
</App>
```

## 错误处理策略

1. **API错误**：自动重试机制（3次），降级处理
2. **文件错误**：格式验证，用户友好提示
3. **网络错误**：断点续传，进度保存
4. **翻译错误**：单章节失败不影响整体，标记失败章节

## 性能优化

1. **并发控制**：限制同时翻译的章节数（建议3-5个）
2. **缓存机制**：相同内容不重复翻译
3. **流式处理**：大文件不全部加载到内存
4. **进度持久化**：浏览器刷新不丢失进度

## MVP功能边界

### 包含功能
- ✅ 基础EPUB解析和重建
- ✅ Moonshot API集成
- ✅ 简单风格识别（基于关键词）
- ✅ 分段翻译和进度显示
- ✅ 图片位置保持
- ✅ 基础错误处理

### 暂不包含
- ❌ 复杂格式支持（仅支持标准EPUB）
- ❌ 多语言支持（仅英译中）
- ❌ 高级风格定制
- ❌ 用户账号系统
- ❌ 翻译历史记录

## 开发计划

1. **第一阶段**：搭建基础框架，实现文件上传下载
2. **第二阶段**：集成EPUB解析，实现内容提取
3. **第三阶段**：集成Moonshot API，实现基础翻译
4. **第四阶段**：添加风格识别和提示词优化
5. **第五阶段**：完善UI和错误处理

## 测试策略

1. 使用提供的小EPUB文件进行功能验证
2. Mock API进行前端开发
3. 分模块单元测试
4. 端到端集成测试