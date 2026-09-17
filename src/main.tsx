import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
// ใช้ HashRouter เพราะ GitHub Pages เป็นโฮสต์ไฟล์นิ่ง ไม่มีการ rewrite เส้นทาง
// ถ้าใช้ BrowserRouter ผู้ใช้ที่กด refresh หรือเปิดลิงก์ลึกจะเจอหน้า 404 ของ GitHub
import { AuthProvider } from '@/auth/AuthProvider'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </HashRouter>
  </React.StrictMode>,
)
