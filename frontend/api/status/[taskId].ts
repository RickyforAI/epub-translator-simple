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
    // 获取任务状态
    const { data: task, error: taskError } = await supabase
      .from('translation_tasks')
      .select('*')
      .eq('id', taskId)
      .single()

    if (taskError) {
      return res.status(404).json({ error: 'Task not found' })
    }

    // 获取章节状态
    const { data: chapters, error: chaptersError } = await supabase
      .from('chapter_translations')
      .select('id, chapter_id, chapter_title, status, progress')
      .eq('task_id', taskId)
      .order('chapter_id')

    if (chaptersError) throw chaptersError

    return res.status(200).json({
      ...task,
      chapters: chapters || []
    })
  } catch (error) {
    console.error('Status query error:', error)
    return res.status(500).json({ 
      error: 'Failed to get task status',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}