import React, { useState, useEffect } from 'react'
import { APIConfig, TranslationTask, TranslationProgress, LogEntry } from '@shared/types'
import { APIConfigPanel } from './components/APIConfigPanel'
import { FileUploadArea } from './components/FileUploadArea'
import { ProgressPanel } from './components/ProgressPanel'
import { LogPanel } from './components/LogPanel'
import { translationService } from './services/translationService'
import { socketService } from './services/socketService'

function App() {
  const [apiConfig, setApiConfig] = useState<APIConfig>({
    apiKey: '',
    style: 'auto'
  })
  const [uploadedFile, setUploadedFile] = useState<{ id: string; name: string } | null>(null)
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
      addLog('info', `上传文件: ${file.name}`)
      const result = await translationService.uploadFile(file)
      setUploadedFile({ id: result.fileId, name: result.fileName })
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
      
      const task = await translationService.createTranslationTask(
        uploadedFile.id,
        apiConfig,
        isTestMode
      )
      
      setCurrentTask(task)
      addLog('info', `翻译任务已创建: ${task.taskId}${isTestMode ? ' [测试模式]' : ''}`)
      
      if (isTestMode) {
        addLog('info', '测试模式已启用：仅翻译前2章节，每章最多5个片段')
      }

      // 订阅进度更新
      socketService.subscribeToTask(task.taskId, (progress) => {
        setProgress(progress)
        
        if (progress.currentChapter) {
          addLog('info', `正在翻译: ${progress.currentChapter.title} (${progress.currentChapter.progress}%)`)
        }
      })

      // 监听完成事件
      socketService.onTaskComplete(task.taskId, (data) => {
        addLog('info', '翻译完成！')
        setIsTranslating(false)
        // 触发下载
        window.location.href = `/api/translations/${data.taskId}/download`
      })

      // 监听错误事件
      socketService.onTaskError(task.taskId, (error) => {
        addLog('error', `翻译失败: ${error}`)
        setIsTranslating(false)
      })

    } catch (error) {
      addLog('error', `创建任务失败: ${error instanceof Error ? error.message : '未知错误'}`)
      setIsTranslating(false)
    }
  }

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      socketService.disconnect()
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">EPUB 翻译器</h1>
          <p className="text-sm text-gray-600 mt-1">使用 Moonshot AI 将英文 EPUB 翻译成中文</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左侧栏 */}
          <div className="space-y-6">
            <APIConfigPanel 
              config={apiConfig}
              onConfigChange={setApiConfig}
              disabled={isTranslating}
            />
            <FileUploadArea 
              onFileUpload={handleFileUpload}
              uploadedFile={uploadedFile}
              onStartTranslation={handleStartTranslation}
              disabled={isTranslating || !apiConfig.apiKey}
              isTranslating={isTranslating}
              isTestMode={isTestMode}
              onTestModeChange={setIsTestMode}
            />
          </div>

          {/* 右侧栏 */}
          <div className="space-y-6">
            {progress && currentTask && (
              <ProgressPanel 
                task={currentTask}
                progress={progress}
              />
            )}
            <LogPanel logs={logs} />
          </div>
        </div>
      </main>
    </div>
  )
}

export default App