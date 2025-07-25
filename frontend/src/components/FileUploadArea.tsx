import React, { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import clsx from 'clsx'

interface FileUploadAreaProps {
  onFileUpload: (file: File) => void
  uploadedFile: { id: string; name: string } | null
  onStartTranslation: () => void
  disabled?: boolean
  isTranslating?: boolean
  isTestMode?: boolean
  onTestModeChange?: (testMode: boolean) => void
}

export const FileUploadArea: React.FC<FileUploadAreaProps> = ({
  onFileUpload,
  uploadedFile,
  onStartTranslation,
  disabled = false,
  isTranslating = false,
  isTestMode = false,
  onTestModeChange
}) => {
  const [isDragging, setIsDragging] = useState(false)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (file && file.name.endsWith('.epub')) {
      onFileUpload(file)
    }
  }, [onFileUpload])

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: {
      'application/epub+zip': ['.epub']
    },
    maxFiles: 1,
    disabled: disabled || isTranslating,
    onDragEnter: () => setIsDragging(true),
    onDragLeave: () => setIsDragging(false),
    onDropAccepted: () => setIsDragging(false),
    onDropRejected: () => setIsDragging(false)
  })

  const handleRemoveFile = () => {
    // 这里简化处理，实际可能需要调用API删除服务器上的文件
    window.location.reload()
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">上传 EPUB 文件</h3>
      
      {/* 拖拽上传区 */}
      <div
        {...getRootProps()}
        className={clsx(
          'border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
          {
            'border-gray-300 hover:border-gray-400': !isDragging && !uploadedFile,
            'border-blue-500 bg-blue-50': isDragging,
            'bg-green-50 border-green-300': uploadedFile,
            'cursor-not-allowed opacity-50': disabled || isTranslating
          }
        )}
      >
        <input {...getInputProps()} />
        
        {uploadedFile ? (
          <div>
            <svg className="w-12 h-12 mx-auto mb-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-medium text-gray-900">{uploadedFile.name}</p>
            <p className="text-sm text-gray-500 mt-1">文件已上传</p>
            {!isTranslating && (
              <button 
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemoveFile()
                }}
                className="mt-2 text-sm text-red-600 hover:underline"
              >
                移除文件
              </button>
            )}
          </div>
        ) : (
          <div>
            <svg className="w-12 h-12 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-gray-600">
              拖拽 EPUB 文件到此处，或点击选择文件
            </p>
            <p className="text-xs text-gray-500 mt-1">
              支持最大 50MB 的 EPUB 文件
            </p>
          </div>
        )}
      </div>
      
      {/* 测试模式复选框 */}
      {onTestModeChange && (
        <div className="mt-4 p-3 bg-gray-50 rounded-md">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isTestMode}
              onChange={(e) => onTestModeChange(e.target.checked)}
              disabled={disabled || isTranslating}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
            />
            <div className="flex-1">
              <span className="text-sm font-medium text-gray-700">
                测试模式
              </span>
              <p className="text-xs text-gray-500 mt-1">
                仅翻译前2章节的前5个片段，用于快速测试（约5分钟）
              </p>
            </div>
          </label>
        </div>
      )}
      
      {/* 开始翻译按钮 */}
      <button
        onClick={onStartTranslation}
        disabled={!uploadedFile || disabled || isTranslating}
        className={clsx(
          'w-full mt-4 py-2 px-4 rounded-md font-medium transition-colors',
          {
            'bg-blue-600 text-white hover:bg-blue-700': uploadedFile && !disabled && !isTranslating,
            'bg-gray-200 text-gray-400 cursor-not-allowed': !uploadedFile || disabled || isTranslating
          }
        )}
      >
        {isTranslating ? (
          <span className="flex items-center justify-center">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            翻译中...
          </span>
        ) : (
          '开始翻译'
        )}
      </button>
    </div>
  )
}