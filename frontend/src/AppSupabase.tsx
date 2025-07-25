import { useState, useEffect } from 'react'
import { APIConfig, TranslationTask, TranslationProgress, LogEntry } from '@shared/types'
import { APIConfigPanel } from './components/APIConfigPanel'
import { FileUploadArea } from './components/FileUploadArea'
import { ProgressPanel } from './components/ProgressPanel'
import { LogPanel } from './components/LogPanel'
import { supabaseTranslationService } from './services/supabaseTranslationService'

function AppSupabase() {
  const [apiConfig, setApiConfig] = useState<APIConfig>({
    apiKey: '',
    style: 'auto'
  })
  const [uploadedFile, setUploadedFile] = useState<{ id: string; name: string; url: string } | null>(null)
  const [currentTask, setCurrentTask] = useState<TranslationTask | null>(null)
  const [progress, setProgress] = useState<TranslationProgress | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isTranslating, setIsTranslating] = useState(false)
  const [isTestMode, setIsTestMode] = useState(false)

  // 添加日志
  const addLog = (level: LogEntry['level'], message: string) => {
    const log: LogEntry = {
      id: Date.now().toString(),
      timestamp: new Date(),
      level,
      message
    }
    setLogs(prev => [...prev, log])
  }

  // 处理文件上传
  const handleFileUpload = async (file: File) => {
    try {
      addLog('info', `上传文件到 Supabase: ${file.name}`)
      const result = await supabaseTranslationService.uploadFile(file)
      setUploadedFile({ 
        id: result.fileId, 
        name: result.fileName, 
        url: result.fileUrl 
      })
      addLog('info', '文件上传成功')
    } catch (error) {
      addLog('error', `文件上传失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  // 开始翻译
  const handleStartTranslation = async () => {
    if (!uploadedFile || !apiConfig.apiKey) {
      addLog('error', '请先上传文件并配置API Key')
      return
    }

    try {
      setIsTranslating(true)
      addLog('info', '开始创建翻译任务...')
      
      // 创建翻译任务
      const taskId = await supabaseTranslationService.createTranslationTask(
        uploadedFile.id,
        uploadedFile.name,
        uploadedFile.url,
        apiConfig,
        isTestMode
      )
      
      // 获取完整的任务详情
      const task = await supabaseTranslationService.getTaskStatus(taskId)
      setCurrentTask(task as TranslationTask)
      addLog('info', `翻译任务已创建: ${taskId}${isTestMode ? ' [测试模式]' : ''}`)
      
      if (isTestMode) {
        addLog('info', '测试模式已启用：仅翻译前2章节，每章最多5个片段')
      }

      // 订阅任务更新
      const unsubscribe = supabaseTranslationService.subscribeToTask(
        taskId,
        (updatedTask) => {
          // 更新任务状态
          setCurrentTask(updatedTask as TranslationTask)
          
          // 更新进度
          const newProgress: TranslationProgress = {
            totalChapters: updatedTask.total_chapters,
            completedChapters: updatedTask.completed_chapters,
            currentChapter: null,
            overallProgress: updatedTask.progress
          }
          setProgress(newProgress)

          // 任务完成
          if (updatedTask.status === 'completed') {
            addLog('info', '翻译完成！')
            setIsTranslating(false)
            // 下载文件
            handleDownload(taskId)
          } else if (updatedTask.status === 'failed') {
            addLog('error', `翻译失败: ${updatedTask.error || '未知错误'}`)
            setIsTranslating(false)
          }
        },
        (chapterUpdate) => {
          // 更新章节进度
          if (chapterUpdate.status === 'processing') {
            addLog('info', `正在翻译: ${chapterUpdate.chapter_title} (${chapterUpdate.progress}%)`)
          }
        }
      )

      // 保存取消订阅函数
      (window as any).unsubscribeTranslation = unsubscribe

    } catch (error) {
      addLog('error', `创建任务失败: ${error instanceof Error ? error.message : '未知错误'}`)
      setIsTranslating(false)
    }
  }

  // 下载翻译结果
  const handleDownload = async (taskId: string) => {
    try {
      addLog('info', '开始下载翻译结果...')
      const blob = await supabaseTranslationService.downloadTranslation(taskId)
      
      // 创建下载链接
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `translated_${uploadedFile?.name || 'book.epub'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      addLog('info', '下载完成')
    } catch (error) {
      addLog('error', `下载失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      // 取消订阅
      if ((window as any).unsubscribeTranslation) {
        (window as any).unsubscribeTranslation()
      }
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-6 max-w-4xl">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">
          EPUB 中英翻译器 (Supabase 版)
        </h1>

        <div className="space-y-6">
          {/* API 配置 */}
          <APIConfigPanel 
            config={apiConfig} 
            onConfigChange={setApiConfig}
          />

          {/* 文件上传 */}
          <FileUploadArea
            onFileUpload={handleFileUpload}
            isUploading={false}
            uploadedFile={uploadedFile}
          />

          {/* 翻译控制 */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">翻译控制</h2>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={isTestMode}
                  onChange={(e) => setIsTestMode(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span className="text-sm text-gray-600">测试模式</span>
              </label>
            </div>
            <button
              onClick={handleStartTranslation}
              disabled={!uploadedFile || !apiConfig.apiKey || isTranslating}
              className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isTranslating ? '翻译中...' : '开始翻译'}
            </button>
          </div>

          {/* 进度显示 */}
          {progress && currentTask && (
            <ProgressPanel 
              progress={progress}
              task={currentTask}
            />
          )}

          {/* 日志显示 */}
          <LogPanel logs={logs} />
        </div>
      </div>
    </div>
  )
}

export default AppSupabase