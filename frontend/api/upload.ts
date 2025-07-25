import { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import formidable from 'formidable'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs/promises'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // 解析上传的文件
    const form = formidable({ maxFileSize: 50 * 1024 * 1024 }) // 50MB
    const [fields, files] = await form.parse(req)
    
    const file = Array.isArray(files.file) ? files.file[0] : files.file
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    // 验证文件类型
    if (!file.originalFilename?.endsWith('.epub')) {
      return res.status(400).json({ error: 'Only EPUB files are allowed' })
    }

    // 读取文件内容
    const fileBuffer = await fs.readFile(file.filepath)
    const fileId = uuidv4()
    const fileName = file.originalFilename
    
    // 上传到 Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('epub-files')
      .upload(`${fileId}/${fileName}`, fileBuffer, {
        contentType: 'application/epub+zip',
        cacheControl: '3600',
      })

    if (uploadError) {
      throw uploadError
    }

    // 获取公开URL
    const { data: { publicUrl } } = supabase.storage
      .from('epub-files')
      .getPublicUrl(`${fileId}/${fileName}`)

    // 清理临时文件
    await fs.unlink(file.filepath)

    return res.status(200).json({
      fileId,
      fileName,
      size: file.size,
      url: publicUrl
    })
  } catch (error) {
    console.error('Upload error:', error)
    return res.status(500).json({ 
      error: 'Failed to upload file',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}