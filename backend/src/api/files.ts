import { Router } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import fs from 'fs/promises'
import { EPUBFile, FileStatus } from '@shared/types'
import { AppError } from '../utils/errorHandler'
import { createLogger } from '../utils/logger'

const logger = createLogger('fileAPI')
const router = Router()

// 配置文件上传
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || './uploads'
    await fs.mkdir(uploadDir, { recursive: true })
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const fileId = uuidv4()
    const ext = path.extname(file.originalname)
    cb(null, `${fileId}${ext}`)
  }
})

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800') // 50MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/epub+zip' && !file.originalname.endsWith('.epub')) {
      cb(new AppError(400, '只支持EPUB文件'))
      return
    }
    cb(null, true)
  }
})

// 文件存储（简化版，实际应使用数据库）
const fileStore = new Map<string, EPUBFile>()

// 上传文件
router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError(400, '请选择文件')
    }

    const fileId = path.basename(req.file.filename, path.extname(req.file.filename))
    const epubFile: EPUBFile = {
      id: fileId,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      uploadTime: new Date(),
      status: 'uploaded'
    }

    fileStore.set(fileId, epubFile)

    logger.info('文件上传成功', {
      fileId,
      fileName: req.file.originalname,
      size: req.file.size
    })

    res.json({
      fileId: epubFile.id,
      fileName: epubFile.fileName,
      size: epubFile.fileSize
    })
  } catch (error) {
    next(error)
  }
})

// 获取文件信息
router.get('/:fileId', async (req, res, next) => {
  try {
    const file = fileStore.get(req.params.fileId)
    if (!file) {
      throw new AppError(404, '文件不存在')
    }

    res.json(file)
  } catch (error) {
    next(error)
  }
})

// 获取文件路径（内部使用）
export function getFilePath(fileId: string): string {
  const uploadDir = process.env.UPLOAD_DIR || './uploads'
  return path.join(uploadDir, `${fileId}.epub`)
}

// 更新文件状态（内部使用）
export function updateFileStatus(fileId: string, status: FileStatus): void {
  const file = fileStore.get(fileId)
  if (file) {
    file.status = status
  }
}

// 获取文件信息（内部使用）
export function getFileInfo(fileId: string): EPUBFile | undefined {
  return fileStore.get(fileId)
}

export { router as fileRouter }