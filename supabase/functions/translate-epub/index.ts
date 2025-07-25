import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TranslateRequest {
  taskId: string
  apiKey: string
  testMode?: boolean
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { taskId, apiKey, testMode } = await req.json() as TranslateRequest

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get task details
    const { data: task, error: taskError } = await supabase
      .from('translation_tasks')
      .select('*')
      .eq('id', taskId)
      .single()

    if (taskError || !task) {
      throw new Error('Task not found')
    }

    // Update task status to processing
    await supabase
      .from('translation_tasks')
      .update({ status: 'processing' })
      .eq('id', taskId)

    // Download EPUB file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('epub-files')
      .download(task.file_url.split('/').slice(-2).join('/'))

    if (downloadError) {
      throw new Error('Failed to download file')
    }

    // TODO: Parse EPUB and extract chapters
    // This is a placeholder - you would need to implement EPUB parsing
    const chapters = [
      { id: 'ch1', title: 'Chapter 1', content: 'This is chapter 1 content...' },
      { id: 'ch2', title: 'Chapter 2', content: 'This is chapter 2 content...' }
    ]

    // In test mode, only process first 2 chapters
    const chaptersToProcess = testMode ? chapters.slice(0, 2) : chapters

    // Update total chapters
    await supabase
      .from('translation_tasks')
      .update({ total_chapters: chaptersToProcess.length })
      .eq('id', taskId)

    // Create chapter records
    for (const chapter of chaptersToProcess) {
      await supabase
        .from('chapter_translations')
        .insert({
          task_id: taskId,
          chapter_id: chapter.id,
          chapter_title: chapter.title,
          original_text: chapter.content,
          status: 'pending',
          word_count: chapter.content.split(' ').length
        })
    }

    // Process each chapter
    for (let i = 0; i < chaptersToProcess.length; i++) {
      const chapter = chaptersToProcess[i]
      
      // Update chapter status
      await supabase
        .from('chapter_translations')
        .update({ status: 'processing', progress: 0 })
        .eq('task_id', taskId)
        .eq('chapter_id', chapter.id)

      // Call Moonshot API for translation
      const translatedText = await translateWithMoonshot(chapter.content, apiKey)

      // Update chapter with translation
      await supabase
        .from('chapter_translations')
        .update({ 
          translated_text: translatedText,
          status: 'completed',
          progress: 100
        })
        .eq('task_id', taskId)
        .eq('chapter_id', chapter.id)

      // Update task progress
      const progress = Math.round(((i + 1) / chaptersToProcess.length) * 100)
      await supabase
        .from('translation_tasks')
        .update({ 
          progress,
          completed_chapters: i + 1
        })
        .eq('id', taskId)
    }

    // TODO: Rebuild EPUB with translated content
    // This is a placeholder
    const translatedEpubBlob = new Blob(['translated epub content'], { type: 'application/epub+zip' })
    
    // Upload result
    const resultPath = `results/${taskId}/translated.epub`
    const { error: uploadError } = await supabase.storage
      .from('epub-results')
      .upload(resultPath, translatedEpubBlob)

    if (uploadError) {
      throw new Error('Failed to upload result')
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('epub-results')
      .getPublicUrl(resultPath)

    // Update task as completed
    await supabase
      .from('translation_tasks')
      .update({ 
        status: 'completed',
        result_url: publicUrl,
        completed_at: new Date().toISOString()
      })
      .eq('id', taskId)

    return new Response(
      JSON.stringify({ success: true, taskId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    // Update task as failed
    if (req.method === 'POST') {
      const { taskId } = await req.json()
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseKey)
      
      await supabase
        .from('translation_tasks')
        .update({ 
          status: 'failed',
          error: error.message
        })
        .eq('id', taskId)
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

async function translateWithMoonshot(text: string, apiKey: string): Promise<string> {
  // This is a placeholder - implement actual Moonshot API call
  const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'moonshot-v1-8k',
      messages: [
        {
          role: 'system',
          content: '你是一个专业的中英翻译专家。请将下面的英文内容翻译成中文，保持原文的语言风格和表达习惯。'
        },
        {
          role: 'user',
          content: text
        }
      ],
      temperature: 0.3
    })
  })

  if (!response.ok) {
    throw new Error('Translation API failed')
  }

  const data = await response.json()
  return data.choices[0].message.content
}