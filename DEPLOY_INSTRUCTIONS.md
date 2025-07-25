# 🚀 部署指令

## 当前状态

✅ 代码已准备好
✅ Supabase 配置已完成
⏳ 等待创建 GitHub 仓库
⏳ 等待部署到 Vercel

## 接下来的步骤

### 1. 创建 Supabase 数据库表

请在你的 Supabase 项目中执行以下 SQL：

1. 打开 https://supabase.com/dashboard/project/vlmapkkbjrvommnqjwfo/sql/new
2. 复制下面的 SQL 代码，粘贴并运行：

```sql
-- 创建翻译任务表
CREATE TABLE IF NOT EXISTS translation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  moonshot_key TEXT NOT NULL
);

-- 创建翻译内容表
CREATE TABLE IF NOT EXISTS translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES translation_tasks(id) ON DELETE CASCADE,
  original_text TEXT NOT NULL,
  translated_text TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 启用实时更新
ALTER PUBLICATION supabase_realtime ADD TABLE translation_tasks;

-- 开启权限（允许匿名访问）
ALTER TABLE translation_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE translations ENABLE ROW LEVEL SECURITY;

-- 创建访问策略
CREATE POLICY "Enable all operations for anonymous users" ON translation_tasks
  FOR ALL TO anon USING (true) WITH CHECK (true);
  
CREATE POLICY "Enable all operations for anonymous users" ON translations
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- 创建存储桶（如果不存在）
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('epub-files', 'epub-files', true),
  ('epub-results', 'epub-results', true)
ON CONFLICT (id) DO NOTHING;
```

### 2. 创建 GitHub 仓库

由于我不能直接访问 GitHub API，请你手动创建：

1. 访问 https://github.com/new
2. 仓库名称：`epub-translator-simple`
3. 设置为 Public
4. 不要初始化 README
5. 创建后告诉我仓库地址

### 3. 上传代码

我已经准备好了所有代码文件：
- `simple-version/index.html` - 主页面
- `simple-version/app.js` - 应用逻辑
- `simple-version/config.js` - 配置文件
- `simple-version/package.json` - 项目配置
- `simple-version/vercel.json` - Vercel 配置
- `simple-version/README.md` - 说明文档

你需要：
1. 在本地创建一个文件夹
2. 把这些文件复制进去
3. 使用 Git 推送到 GitHub

或者更简单的方法：
1. 在 GitHub 仓库页面点击 "upload files"
2. 把所有文件拖进去
3. 提交

### 4. 部署到 Vercel

1. 访问 https://vercel.com/new
2. 选择 "Import Git Repository"
3. 选择你刚创建的 `epub-translator-simple` 仓库
4. 配置：
   - Framework Preset: `Other`
   - Root Directory: 留空
   - Build Command: 留空
   - Output Directory: 留空
5. 点击 Deploy

## 需要的文件内容

由于我不能直接创建文件，你需要手动创建。我可以把每个文件的完整内容发给你，你复制保存即可。

请告诉我：
1. 你是否已经运行了 Supabase 的 SQL？
2. 你是否已经创建了 GitHub 仓库？
3. 你需要我把哪个文件的内容发给你？

## 测试 Moonshot API Key

在部署前，你可以在这里测试你的 API Key：
https://platform.moonshot.cn/console/api-keys

确保你的 Key：
- ✅ 状态正常
- ✅ 有足够的额度
- ✅ 没有被限制