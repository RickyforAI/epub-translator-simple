import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 类型定义
export interface TranslationTask {
  id: string
  file_id: string
  file_name: string
  file_size: number
  file_url: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  total_chapters: number
  completed_chapters: number
  api_config: {
    style: 'fiction' | 'science' | 'general' | 'auto'
  }
  created_at: string
  updated_at: string
  completed_at?: string
  error?: string
  result_url?: string
}

export interface ChapterTranslation {
  id: string
  task_id: string
  chapter_id: string
  chapter_title: string
  original_text: string
  translated_text?: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  word_count: number
  error?: string
  created_at: string
  updated_at: string
}