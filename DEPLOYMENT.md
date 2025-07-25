# 部署指南

本指南将帮助你将 EPUB 翻译器部署到生产环境。采用前后端分离部署方案：
- 前端部署到 Vercel
- 后端部署到 Railway

## 📋 准备工作

1. **账号准备**
   - [GitHub](https://github.com) 账号
   - [Vercel](https://vercel.com) 账号（免费）
   - [Railway](https://railway.app) 账号（免费）
   - [Moonshot AI](https://platform.moonshot.cn) API Key

2. **Fork 项目**
   ```bash
   # 在 GitHub 上 Fork 本项目到你的账号下
   # 然后克隆到本地
   git clone https://github.com/YOUR_USERNAME/epub-translator.git
   cd epub-translator
   ```

## 🚀 部署步骤

### 第一步：部署后端到 Railway

1. **登录 Railway**
   - 访问 [Railway](https://railway.app)
   - 使用 GitHub 账号登录

2. **创建新项目**
   - 点击 "New Project"
   - 选择 "Deploy from GitHub repo"
   - 选择你 Fork 的 epub-translator 仓库

3. **配置部署**
   - Railway 会自动检测到 Node.js 项目
   - 在设置中指定根目录为 `/backend`
   - 设置构建命令：`npm run build`
   - 设置启动命令：`npm run start`

4. **设置环境变量**
   在 Railway 项目设置中添加以下环境变量：
   ```env
   NODE_ENV=production
   PORT=3000
   CORS_ORIGIN=https://your-app.vercel.app  # 稍后替换为实际的 Vercel URL
   UPLOAD_DIR=/tmp/uploads
   MAX_FILE_SIZE=52428800
   MOONSHOT_API_URL=https://api.moonshot.cn/v1
   API_TIMEOUT=30000
   WORKER_CONCURRENCY=3
   SESSION_SECRET=your-random-secret-key  # 生成一个随机密钥
   ```

5. **获取后端 URL**
   - 部署完成后，Railway 会提供一个 URL，例如：`https://your-app.railway.app`
   - 记下这个 URL，后面配置前端时需要用到

### 第二步：部署前端到 Vercel

1. **登录 Vercel**
   - 访问 [Vercel](https://vercel.com)
   - 使用 GitHub 账号登录

2. **导入项目**
   - 点击 "Add New Project"
   - 选择 "Import Git Repository"
   - 选择你的 epub-translator 仓库

3. **配置部署**
   - **Root Directory**: 设置为 `frontend`
   - **Framework Preset**: 选择 `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

4. **设置环境变量**
   添加以下环境变量：
   ```env
   VITE_API_URL=https://your-app.railway.app  # 使用刚才的 Railway URL
   VITE_WS_URL=https://your-app.railway.app   # 同上
   ```

5. **部署**
   - 点击 "Deploy"
   - 等待部署完成
   - 获取前端 URL，例如：`https://your-app.vercel.app`

### 第三步：更新后端 CORS 设置

1. **返回 Railway**
   - 更新环境变量 `CORS_ORIGIN` 为你的 Vercel URL
   - 例如：`CORS_ORIGIN=https://your-app.vercel.app`

2. **重新部署**
   - Railway 会自动重新部署应用

## ✅ 验证部署

1. 访问你的 Vercel URL
2. 输入 Moonshot API Key
3. 上传一个小的 EPUB 文件测试
4. 检查翻译是否正常工作

## 🔧 故障排查

### 前端无法连接后端
- 检查 CORS_ORIGIN 设置是否正确
- 确认 Railway 后端正在运行
- 查看浏览器控制台错误信息

### WebSocket 连接失败
- Railway 默认支持 WebSocket
- 确保 VITE_WS_URL 设置正确
- 检查是否使用 HTTPS

### 文件上传失败
- 检查文件大小限制
- 确认 Railway 的 /tmp 目录有写入权限
- 查看 Railway 日志获取详细错误

### 翻译超时
- 检查 Moonshot API Key 是否有效
- 确认 API 配额是否充足
- 考虑减少并发数 (WORKER_CONCURRENCY)

## 🎯 性能优化建议

1. **使用 CDN**
   - Vercel 自动提供全球 CDN
   - 静态资源会自动优化

2. **数据库持久化**（可选）
   - 考虑使用 Railway 的 PostgreSQL
   - 存储翻译历史和缓存

3. **监控**
   - 使用 Railway 的内置监控
   - 设置 Vercel Analytics

## 🔒 安全建议

1. **API Key 管理**
   - 不要在代码中硬编码 API Key
   - 使用环境变量管理敏感信息

2. **速率限制**
   - 考虑添加 API 速率限制
   - 防止滥用

3. **HTTPS**
   - Vercel 和 Railway 都默认提供 HTTPS
   - 确保所有通信都使用 HTTPS

## 💰 成本估算

### 免费额度
- **Vercel Free**: 100GB 带宽/月，无限部署
- **Railway Free**: $5 额度/月，500 小时运行时间
- 对于个人使用完全足够

### 升级选项
- **Vercel Pro**: $20/月，更多带宽和性能
- **Railway Pro**: $20/月，更多资源和功能

## 📝 后续步骤

1. **自定义域名**
   - Vercel 和 Railway 都支持自定义域名
   - 在各自的设置中配置

2. **CI/CD 集成**
   - 使用提供的 GitHub Actions 配置
   - 自动化部署流程

3. **备份策略**
   - 定期备份翻译结果
   - 考虑使用对象存储服务

## 🆘 获取帮助

如果遇到问题：
1. 查看 Railway 和 Vercel 的部署日志
2. 检查浏览器开发者工具的网络请求
3. 提交 Issue 到项目仓库

祝部署顺利！🎉