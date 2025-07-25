#!/bin/bash

# 更新 Vercel 项目设置脚本
echo "正在更新 Vercel 项目设置..."

# 安装 Vercel CLI（如果还没安装）
if ! command -v vercel &> /dev/null; then
    echo "安装 Vercel CLI..."
    npm install -g vercel
fi

# 登录 Vercel（需要您的 token）
echo "请使用以下命令登录 Vercel："
echo "vercel login --token YOUR_VERCEL_TOKEN"
echo ""

# 设置项目
echo "登录后，请在项目目录运行："
echo "cd frontend"
echo "vercel --prod"
echo ""
echo "或者使用以下命令直接部署："
echo "vercel --prod --build-env VITE_SUPABASE_URL=YOUR_SUPABASE_URL --build-env VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_KEY"

# 提示手动设置
echo ""
echo "==============================================="
echo "如果上述方法不行，请手动在 Vercel Dashboard 设置："
echo "1. Root Directory: frontend"
echo "2. Output Directory: dist"
echo "3. Framework Preset: Vite"
echo "==============================================="