import React from 'react'
import { APIConfig, ContentStyle } from '@shared/types'

interface APIConfigPanelProps {
  config: APIConfig
  onConfigChange: (config: APIConfig) => void
  disabled?: boolean
}

export const APIConfigPanel: React.FC<APIConfigPanelProps> = ({
  config,
  onConfigChange,
  disabled = false
}) => {
  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onConfigChange({
      ...config,
      apiKey: e.target.value
    })
  }

  const handleStyleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onConfigChange({
      ...config,
      style: e.target.value as ContentStyle
    })
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">API 配置</h3>
      
      {/* API Key 输入 */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Moonshot API Key
        </label>
        <input
          type="password"
          placeholder="请输入您的 API Key"
          value={config.apiKey}
          onChange={handleApiKeyChange}
          disabled={disabled}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
        />
        <p className="text-xs text-gray-500 mt-1">
          API Key 仅保存在本地，不会上传到服务器
        </p>
      </div>
      
      {/* 风格选择 */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          翻译风格
        </label>
        <select 
          value={config.style}
          onChange={handleStyleChange}
          disabled={disabled}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
        >
          <option value="auto">自动检测</option>
          <option value="fiction">小说文学</option>
          <option value="science">科普学术</option>
          <option value="general">通用</option>
        </select>
        <p className="text-xs text-gray-500 mt-1">
          系统会根据内容特征自动选择最合适的翻译风格
        </p>
      </div>
      
      {/* 高级选项（折叠） */}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-blue-600 hover:text-blue-700">
          高级选项
        </summary>
        <div className="mt-2 space-y-2 text-sm text-gray-600">
          <p>• 上下文窗口：自动启用</p>
          <p>• 批处理大小：3章节并发</p>
          <p>• 重试策略：自动重试失败段落</p>
        </div>
      </details>
    </div>
  )
}