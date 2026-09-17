import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  // เว็บอยู่ที่ https://job-bcnb-p.github.io/TCMS-BCNB/ ไม่ใช่รากของโดเมน
  // ถ้าไม่ตั้ง base ไฟล์ JS/CSS จะถูกอ้างจาก / แล้วโหลดไม่เจอทั้งหมด
  base: '/TCMS-BCNB/',
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: {
    // ปิด sourcemap ใน production — ไม่เผยโครงสร้างโค้ดโดยไม่จำเป็น
    sourcemap: false,
    rollupOptions: {
      output: {
        // แยกก้อนไฟล์เพื่อให้เครือข่ายของวิทยาลัยโหลดเร็วขึ้นและแคชได้ดี
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
})
