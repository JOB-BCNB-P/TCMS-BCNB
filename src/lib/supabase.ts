import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  throw new Error(
    'ไม่พบค่า VITE_SUPABASE_URL หรือ VITE_SUPABASE_ANON_KEY — คัดลอก .env.example เป็น .env แล้วใส่ค่าให้ครบ',
  )
}

/**
 * ใช้ได้เฉพาะ anon key เท่านั้น
 * ความปลอดภัยทั้งหมดอยู่ที่ RLS ของฐานข้อมูล ไม่ใช่ที่โค้ดหน้าเว็บ
 * เพราะ key นี้อยู่ใน bundle ที่ทุกคนเปิดอ่านได้
 */
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})

export const ALLOWED_EMAIL_DOMAIN = 'bcn.ac.th'

export function isCollegeEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)
}
