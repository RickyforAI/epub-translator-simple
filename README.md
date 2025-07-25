# EPUB 翻译器

基于 Moonshot LLM API 的英文 EPUB 电子书翻译工具，支持智能风格识别和实时进度显示。

## 功能特点

- 📚 **EPUB 文件解析和重建**：完整保持原书结构和格式
- 🤖 **智能翻译**：使用 Moonshot AI 大语言模型，支持小说、科普等不同风格
- 📊 **实时进度**：WebSocket 实时推送翻译进度
- 🎯 **智能分段**：自动处理超长章节，保持上下文连贯性
- 🔄 **错误恢复**：自动重试失败段落，确保翻译完整性

## 技术栈

- **前端**：React + TypeScript + Tailwind CSS + Vite
- **后端**：Node.js + Express + TypeScript
- **通信**：Socket.io (WebSocket)
- **EPUB处理**：JSZip + xml2js

## 快速开始

### 1. 克隆项目
```bash
git clone <repository-url>
cd epub-translator
```

### 2. 安装依赖
```bash
npm install
```

### 3. 配置环境变量
```bash
cd backend
cp .env.example .env
# 编辑 .env 文件，配置必要的环境变量
```

### 4. 启动开发服务器
```bash
# 在项目根目录运行
npm run dev
```

这将同时启动：
- 后端服务器：http://localhost:3000
- 前端开发服务器：http://localhost:5173

## 使用说明

1. **获取 Moonshot API Key**
   - 访问 [Moonshot AI](https://platform.moonshot.cn/) 注册账号
   - 创建 API Key

2. **上传 EPUB 文件**
   - 在界面中输入 API Key
   - 拖拽或选择 EPUB 文件上传（最大 50MB）

3. **选择翻译风格**
   - 自动检测：系统自动识别内容类型
   - 小说文学：适合文学作品翻译
   - 科普学术：适合科技文章翻译
   - 通用：标准翻译模式

4. **开始翻译**
   - 点击"开始翻译"按钮
   - 实时查看翻译进度
   - 完成后自动下载翻译结果

## 项目结构

```
epub-translator/
├── frontend/               # React 前端
│   ├── src/
│   │   ├── components/    # UI 组件
│   │   ├── services/      # API 服务
│   │   └── App.tsx        # 主应用
│   └── package.json
├── backend/               # Node.js 后端
│   ├── src/
│   │   ├── api/          # REST API 路由
│   │   ├── services/     # 业务逻辑
│   │   └── index.ts      # 服务器入口
│   └── package.json
├── shared/               # 共享类型定义
│   └── types/
└── package.json         # 根配置文件
```

## API 文档

### 文件上传
```
POST /api/files/upload
Content-Type: multipart/form-data
Body: file (EPUB文件)

Response: {
  fileId: string,
  fileName: string,
  size: number
}
```

### 创建翻译任务
```
POST /api/translations
Body: {
  fileId: string,
  config: {
    apiKey: string,
    style?: 'fiction' | 'science' | 'general' | 'auto'
  }
}

Response: {
  taskId: string
}
```

### 获取任务状态
```
GET /api/translations/:taskId

Response: TranslationTask
```

### 下载翻译结果
```
GET /api/translations/:taskId/download

Response: EPUB文件 (二进制)
```

### WebSocket 事件

**客户端发送**：
- `subscribe`: 订阅任务进度
- `unsubscribe`: 取消订阅

**服务器推送**：
- `progress`: 翻译进度更新
- `status`: 任务状态变化
- `complete`: 翻译完成通知

## 开发指南

### 构建生产版本
```bash
npm run build
```

### 运行测试
```bash
npm test
```

### 代码规范
```bash
npm run lint
npm run typecheck
```

## 部署

### Docker 部署
```bash
docker build -t epub-translator .
docker run -p 3000:3000 -e NODE_ENV=production epub-translator
```

### 环境变量说明
- `NODE_ENV`: 运行环境 (development/production)
- `PORT`: 服务器端口（默认 3000）
- `MOONSHOT_API_URL`: Moonshot API 地址
- `MAX_FILE_SIZE`: 最大文件大小（字节）
- `WORKER_CONCURRENCY`: 并发翻译章节数

## 注意事项

1. **API 使用限制**
   - Moonshot API 有速率限制，默认配置为每分钟 10 次请求
   - 大文件翻译可能需要较长时间

2. **文件大小限制**
   - 默认最大支持 50MB 的 EPUB 文件
   - 可通过环境变量 `MAX_FILE_SIZE` 调整

3. **翻译质量**
   - 翻译质量依赖于 Moonshot 模型能力
   - 建议对重要内容进行人工校对

## 故障排除

### 常见问题

1. **上传失败**
   - 检查文件格式是否为标准 EPUB
   - 确认文件大小未超过限制

2. **翻译中断**
   - 检查 API Key 是否有效
   - 确认网络连接正常
   - 查看服务器日志获取详细错误信息

3. **下载失败**
   - 确保翻译任务已完成
   - 检查浏览器下载设置

## 贡献指南

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License