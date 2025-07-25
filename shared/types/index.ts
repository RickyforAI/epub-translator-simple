// 共享类型定义
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
  chapterTitle: string
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

export interface TranslationProgress {
  taskId: string
  progress: number
  status: TaskStatus
  currentChapter?: {
    id: string
    title: string
    progress: number
  }
  completedChapters: number
  totalChapters: number
}

export interface LogEntry {
  id: string
  timestamp: Date
  level: 'info' | 'warning' | 'error'
  message: string
  context?: any
}