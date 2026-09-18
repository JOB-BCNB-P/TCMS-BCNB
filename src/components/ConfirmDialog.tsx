import { useEffect, useRef } from 'react'

interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}

/** กล่องยืนยันก่อนทำสิ่งที่ย้อนกลับไม่ได้ — โฟกัสเริ่มที่ "ยกเลิก" เสมอ */
export function ConfirmDialog({
  open, title, message, confirmLabel = 'ยืนยัน', danger, busy, onCancel, onConfirm,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) { e.preventDefault(); onCancel() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel, busy])

  if (!open) return null

  return (
    <div
      className="anim-overlay no-print fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}
    >
      <div role="alertdialog" aria-modal="true" aria-labelledby="cf-title" className="anim-dialog card w-full max-w-sm p-6">
        <h2 id="cf-title" className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {message}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} className="btn-secondary sm:min-w-[110px]">
            ยกเลิก
          </button>
          <button
            type="button" onClick={onConfirm} disabled={busy}
            className={`${danger ? 'btn-danger' : 'btn-primary'} sm:min-w-[130px]`}
          >
            {busy ? 'กำลังดำเนินการ…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
