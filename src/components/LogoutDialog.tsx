import { useEffect, useRef } from 'react'

interface Props {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
}

/**
 * ป๊อปอัพยืนยันการออกจากระบบตามข้อกำหนด
 * - ข้อความต้องไม่อ้างว่าออกจากบัญชี Google ทั้งเบราว์เซอร์
 * - ใช้แป้นพิมพ์ได้: Esc ยกเลิก, โฟกัสเริ่มที่ปุ่มยกเลิก, ขังโฟกัสไว้ในกล่อง
 */
export function LogoutDialog({ open, onCancel, onConfirm }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
        return
      }
      if (e.key !== 'Tab' || !boxRef.current) return
      const focusable = boxRef.current.querySelectorAll<HTMLElement>('button')
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        ref={boxRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="logout-title"
        aria-describedby="logout-desc"
        className="card w-full max-w-sm p-6"
      >
        <h2 id="logout-title" className="text-lg font-semibold text-slate-900 dark:text-white">
          ท่านต้องการออกจากระบบหรือไม่?
        </h2>
        <p id="logout-desc" className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          ระบบจะยกเลิกการเข้าใช้งานนี้และล้างข้อมูลที่ค้างอยู่บนหน้าจอ
          จากนั้นกลับไปยังหน้าเข้าสู่ระบบ
          <br />
          <span className="text-slate-500 dark:text-slate-400">
            การออกจากระบบนี้ไม่ได้ออกจากบัญชี Google ของท่านในเบราว์เซอร์
          </span>
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" onClick={onCancel} className="btn-secondary sm:min-w-[110px]">
            ยกเลิก
          </button>
          <button type="button" onClick={onConfirm} className="btn-danger sm:min-w-[170px]">
            ยืนยันออกจากระบบ
          </button>
        </div>
      </div>
    </div>
  )
}
