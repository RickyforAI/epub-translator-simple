import { supabase } from './supabaseClient'
import { APIConfig } from '@shared/types'

export class SupabaseTranslationService {
  // 上传文件到 Supabase Storage
  async uploadFile(file: File): Promise<{ fileId: string; fileName: string; fileUrl: string }> {
    const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const fileName = file.name
    const filePath = `uploads/${fileId}/${fileName}`

    // 上传到 Supabase Storage
    const { error } = await supabase.storage
      .from('epub-files')
      .upload(filePath, file)

    if (error) {
      throw new Error(`文件上传失败: ${error.message}`)
    }

    // 获取公开 URL
    const { data: { publicUrl } } = supabase.storage
      .from('epub-files')
      .getPublicUrl(filePath)

    return {
      fileId,
      fileName,
      fileUrl: publicUrl
    }
  }

  // 创建翻译任务
  async createTranslationTask(
    fileId: string,
    fileName: string,
    fileUrl: string,
    config: APIConfig,
    testMode: boolean = false
  ): Promise<string> {
    const { data, error } = await supabase
      .from('translation_tasks')
      .insert({
        file_id: fileId,
        file_name: fileName,
        file_url: fileUrl,
        file_size: 0, // 可以从 file 对象获取
        status: 'pending',
        progress: 0,
        total_chapters: 0,
        completed_chapters: 0,
        api_config: {
          style: config.style,
          moonshot_key: config.apiKey,
          test_mode: testMode
        }
      })
      .select()
      .single()

    if (error) {
      throw new Error(`创建任务失败: ${error.message}`)
    }

    // 调用 Edge Function 开始翻译
    const { error: functionError } = await supabase.functions.invoke('translate-epub', {
      body: {
        taskId: data.id,
        apiKey: config.apiKey,
        testMode
      }
    })

    if (functionError) {
      console.error('Edge Function 调用失败:', functionError)
      // 不抛出错误，因为任务已创建，可以通过其他方式启动翻译
    }

    return data.id
  }

  // 获取任务状态
  async getTaskStatus(taskId: string) {
    const { data, error } = await supabase
      .from('translation_tasks')
      .select('*')
      .eq('id', taskId)
      .single()

    if (error) {
      throw new Error(`获取任务状态失败: ${error.message}`)
    }

    return data
  }

  // 获取章节翻译状态
  async getChapterTranslations(taskId: string) {
    const { data, error } = await supabase
      .from('chapter_translations')
      .select('*')
      .eq('task_id', taskId)
      .order('chapter_id', { ascending: true })

    if (error) {
      throw new Error(`获取章节状态失败: ${error.message}`)
    }

    return data
  }

  // 下载翻译结果
  async downloadTranslation(taskId: string): Promise<Blob> {
    // 获取任务信息
    const task = await this.getTaskStatus(taskId)
    
    if (!task.result_url) {
      throw new Error('翻译结果还未准备好')
    }

    // 从 Storage 下载文件
    const urlParts = task.result_url.split('/').slice(-2) // 获取 bucket 和文件路径
    const { data, error } = await supabase.storage
      .from('epub-results')
      .download(urlParts.join('/'))

    if (error) {
      throw new Error(`下载失败: ${error.message}`)
    }

    return data
  }

  // 订阅任务更新
  subscribeToTask(
    taskId: string,
    onUpdate: (task: any) => void,
    onChapterUpdate: (chapter: any) => void
  ) {
    // 订阅任务表更新
    const taskChannel = supabase
      .channel(`task-${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'translation_tasks',
          filter: `id=eq.${taskId}`
        },
        (payload: any) => {
          onUpdate(payload.new)
        }
      )
      .subscribe()

    // 订阅章节表更新
    const chapterChannel = supabase
      .channel(`chapters-${taskId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chapter_translations',
          filter: `task_id=eq.${taskId}`
        },
        (payload: any) => {
          onChapterUpdate(payload.new)
        }
      )
      .subscribe()

    // 返回取消订阅函数
    return () => {
      taskChannel.unsubscribe()
      chapterChannel.unsubscribe()
    }
  }
}

export const supabaseTranslationService = new SupabaseTranslationService()