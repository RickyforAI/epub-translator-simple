-- 创建翻译任务表
CREATE TABLE translation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
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
CREATE TABLE chapter_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES translation_tasks(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL,
  chapter_title TEXT,
  original_text TEXT NOT NULL,
  translated_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  word_count INTEGER DEFAULT 0,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(task_id, chapter_id)
);

-- 创建索引
CREATE INDEX idx_tasks_status ON translation_tasks(status);
CREATE INDEX idx_tasks_created ON translation_tasks(created_at);
CREATE INDEX idx_chapters_task_id ON chapter_translations(task_id);
CREATE INDEX idx_chapters_status ON chapter_translations(status);

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_translation_tasks_updated_at 
  BEFORE UPDATE ON translation_tasks 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chapter_translations_updated_at 
  BEFORE UPDATE ON chapter_translations 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- 启用实时功能
ALTER PUBLICATION supabase_realtime ADD TABLE translation_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE chapter_translations;

-- RLS (Row Level Security) 策略
ALTER TABLE translation_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapter_translations ENABLE ROW LEVEL SECURITY;

-- 创建策略：允许匿名用户创建和查看自己的任务
CREATE POLICY "Anyone can create tasks" ON translation_tasks
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "Anyone can view tasks" ON translation_tasks
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anyone can update tasks" ON translation_tasks
  FOR UPDATE TO anon
  USING (true);

-- 章节表的策略
CREATE POLICY "Anyone can create chapters" ON chapter_translations
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "Anyone can view chapters" ON chapter_translations
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anyone can update chapters" ON chapter_translations
  FOR UPDATE TO anon
  USING (true);