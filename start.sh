#!/bin/bash

# EPUB 翻译器启动脚本

echo "🚀 启动 EPUB 翻译器..."

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "❌ 错误: Node.js 未安装"
    echo "请先安装 Node.js: https://nodejs.org/"
    exit 1
fi

# 检查 npm 是否安装
if ! command -v npm &> /dev/null; then
    echo "❌ 错误: npm 未安装"
    exit 1
fi

echo "📦 检查并安装依赖..."

# 安装根目录依赖
if [ ! -d "node_modules" ]; then
    echo "Installing root dependencies..."
    npm install
fi

# 安装前端依赖
if [ ! -d "frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

# 安装后端依赖
if [ ! -d "backend/node_modules" ]; then
    echo "Installing backend dependencies..."
    cd backend && npm install && cd ..
fi

# 检查环境配置文件
if [ ! -f "backend/.env" ]; then
    echo "⚠️  未找到环境配置文件"
    echo "📝 创建默认配置..."
    cp backend/.env.example backend/.env
    echo "✅ 已创建 backend/.env"
    echo "请编辑此文件配置您的 Moonshot API Key"
fi

echo "🎉 启动开发服务器..."
echo "后端地址: http://localhost:3000"
echo "前端地址: http://localhost:5173"
echo ""
echo "按 Ctrl+C 停止服务器"

# 启动开发服务器
npm run dev