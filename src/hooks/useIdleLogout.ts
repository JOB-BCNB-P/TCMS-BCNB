import { useCallback, useEffect, useRef, useState } from 'react'

const IDLE_MS = 30 * 60 * 1000   // ไม่ขยับ 30 นาที
const WARN_MS = 60 * 1000        // เตือนก่อนหมดเวลา 1 นาที
const EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'focus'] as const

/**
 * ออกจากระบบอัตโนมัติเมื่อไม่ได้ใช้งาน
 *
 * ทดแทน Inactivity timeout ของ Supabase ที่มีเฉพาะแพ็กเกจ Pro
 * เหตุผลที่ต้องมี: เครื่องในสำนักงานมักใช้ร่วมกัน และหน้าจอนี้แสดงข้อมูล
 * ผู้รับเงินและเลขบัญชี ถ้าเจ้าหน้าที่ลุกไปประชุมโดยเปิดค้างไว้ คนถัดไป
 * ที่มานั่งจะเห็นทุกอย่างในสิทธิ์ของคนก่อน
 *
 * ข้อจำกัดที่ต้องเข้าใจ: นี่เป็นการป้องกันที่ฝั่งเบราว์เซอร์ ไม่ใช่ที่เซิร์ฟเวอร์
 * access token ที่ออกไปแล้วยังใช้ได้จนหมดอายุตามที่ตั้งไว้ใน Supabase
 * มาตรการนี้กันคนที่มานั่งต่อที่เครื่องเดียวกัน ไม่ได้กันคนที่ขโมย token ไป
 */
export function useIdleLogout(enabled: boolean, onTimeout: () => void) {
  const [warning, setWarning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const lastActive = useRef(Date.now())
  const timer = useRef<number>()

  const reset = useCallback(() => {
    lastActive.current = Date.now()
    setWarning(false)
  }, [])

  useEffect(() => {
    if (!enabled) return

    const onActivity = () => { lastActive.current = Date.now() }
    for (const ev of EVENTS) window.addEventListener(ev, onActivity, { passive: true })

    timer.current = window.setInterval(() => {
      const idle = Date.now() - lastActive.current
      if (idle >= IDLE_MS) {
        setWarning(false)
        onTimeout()
      } else if (idle >= IDLE_MS - WARN_MS) {
        setWarning(true)
        setSecondsLeft(Math.max(0, Math.ceil((IDLE_MS - idle) / 1000)))
      } else if (idle < IDLE_MS - WARN_MS) {
        setWarning((w) => (w ? false : w))
      }
    }, 1000)

    return () => {
      for (const ev of EVENTS) window.removeEventListener(ev, onActivity)
      if (timer.current) window.clearInterval(timer.current)
    }
  }, [enabled, onTimeout])

  return { warning, secondsLeft, reset, idleMinutes: IDLE_MS / 60000 }
}
