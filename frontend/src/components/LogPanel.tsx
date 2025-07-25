import React, { useRef, useEffect } from 'react'
import { LogEntry } from '@shared/types'
import clsx from 'clsx'

interface LogPanelProps {
  logs: LogEntry[]
}

export const LogPanel: React.FC<LogPanelProps> = ({ logs }) => {
  const logEndRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    // 自动滚动到最新日志
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])
  
  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('zh-CN')
  }
  
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <h4 className="text-sm font-semibold mb-2">系统日志</h4>
      <div className="bg-white rounded border border-gray-200 h-32 overflow-y-auto p-2 font-mono text-xs">
        {logs.length === 0 ? (
          <p className="text-gray-400">暂无日志</p>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className={clsx(
                'mb-1',
                {
                  'text-red-600': log.level === 'error',
                  'text-yellow-600': log.level === 'warning',
                  'text-gray-600': log.level === 'info'
                }
              )}
            >
              <span className="text-gray-400">
                [{formatTime(log.timestamp)}]
              </span>
              {' '}
              <span>{log.message}</span>
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  )
}