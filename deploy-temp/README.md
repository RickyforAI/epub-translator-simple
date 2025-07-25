# EPUB 翻译器（简化版）

一个简单易用的 EPUB 英译中工具，使用 Moonshot AI API。

## 功能特点

- 📚 支持 EPUB 格式电子书
- 🤖 使用 Moonshot AI 进行智能翻译
- 🎯 支持多种翻译风格（小说/科普/通用）
- 💾 无需服务器，纯前端实现
- 🔐 API Key 本地存储，安全可靠

## 使用方法

1. 输入你的 Moonshot API Key
2. 选择翻译风格
3. 上传 EPUB 文件（建议 <5MB）
4. 等待翻译完成
5. 自动下载翻译后的文件

## 技术栈

- 纯 HTML/CSS/JavaScript
- Supabase（数据存储）
- JSZip（EPUB 处理）
- Vercel（静态托管）

## 部署说明

本项目已配置好自动部署到 Vercel。

### 环境变量

无需配置，所有配置已内置。

### 本地开发

```bash
# 安装依赖
npm install -g serve

# 启动本地服务器
npm run dev
```

## 注意事项

1. 建议翻译小于 5MB 的文件
2. 确保 Moonshot API Key 有足够的额度
3. 翻译大文件可能需要较长时间
4. 保持网络连接稳定

## 开源协议

MIT License