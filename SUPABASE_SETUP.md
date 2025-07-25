# Supabase 配置指南

## 1. 获取 Supabase 凭据

1. 登录您的 Supabase 项目：https://app.supabase.com
2. 进入项目设置 → API
3. 复制以下信息：
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGci...` （很长的字符串）

## 2. 配置环境变量

### 在 Vercel 中配置

1. 进入 Vercel 项目设置
2. 点击 "Environment Variables"
3. 添加以下变量：

```
VITE_SUPABASE_URL=你的_Project_URL
VITE_SUPABASE_ANON_KEY=你的_anon_public_key
```

### 本地开发配置

1. 在 `frontend` 目录创建 `.env` 文件：

```bash
cd frontend
cp .env.example .env
```

2. 编辑 `.env` 文件，填入您的 Supabase 凭据：

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

## 3. 创建数据库表

在 Supabase SQL 编辑器中执行以下 SQL：

```sql
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

-- 启用实时功能
ALTER PUBLICATION supabase_realtime ADD TABLE translation_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE chapter_translations;

-- RLS 策略（允许匿名访问）
ALTER TABLE translation_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapter_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can do anything" ON translation_tasks
  FOR ALL TO anon USING (true) WITH CHECK (true);
  
CREATE POLICY "Anyone can do anything" ON chapter_translations
  FOR ALL TO anon USING (true) WITH CHECK (true);
```

## 4. 创建存储桶

1. 进入 Supabase Storage
2. 创建两个存储桶：
   - `epub-files` - 用于存储上传的 EPUB 文件
   - `epub-results` - 用于存储翻译后的 EPUB 文件
3. 确保两个桶都设置为 Public

## 5. 测试连接

在浏览器控制台测试 Supabase 连接：

```javascript
// 测试查询
const { data, error } = await supabase
  .from('translation_tasks')
  .select('*')
  .limit(1);

console.log('连接测试:', { data, error });
```

## 常见问题

### 1. 连接失败
- 检查环境变量是否正确
- 确认 Supabase 项目是否正常运行
- 验证 anon key 是否有效

### 2. 权限错误
- 确保已执行 RLS 策略 SQL
- 检查存储桶是否设置为 Public

### 3. 实时更新不工作
- 确认已执行 `ALTER PUBLICATION` 语句
- 检查 WebSocket 连接是否正常