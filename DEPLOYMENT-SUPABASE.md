# Supabase + Vercel 部署指南

本指南将帮助你将 EPUB 翻译器部署到 Supabase + Vercel 的 Serverless 架构。

## 🏗️ 架构说明

- **前端 + API**: Vercel（React + API Routes）
- **数据库**: Supabase PostgreSQL
- **文件存储**: Supabase Storage
- **实时通信**: Supabase Realtime
- **后台处理**: 外部服务（Railway/Render/自建服务器）

## 📋 准备工作

1. **账号准备**
   - [GitHub](https://github.com) 账号
   - [Vercel](https://vercel.com) 账号
   - [Supabase](https://supabase.com) 账号
   - [Moonshot AI](https://platform.moonshot.cn) API Key

2. **克隆项目**
   ```bash
   git clone https://github.com/YOUR_USERNAME/epub-translator.git
   cd epub-translator
   ```

## 🚀 部署步骤

### 第一步：设置 Supabase

1. **创建 Supabase 项目**
   - 登录 [Supabase](https://app.supabase.com)
   - 点击 "New project"
   - 选择组织和设置项目名称
   - 设置数据库密码（请妥善保管）
   - 选择区域（建议选择离用户最近的）

2. **运行数据库迁移**
   - 等待项目创建完成
   - 进入 SQL Editor
   - 复制 `supabase/migrations/001_initial_schema.sql` 的内容
   - 执行 SQL 创建表结构

3. **设置存储桶**
   在 Storage 页面创建两个桶：
   ```sql
   -- 在 SQL Editor 中执行
   INSERT INTO storage.buckets (id, name, public)
   VALUES 
     ('epub-files', 'epub-files', true),
     ('epub-results', 'epub-results', true);
   ```

4. **获取项目配置**
   在 Settings > API 中获取：
   - `Project URL` (SUPABASE_URL)
   - `anon public` key (SUPABASE_ANON_KEY)
   - `service_role` key (SUPABASE_SERVICE_KEY) - 仅后台服务使用

### 第二步：部署到 Vercel

1. **准备项目**
   ```bash
   # 安装依赖
   cd frontend
   npm install
   npm install @supabase/supabase-js @vercel/node formidable uuid
   ```

2. **配置环境变量文件**
   创建 `frontend/.env.local`:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. **部署到 Vercel**
   - 登录 [Vercel](https://vercel.com)
   - 点击 "Add New Project"
   - 导入你的 GitHub 仓库
   - 配置部署：
     - Framework Preset: `Vite`
     - Root Directory: `frontend`
     - Build Command: `npm run build`
     - Output Directory: `dist`

4. **设置环境变量**
   在 Vercel 项目设置中添加：
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

### 第三步：部署后台翻译服务

由于翻译是长时间任务，需要部署到支持长时间运行的平台。

#### 选项 1：部署到 Railway

1. **创建 Worker 项目**
   ```bash
   # 在项目根目录
   mkdir worker
   cd worker
   npm init -y
   npm install @supabase/supabase-js axios typescript tsx
   ```

2. **配置 package.json**
   ```json
   {
     "scripts": {
       "start": "tsx worker.ts",
       "dev": "tsx watch worker.ts"
     }
   }
   ```

3. **创建主文件 `worker/worker.ts`**
   ```typescript
   import { processTranslationJob } from './translator'
   
   // 简单的任务轮询器
   async function pollTasks() {
     while (true) {
       try {
         // 从 Supabase 获取待处理任务
         const tasks = await getPendingTasks()
         
         for (const task of tasks) {
           await processTranslationJob(task)
         }
       } catch (error) {
         console.error('Poll error:', error)
       }
       
       // 等待 10 秒后再次检查
       await new Promise(resolve => setTimeout(resolve, 10000))
     }
   }
   
   pollTasks()
   ```

4. **部署到 Railway**
   - 将 worker 文件夹推送到单独的 Git 仓库
   - 在 Railway 创建新项目并连接仓库
   - 设置环境变量：
     ```
     SUPABASE_URL=your_supabase_url
     SUPABASE_SERVICE_KEY=your_service_key
     ```

#### 选项 2：使用 Vercel Cron Jobs（简化版）

如果翻译量不大，可以使用 Vercel Cron Jobs 定期处理：

1. **创建 Cron Job**
   创建 `frontend/api/cron/process-translations.ts`:
   ```typescript
   export const config = {
     schedule: '*/5 * * * *' // 每 5 分钟运行一次
   }
   
   export default async function handler() {
     // 处理待翻译的任务
     // 注意：最长执行时间 60 秒
   }
   ```

### 第四步：更新前端代码

1. **更新服务调用**
   修改 `frontend/src/services/translationService.ts`:
   ```typescript
   // 使用 /api 路径调用 Vercel API Routes
   const apiClient = axios.create({
     baseURL: '/api'
   })
   ```

2. **集成 Supabase Realtime**
   在组件中使用：
   ```typescript
   import { realtimeService } from '@/services/realtimeService'
   
   useEffect(() => {
     realtimeService.subscribeToTask(
       taskId,
       (task) => setTask(task),
       (chapter) => updateChapter(chapter)
     )
     
     return () => {
       realtimeService.unsubscribeFromTask(taskId)
     }
   }, [taskId])
   ```

## ✅ 验证部署

1. 访问你的 Vercel URL
2. 上传一个小的 EPUB 文件
3. 检查 Supabase Dashboard 中的数据
4. 确认翻译任务正常运行

## 🔧 故障排查

### 常见问题

1. **文件上传失败**
   - 检查 Supabase Storage 权限
   - 确认文件大小限制
   - 查看 Vercel Function 日志

2. **实时更新不工作**
   - 检查 Supabase Realtime 是否启用
   - 确认表的 RLS 策略
   - 检查前端 WebSocket 连接

3. **翻译任务卡住**
   - 查看后台服务日志
   - 检查 Moonshot API 配额
   - 确认数据库连接

### 调试技巧

1. **Vercel 日志**
   ```bash
   vercel logs --follow
   ```

2. **Supabase 日志**
   - 在 Dashboard > Logs 查看
   - 使用 SQL Editor 查询数据

3. **本地测试**
   ```bash
   # 使用 Vercel CLI 本地测试
   vercel dev
   ```

## 💰 成本估算

### 免费额度
- **Supabase Free**: 500MB 数据库，1GB 存储，2GB 传输
- **Vercel Hobby**: 100GB 带宽，100 小时 Functions
- 适合个人项目和测试

### 付费升级
- **Supabase Pro**: $25/月起
- **Vercel Pro**: $20/月
- **后台服务**: Railway $5/月 或自建服务器

## 🚨 安全建议

1. **API Keys**
   - 永远不要在前端代码中暴露 service_role key
   - 使用环境变量管理所有密钥

2. **RLS 策略**
   - 根据需求调整数据库 RLS 策略
   - 考虑添加用户认证

3. **速率限制**
   - 在 API Routes 中实现速率限制
   - 监控 API 使用情况

## 📝 后续优化

1. **性能优化**
   - 实现翻译缓存
   - 优化数据库查询
   - 使用 CDN 加速

2. **功能增强**
   - 添加用户认证
   - 支持批量上传
   - 翻译历史记录

3. **监控告警**
   - 设置 Vercel Analytics
   - 配置错误监控（Sentry）
   - 实现任务超时告警

祝部署成功！如有问题，请查看项目 Issues 或提交新的问题。🎉