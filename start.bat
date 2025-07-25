@echo off
echo 🚀 启动 EPUB 翻译器...

REM 检查 Node.js 是否安装
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 错误: Node.js 未安装
    echo 请先安装 Node.js: https://nodejs.org/
    pause
    exit /b 1
)

REM 检查 npm 是否安装
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 错误: npm 未安装
    pause
    exit /b 1
)

echo 📦 检查并安装依赖...

REM 安装根目录依赖
if not exist "node_modules" (
    echo Installing root dependencies...
    call npm install
)

REM 安装前端依赖
if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
)

REM 安装后端依赖
if not exist "backend\node_modules" (
    echo Installing backend dependencies...
    cd backend
    call npm install
    cd ..
)

REM 检查环境配置文件
if not exist "backend\.env" (
    echo ⚠️  未找到环境配置文件
    echo 📝 创建默认配置...
    copy backend\.env.example backend\.env
    echo ✅ 已创建 backend\.env
    echo 请编辑此文件配置您的 Moonshot API Key
)

echo 🎉 启动开发服务器...
echo 后端地址: http://localhost:3000
echo 前端地址: http://localhost:5173
echo.
echo 按 Ctrl+C 停止服务器

REM 启动开发服务器
call npm run dev