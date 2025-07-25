import { Router } from 'express'
import { Server } from 'socket.io'
import fs from 'fs/promises'
import { TranslationTask, TranslationProgress, APIConfig } from '@shared/types'
import { AppError } from '../utils/errorHandler'
import { createLogger } from '../utils/logger'
import { EPUBProcessor } from '../services/epubService'
import { taskManager } from '../services/translationService'
import { getFilePath, updateFileStatus } from './files'
import { broadcastProgress, broadcastStatus, broadcastComplete } from '../services/socketService'

const logger = createLogger('translationAPI')
const router = Router()

// Socket.io 实例
let io: Server | null = null

// 设置Socket服务器（从index.ts调用）
export function setSocketServer(socketServer: Server) {
  io = socketServer
}

// 创建翻译任务
router.post('/', async (req, res, next) => {
  try {
    const { fileId, config, testMode }: { fileId: string; config: APIConfig; testMode?: boolean } = req.body

    if (!fileId || !config?.apiKey) {
      throw new AppError(400, '缺少必要参数')
    }

    // 读取EPUB文件
    const filePath = getFilePath(fileId)
    const fileBuffer = await fs.readFile(filePath)

    // 更新文件状态
    updateFileStatus(fileId, 'parsing')

    // 解析EPUB
    const epubProcessor = new EPUBProcessor()
    const parsedEpub = await epubProcessor.parse(fileBuffer)

    // 创建翻译任务
    const task = taskManager.createTask(fileId, parsedEpub.chapters)

    logger.info('创建翻译任务', {
      taskId: task.id,
      fileId,
      chapters: parsedEpub.chapters.length
    })

    // 异步开始翻译
    startTranslationAsync(task.id, config, parsedEpub, fileId)

    res.json({ taskId: task.id })
  } catch (error) {
    next(error)
  }
})

// 获取任务状态
router.get('/:taskId', async (req, res, next) => {
  try {
    const task = taskManager.getTask(req.params.taskId)
    if (!task) {
      throw new AppError(404, '任务不存在')
    }

    res.json(task)
  } catch (error) {
    next(error)
  }
})

// 下载翻译结果
router.get('/:taskId/download', async (req, res, next) => {
  try {
    const task = taskManager.getTask(req.params.taskId)
    if (!task) {
      throw new AppError(404, '任务不存在')
    }

    if (task.status !== 'completed') {
      throw new AppError(400, '翻译尚未完成')
    }

    // 获取原始EPUB
    const filePath = getFilePath(task.fileId)
    const fileBuffer = await fs.readFile(filePath)
    
    // 解析EPUB
    const epubProcessor = new EPUBProcessor()
    const parsedEpub = await epubProcessor.parse(fileBuffer)

    // 获取翻译结果
    const translations = taskManager.getTranslations(task.id)

    // 重建EPUB
    const translatedEpub = await epubProcessor.rebuild(parsedEpub, translations)

    // 设置响应头
    res.setHeader('Content-Type', 'application/epub+zip')
    res.setHeader('Content-Disposition', `attachment; filename="translated_${task.fileId}.epub"`)
    
    res.send(translatedEpub)
  } catch (error) {
    next(error)
  }
})

// 异步翻译处理
async function startTranslationAsync(
  taskId: string,
  config: APIConfig,
  parsedEpub: any,
  fileId: string
): Promise<void> {
  try {
    updateFileStatus(fileId, 'translating')

    await taskManager.startTranslation(
      taskId,
      config.apiKey,
      config.style || 'auto',
      (task) => {
        // 广播进度更新
        const progress: TranslationProgress = {
          taskId: task.id,
          progress: task.progress,
          status: task.status,
          completedChapters: task.chapters.filter(ch => ch.status === 'completed').length,
          totalChapters: task.chapters.length
        }

        // 找到当前正在处理的章节
        const currentChapter = task.chapters.find(ch => ch.status === 'processing')
        if (currentChapter) {
          progress.currentChapter = {
            id: currentChapter.chapterId,
            title: currentChapter.chapterTitle,
            progress: currentChapter.progress
          }
        }

        if (io) {
          broadcastProgress(io, progress)
        }
      }
    )

    // 翻译完成
    updateFileStatus(fileId, 'completed')
    
    if (io) {
      broadcastComplete(io, taskId, `/api/translations/${taskId}/download`)
    }

    logger.info('翻译任务完成', { taskId })
  } catch (error) {
    logger.error('翻译任务失败', { taskId, error })
    
    updateFileStatus(fileId, 'error')
    
    if (io) {
      broadcastStatus(io, taskId, 'failed', error instanceof Error ? error.message : '未知错误')
    }
  }
}

export { router as translationRouter }