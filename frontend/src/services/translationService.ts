import axios from 'axios'
import { APIConfig, TranslationTask } from '@shared/types'

class TranslationService {
  private apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
    timeout: 30000
  })

  async uploadFile(file: File): Promise<{ fileId: string; fileName: string; size: number }> {
    const formData = new FormData()
    formData.append('file', file)

    const response = await this.apiClient.post('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })

    return response.data
  }

  async createTranslationTask(fileId: string, config: APIConfig, testMode: boolean = false): Promise<{ taskId: string }> {
    const response = await this.apiClient.post('/translations', {
      fileId,
      config,
      testMode
    })

    return response.data
  }

  async getTaskStatus(taskId: string): Promise<TranslationTask> {
    const response = await this.apiClient.get(`/translations/${taskId}`)
    return response.data
  }

  async downloadTranslation(taskId: string): Promise<Blob> {
    const response = await this.apiClient.get(`/translations/${taskId}/download`, {
      responseType: 'blob'
    })
    return response.data
  }
}

export const translationService = new TranslationService()