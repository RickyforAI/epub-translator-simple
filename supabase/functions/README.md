# Supabase Edge Functions 部署指南

## Edge Function: process-translation

这个 Edge Function 负责处理 EPUB 文件的翻译任务。

### 功能特性

- 完整的 EPUB 解析和重建
- 使用 Moonshot API 进行翻译
- 支持不同的翻译风格（fiction/science/general）
- 实时进度更新
- 测试模式支持（只翻译前2章）

### 部署步骤

1. **安装 Supabase CLI**（如果还没安装）:
```bash
npm install -g supabase
```

2. **登录 Supabase**:
```bash
supabase login
```

3. **链接到你的项目**:
```bash
supabase link --project-ref vlmapkkbjrvommnqjwfo
```

4. **部署 Edge Function**:
```bash
# 在项目根目录执行
supabase functions deploy process-translation
```

5. **设置环境变量**:
```bash
# 这些环境变量会自动设置:
# - SUPABASE_URL
# - SUPABASE_SERVICE_ROLE_KEY

# 如果需要手动设置其他变量:
supabase secrets set MOONSHOT_API_URL=https://api.moonshot.cn/v1
```

### 本地测试

1. **启动本地 Supabase**:
```bash
supabase start
```

2. **本地运行 Edge Function**:
```bash
supabase functions serve process-translation --env-file ./supabase/.env.local
```

3. **测试调用**:
```bash
curl -i --location --request POST 'http://localhost:54321/functions/v1/process-translation' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"taskId":"test-task-id"}'
```

### 调用方式

#### 从前端调用:
```typescript
const { data, error } = await supabase.functions.invoke('process-translation', {
  body: {
    taskId: 'your-task-id'
  }
})
```

#### 直接 HTTP 调用:
```bash
curl -X POST 'https://vlmapkkbjrvommnqjwfo.supabase.co/functions/v1/process-translation' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"taskId":"your-task-id"}'
```

### 监控和日志

查看 Edge Function 日志:
```bash
supabase functions logs process-translation
```

### 故障排除

1. **CORS 错误**: Edge Function 已配置 CORS headers，如果仍有问题，检查前端的请求配置

2. **超时错误**: Edge Function 默认超时时间为 150 秒，对于大文件可能需要优化处理逻辑

3. **内存限制**: Edge Function 有内存限制，确保 EPUB 文件不要太大（建议 < 50MB）

4. **API 限流**: Moonshot API 可能有调用限制，Edge Function 已实现基本的错误处理

### 更新部署

修改代码后重新部署:
```bash
supabase functions deploy process-translation --no-verify-jwt
```

### 删除函数

如果需要删除:
```bash
supabase functions delete process-translation
```