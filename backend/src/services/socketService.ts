import { Server, Socket } from 'socket.io'
import { TranslationProgress } from '@shared/types'
import { createLogger } from '../utils/logger'

const logger = createLogger('socketService')

interface ClientInfo {
  socketId: string
  taskId?: string
  connectedAt: Date
}

class SocketManager {
  private clients: Map<string, ClientInfo> = new Map()
  private taskSubscriptions: Map<string, Set<string>> = new Map()

  addClient(socketId: string): void {
    this.clients.set(socketId, {
      socketId,
      connectedAt: new Date()
    })
    logger.info(`客户端连接: ${socketId}`)
  }

  removeClient(socketId: string): void {
    const client = this.clients.get(socketId)
    if (client?.taskId) {
      this.unsubscribeFromTask(socketId, client.taskId)
    }
    this.clients.delete(socketId)
    logger.info(`客户端断开: ${socketId}`)
  }

  subscribeToTask(socketId: string, taskId: string): void {
    const client = this.clients.get(socketId)
    if (!client) return

    // 更新客户端信息
    client.taskId = taskId

    // 添加到任务订阅列表
    if (!this.taskSubscriptions.has(taskId)) {
      this.taskSubscriptions.set(taskId, new Set())
    }
    this.taskSubscriptions.get(taskId)!.add(socketId)

    logger.info(`客户端 ${socketId} 订阅任务 ${taskId}`)
  }

  unsubscribeFromTask(socketId: string, taskId: string): void {
    const subscribers = this.taskSubscriptions.get(taskId)
    if (subscribers) {
      subscribers.delete(socketId)
      if (subscribers.size === 0) {
        this.taskSubscriptions.delete(taskId)
      }
    }

    const client = this.clients.get(socketId)
    if (client) {
      client.taskId = undefined
    }

    logger.info(`客户端 ${socketId} 取消订阅任务 ${taskId}`)
  }

  getTaskSubscribers(taskId: string): string[] {
    const subscribers = this.taskSubscriptions.get(taskId)
    return subscribers ? Array.from(subscribers) : []
  }
}

const socketManager = new SocketManager()

export function setupSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    socketManager.addClient(socket.id)

    // 订阅任务进度
    socket.on('subscribe', ({ taskId }: { taskId: string }) => {
      socketManager.subscribeToTask(socket.id, taskId)
      socket.join(`task:${taskId}`)
    })

    // 取消订阅
    socket.on('unsubscribe', ({ taskId }: { taskId: string }) => {
      socketManager.unsubscribeFromTask(socket.id, taskId)
      socket.leave(`task:${taskId}`)
    })

    // 断开连接
    socket.on('disconnect', () => {
      socketManager.removeClient(socket.id)
    })

    // 错误处理
    socket.on('error', (error) => {
      logger.error('Socket错误', { socketId: socket.id, error })
    })
  })
}

// 进度广播函数
export function broadcastProgress(io: Server, progress: TranslationProgress): void {
  io.to(`task:${progress.taskId}`).emit('progress', progress)
  
  logger.debug('广播进度更新', {
    taskId: progress.taskId,
    progress: progress.progress,
    subscribers: socketManager.getTaskSubscribers(progress.taskId).length
  })
}

// 状态更新广播
export function broadcastStatus(
  io: Server,
  taskId: string,
  status: string,
  error?: string
): void {
  io.to(`task:${taskId}`).emit('status', {
    taskId,
    status,
    error
  })
}

// 完成通知
export function broadcastComplete(
  io: Server,
  taskId: string,
  downloadUrl: string
): void {
  io.to(`task:${taskId}`).emit('complete', {
    taskId,
    downloadUrl
  })
}