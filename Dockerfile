# 构建前端
FROM node:18-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 构建后端
FROM node:18-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
COPY shared/ ../shared/
RUN npm run build

# 生产镜像
FROM node:18-alpine
WORKDIR /app

# 安装生产依赖
COPY backend/package*.json ./backend/
COPY shared/package*.json ./shared/
WORKDIR /app/backend
RUN npm ci --only=production

WORKDIR /app

# 复制构建产物
COPY --from=backend-build /app/backend/dist ./backend/dist
COPY --from=backend-build /app/shared ./shared
COPY --from=frontend-build /app/frontend/dist ./backend/public

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 创建上传目录
RUN mkdir -p /tmp/uploads

EXPOSE 3000

WORKDIR /app/backend
CMD ["node", "dist/index.js"]