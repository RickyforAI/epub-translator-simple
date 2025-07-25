import { supabase, TranslationTask, ChapterTranslation } from './supabaseClient'
import { RealtimeChannel } from '@supabase/supabase-js'

class RealtimeService {
  private channels: Map<string, RealtimeChannel> = new Map()
  
  subscribeToTask(
    taskId: string,
    onTaskUpdate: (task: TranslationTask) => void,
    onChapterUpdate: (chapter: ChapterTranslation) => void
  ) {
    // 如果已经订阅，先取消
    this.unsubscribeFromTask(taskId)
    
    // 创建新的频道
    const channel = supabase
      .channel(`task-${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'translation_tasks',
          filter: `id=eq.${taskId}`
        },
        (payload) => {
          onTaskUpdate(payload.new as TranslationTask)
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chapter_translations',
          filter: `task_id=eq.${taskId}`
        },
        (payload) => {
          onChapterUpdate(payload.new as ChapterTranslation)
        }
      )
      .subscribe()
    
    this.channels.set(taskId, channel)
  }
  
  unsubscribeFromTask(taskId: string) {
    const channel = this.channels.get(taskId)
    if (channel) {
      channel.unsubscribe()
      this.channels.delete(taskId)
    }
  }
  
  unsubscribeAll() {
    this.channels.forEach(channel => channel.unsubscribe())
    this.channels.clear()
  }
}

export const realtimeService = new RealtimeService()