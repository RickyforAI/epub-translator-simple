import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import dotenv from 'dotenv'
import path from 'path'
import { fileRouter } from './api/files'
import { translationRouter, setSocketServer } from './api/translations'
import { setupSocketHandlers } from './services/socketService'
import { logger } from './utils/logger'
import { errorHandler } from './utils/errorHandler'
import fs from 'fs'

// 加载环境变量
dotenv.config()

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
})

// 设置Socket服务器到翻译API
setSocketServer(io)

// 创建必要的目录
const createDirectories = () => {
  const dirs = [
    process.env.UPLOAD_DIR || './uploads',
    './logs'
  ]
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
      logger.info(`创建目录: ${dir}`)
    }
  })
}

createDirectories()

// 中间件
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 静态文件服务（生产环境）
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/dist')))
}

// API路由
app.use('/api/files', fileRouter)
app.use('/api/translations', translationRouter)

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  })
})

// Socket.io 处理
setupSocketHandlers(io)

// 错误处理
app.use(errorHandler)

// 404处理
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' })
})

// 启动服务器
const PORT = parseInt(process.env.PORT || '3000')
const HOST = process.env.HOST || '0.0.0.0'

httpServer.listen(PORT, HOST, () => {
  logger.info(`Server is running on http://${HOST}:${PORT}`)
  logger.info(`Environment: ${process.env.NODE_ENV}`)
  logger.info(`CORS Origin: ${process.env.CORS_ORIGIN || 'http://localhost:5173'}`)
})