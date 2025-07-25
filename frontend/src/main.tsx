import React from 'react'
import ReactDOM from 'react-dom/client'
// import App from './App.tsx'  // 原始版本（使用后端 API）
import AppSupabase from './AppSupabase.tsx'  // Supabase 版本
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppSupabase />
  </React.StrictMode>,
)