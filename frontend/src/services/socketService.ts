import { io, Socket } from 'socket.io-client'
import { TranslationProgress } from '@shared/types'

class SocketService {
  private socket: Socket | null = null
  private progressCallbacks: Map<string, (progress: TranslationProgress) => void> = new Map()
  private completeCallbacks: Map<string, (data: any) => void> = new Map()
  private errorCallbacks: Map<string, (error: string) => void> = new Map()

  connect() {
    if (this.socket?.connected) return

    const wsUrl = import.meta.env.VITE_WS_URL || ''
    this.socket = io(wsUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    })

    this.socket.on('connect', () => {
      console.log('WebSocket connected')
    })

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected')
    })

    this.socket.on('progress', (progress: TranslationProgress) => {
      const callback = this.progressCallbacks.get(progress.taskId)
      if (callback) {
        callback(progress)
      }
    })

    this.socket.on('complete', (data: { taskId: string; downloadUrl: string }) => {
      const callback = this.completeCallbacks.get(data.taskId)
      if (callback) {
        callback(data)
      }
    })

    this.socket.on('status', (data: { taskId: string; status: string; error?: string }) => {
      if (data.status === 'failed' && data.error) {
        const callback = this.errorCallbacks.get(data.taskId)
        if (callback) {
          callback(data.error)
        }
      }
    })

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error)
    })
  }

  subscribeToTask(
    taskId: string, 
    onProgress: (progress: TranslationProgress) => void
  ) {
    if (!this.socket) {
      this.connect()
    }

    this.progressCallbacks.set(taskId, onProgress)
    this.socket?.emit('subscribe', { taskId })
  }

  onTaskComplete(taskId: string, callback: (data: any) => void) {
    this.completeCallbacks.set(taskId, callback)
  }

  onTaskError(taskId: string, callback: (error: string) => void) {
    this.errorCallbacks.set(taskId, callback)
  }

  unsubscribeFromTask(taskId: string) {
    this.progressCallbacks.delete(taskId)
    this.completeCallbacks.delete(taskId)
    this.errorCallbacks.delete(taskId)
    this.socket?.emit('unsubscribe', { taskId })
  }

  disconnect() {
    this.socket?.disconnect()
    this.socket = null
    this.progressCallbacks.clear()
    this.completeCallbacks.clear()
    this.errorCallbacks.clear()
  }
}

export const socketService = new SocketService()