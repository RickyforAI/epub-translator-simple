import React from 'react'
import { TranslationTask, TranslationProgress } from '@shared/types'
import clsx from 'clsx'

interface ProgressPanelProps {
  task: TranslationTask
  progress: TranslationProgress
}

export const ProgressPanel: React.FC<ProgressPanelProps> = ({ task, progress }) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )
      case 'processing':
        return (
          <svg className="w-5 h-5 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        )
      case 'pending':
        return (
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      case 'error':
        return (
          <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      default:
        return null
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">翻译进度</h3>
      
      {/* 总进度条 */}
      <div className="mb-6">
        <div className="flex justify-between text-sm mb-1">
          <span>总进度</span>
          <span>{progress.progress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-blue-600 h-3 rounded-full transition-all duration-300"
            style={{ width: `${progress.progress}%` }}
          />
        </div>
        <p className="text-sm text-gray-500 mt-1">
          已完成 {progress.completedChapters}/{progress.totalChapters} 章节
        </p>
      </div>
      
      {/* 章节列表 */}
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {task.chapters.map((chapter) => (
          <div key={chapter.chapterId} className="flex items-center space-x-3 py-1">
            <div className="flex-shrink-0">
              {getStatusIcon(chapter.status)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {chapter.chapterTitle}
              </p>
              {chapter.status === 'processing' && (
                <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                  <div
                    className="bg-blue-600 h-1 rounded-full transition-all duration-300"
                    style={{ width: `${chapter.progress}%` }}
                  />
                </div>
              )}
              {chapter.error && (
                <p className="text-xs text-red-600 mt-1">{chapter.error}</p>
              )}
            </div>
            <div className="flex-shrink-0">
              <span className={clsx(
                'text-xs',
                {
                  'text-green-600': chapter.status === 'completed',
                  'text-blue-600': chapter.status === 'processing',
                  'text-gray-400': chapter.status === 'pending',
                  'text-red-600': chapter.status === 'failed'
                }
              )}>
                {chapter.status === 'completed' && '完成'}
                {chapter.status === 'processing' && `${chapter.progress}%`}
                {chapter.status === 'pending' && '等待'}
                {chapter.status === 'failed' && '失败'}
              </span>
            </div>
          </div>
        ))}
      </div>
      
      {/* 下载按钮 */}
      {progress.status === 'completed' && (
        <button 
          onClick={() => window.location.href = `/api/translations/${task.id}/download`}
          className="w-full mt-4 py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
        >
          下载翻译结果
        </button>
      )}
    </div>
  )
}