# 🚀 超简单部署指南（非开发者版）

这个指南会手把手教你部署 EPUB 翻译器，整个过程大约需要 30 分钟。

## 📋 准备清单

确保你已经有以下账号：
- ✅ GitHub 账号
- ✅ Vercel 账号 
- ✅ Supabase 账号
- ✅ Moonshot API Key

## 第一部分：设置 Supabase（10分钟）

### 1. 创建 Supabase 项目

1. **打开** https://app.supabase.com
2. **点击** "New project" 绿色按钮
3. **填写信息**：
   - Project name: `epub-translator`（或任意名称）
   - Database Password: 设置一个强密码（需要记住！）
   - Region: 选择 `Northeast Asia (Tokyo)` （离中国最近）
4. **点击** "Create new project"
5. **等待** 项目创建（约2分钟）

### 2. 创建数据库表

项目创建好后：

1. **点击左侧菜单** "SQL Editor"
2. **点击** "New query"
3. **复制下面的代码**，粘贴到编辑器中：

```sql
-- 创建翻译任务表
CREATE TABLE translation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  moonshot_key TEXT NOT NULL
);

-- 创建翻译内容表
CREATE TABLE translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES translation_tasks(id),
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

CREATE POLICY "Anyone can do anything" ON translation_tasks
  FOR ALL TO anon USING (true) WITH CHECK (true);
  
CREATE POLICY "Anyone can do anything" ON translations
  FOR ALL TO anon USING (true) WITH CHECK (true);
```

4. **点击** "Run" 按钮执行

### 3. 创建存储桶

1. **点击左侧菜单** "Storage"
2. **点击** "New bucket"
3. **创建第一个桶**：
   - Name: `epub-files`
   - Public bucket: ✅ 勾选
   - 点击 "Create bucket"
4. **再创建第二个桶**：
   - Name: `epub-results`
   - Public bucket: ✅ 勾选
   - 点击 "Create bucket"

### 4. 获取项目密钥

1. **点击左侧菜单** "Settings" → "API"
2. **复制并保存这些信息**（一会儿要用）：
   - Project URL: `https://xxxxx.supabase.co`
   - anon public key: `eyJhbGci...很长的一串`

---

## 第二部分：准备代码（5分钟）

### 1. 下载简化版代码

1. **下载** [简化版代码包](这里我会为你生成)
2. **解压**到你的电脑上

### 2. 修改配置文件

1. **打开** `config.js` 文件（用记事本即可）
2. **替换**以下内容：
   ```javascript
   // 把这些替换成你刚才复制的
   const SUPABASE_URL = '你的_Project_URL'
   const SUPABASE_KEY = '你的_anon_public_key'
   ```
3. **保存**文件

### 3. 上传到 GitHub

1. **打开** GitHub 网站
2. **创建新仓库**：
   - 点击右上角 "+" → "New repository"
   - Repository name: `my-epub-translator`
   - 选择 "Public"
   - 点击 "Create repository"
3. **上传文件**：
   - 点击 "uploading an existing file"
   - 把解压后的所有文件拖进去
   - 点击 "Commit changes"

---

## 第三部分：部署到 Vercel（10分钟）

### 1. 连接 GitHub 到 Vercel

1. **打开** https://vercel.com
2. **点击** "Add New..." → "Project"
3. **连接 GitHub**：
   - 点击 "Import Git Repository"
   - 第一次使用需要授权 GitHub
   - 选择你刚才创建的 `my-epub-translator` 仓库

### 2. 配置项目

1. **项目设置**：
   - Framework Preset: 选择 `Vite`
   - Root Directory: 保持默认
   
2. **环境变量**（重要！）：
   点击 "Environment Variables"，添加以下变量：
   
   | Name | Value |
   |------|-------|
   | VITE_SUPABASE_URL | 你的 Supabase Project URL |
   | VITE_SUPABASE_KEY | 你的 Supabase anon key |

3. **点击** "Deploy"
4. **等待** 部署完成（约3-5分钟）

### 3. 获取网站地址

部署成功后，你会看到：
- 你的网站地址：`https://my-epub-translator.vercel.app`
- 点击这个地址就可以访问了！

---

## 第四部分：使用教程（5分钟）

### 1. 访问你的翻译器

打开刚才的网站地址

### 2. 开始翻译

1. **输入** Moonshot API Key
2. **选择** EPUB 文件（建议先用小文件测试）
3. **点击** "开始翻译"
4. **等待** 翻译完成
5. **下载** 翻译后的文件

---

## ❓ 常见问题

### 翻译失败怎么办？
1. 检查 API Key 是否正确
2. 确认文件不要太大（建议 <5MB）
3. 查看浏览器控制台错误信息

### 想翻译大文件怎么办？
简化版只适合小文件。大文件需要完整版部署（需要额外设置后台服务）。

### 如何更新代码？
1. 在 GitHub 上传新文件
2. Vercel 会自动重新部署

---

## 🎉 恭喜！

你已经成功部署了自己的 EPUB 翻译器！

如果遇到问题：
1. 截图错误信息
2. 描述具体步骤
3. 我会帮你解决
