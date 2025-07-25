import { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { taskId } = req.query

  if (!taskId || typeof taskId !== 'string') {
    return res.status(400).json({ error: 'Invalid task ID' })
  }

  try {
    // 获取任务信息
    const { data: task, error: taskError } = await supabase
      .from('translation_tasks')
      .select('*')
      .eq('id', taskId)
      .single()

    if (taskError || !task) {
      return res.status(404).json({ error: 'Task not found' })
    }

    if (task.status !== 'completed' || !task.result_url) {
      return res.status(400).json({ 
        error: 'Translation not completed',
        status: task.status 
      })
    }

    // 从 Supabase Storage 下载文件
    const fileName = task.result_url.split('/').pop()
    const { data, error } = await supabase.storage
      .from('epub-results')
      .download(`${taskId}/${fileName}`)

    if (error) throw error

    // 设置响应头
    res.setHeader('Content-Type', 'application/epub+zip')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    
    // 发送文件
    const buffer = await data.arrayBuffer()
    res.send(Buffer.from(buffer))
  } catch (error) {
    console.error('Download error:', error)
    return res.status(500).json({ 
      error: 'Failed to download file',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}