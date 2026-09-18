import {
  createContext, useCallback, useContext, useMemo, useState, type ReactNode,
} from 'react'

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  text: string
}

interface ToastApi {
  success: (text: string) => void
  error: (text: string) => void
  info: (text: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const STYLE: Record<ToastKind, { cls: string; icon: string; label: string }> = {
  success: {
    cls: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100',
    icon: '✔', label: 'สำเร็จ',
  },
  error: {
    cls: 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100',
    icon: '⚠', label: 'ผิดพลาด',
  },
  info: {
    cls: 'border-brand-300 bg-brand-50 text-brand-900 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-100',
    icon: 'ℹ', label: 'แจ้งให้ทราบ',
  },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((kind: ToastKind, text: string) => {
    const id = Date.now() + Math.random()
    setItems((v) => [...v, { id, kind, text }])
    // ข้อความผิดพลาดค้างนานกว่า เพราะผู้ใช้ต้องอ่านและมักต้องจดไว้แก้
    const ms = kind === 'error' ? 12_000 : 4_000
    window.setTimeout(() => setItems((v) => v.filter((t) => t.id !== id)), ms)
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      success: (t) => push('success', t),
      error: (t) => push('error', t),
      info: (t) => push('info', t),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end"
        aria-live="polite"
        aria-atomic="false"
      >
        {items.map((t) => {
          const s = STYLE[t.kind]
          return (
            <div
              key={t.id}
              role={t.kind === 'error' ? 'alert' : 'status'}
              className={`anim-toast pointer-events-auto w-full max-w-md rounded-xl border p-3 text-sm shadow-card ${s.cls}`}
            >
              <div className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-0.5">{s.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.label}</p>
                  <p className="mt-0.5 whitespace-pre-line break-words">{t.text}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setItems((v) => v.filter((x) => x.id !== t.id))}
                  className="shrink-0 rounded px-1 text-lg leading-none opacity-60 transition-opacity duration-150 hover:opacity-100"
                  aria-label="ปิดข้อความ"
                >
                  ×
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast ต้องอยู่ภายใต้ ToastProvider')
  return ctx
}
