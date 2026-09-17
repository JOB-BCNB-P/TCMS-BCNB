import { useCallback, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'
const KEY = 'tcms-theme'

function readStored(): Theme | null {
  // ที่เก็บของเบราว์เซอร์อาจถูกปิด (โหมดส่วนตัว/นโยบายองค์กร) จึงต้องกันพัง
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

/** ธีมเริ่มต้นเป็นแบบสว่างตามข้อกำหนด แล้วค่อยให้ผู้ใช้กดสลับเป็นมืด */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => readStored() ?? 'light')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      /* ไม่ถือเป็นข้อผิดพลาด — แค่จำค่าไม่ได้ข้ามการใช้งาน */
    }
  }, [theme])

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])
  return { theme, toggle }
}
