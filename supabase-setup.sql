-- 创建翻译任务表
CREATE TABLE IF NOT EXISTS translation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  file_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  progress INTEGER DEFAULT 0,
  total_chapters INTEGER DEFAULT 0,
  completed_chapters INTEGER DEFAULT 0,
  api_config JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  error TEXT,
  result_url TEXT
);

-- 创建章节翻译表
CREATE TABLE IF NOT EXISTS chapter_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES translation_tasks(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL,
  chapter_title TEXT,
  original_text TEXT NOT NULL,
  translated_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  progress INTEGER DEFAULT 0,
  word_count INTEGER DEFAULT 0,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(task_id, chapter_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_tasks_status ON translation_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON translation_tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_chapters_task_id ON chapter_translations(task_id);
CREATE INDEX IF NOT EXISTS idx_chapters_status ON chapter_translations(status);

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS update_translation_tasks_updated_at 
  BEFORE UPDATE ON translation_tasks 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS update_chapter_translations_updated_at 
  BEFORE UPDATE ON chapter_translations 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- 启用实时功能
ALTER PUBLICATION supabase_realtime ADD TABLE translation_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE chapter_translations;

-- RLS (Row Level Security) 策略
ALTER TABLE translation_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapter_translations ENABLE ROW LEVEL SECURITY;

-- 创建策略：允许匿名用户完全访问
DROP POLICY IF EXISTS "Enable all operations for anonymous users" ON translation_tasks;
CREATE POLICY "Enable all operations for anonymous users" ON translation_tasks
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all operations for anonymous users" ON chapter_translations;
CREATE POLICY "Enable all operations for anonymous users" ON chapter_translations
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- 创建存储桶（如果需要在 SQL 中创建）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('epub-files', 'epub-files', true, 52428800, ARRAY['application/epub+zip']),
  ('epub-results', 'epub-results', true, 52428800, ARRAY['application/epub+zip'])
ON CONFLICT (id) DO UPDATE SET 
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

-- 设置存储桶策略
DROP POLICY IF EXISTS "Allow anonymous uploads" ON storage.objects;
CREATE POLICY "Allow anonymous uploads" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id IN ('epub-files', 'epub-results'));

DROP POLICY IF EXISTS "Allow anonymous downloads" ON storage.objects;
CREATE POLICY "Allow anonymous downloads" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id IN ('epub-files', 'epub-results'));