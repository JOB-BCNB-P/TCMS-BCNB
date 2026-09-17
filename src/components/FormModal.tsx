import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface FieldOption {
  value: string
  label: string
}

export interface FieldSpec {
  name: string
  label: string
  type: 'text' | 'number' | 'select' | 'checkbox' | 'textarea' | 'multiselect' | 'date'
  required?: boolean
  options?: FieldOption[]
  help?: string
  placeholder?: string
  wide?: boolean
  /** ตรวจก่อนส่ง คืนข้อความผิดพลาดเป็นภาษาไทย หรือ null ถ้าผ่าน */
  validate?: (value: unknown, all: Record<string, unknown>) => string | null
}

interface Props {
  open: boolean
  title: string
  fields: FieldSpec[]
  initial: Record<string, unknown>
  saving?: boolean
  onCancel: () => void
  onSubmit: (values: Record<string, unknown>) => void
  /** ส่วนเพิ่มเติมท้ายฟอร์ม เช่น ช่องเลขบัญชีที่มีกลไกของตัวเอง */
  extra?: ReactNode
}

export function FormModal({
  open, title, fields, initial, saving, onCancel, onSubmit, extra,
}: Props) {
  const [values, setValues] = useState<Record<string, unknown>>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const firstRef = useRef<HTMLElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setValues(initial)
      setErrors({})
    }
    // initial เปลี่ยนอ้างอิงทุกครั้งที่ parent render จึงผูกกับ open เท่านั้น
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    firstRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        e.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel, saving])

  if (!open) return null

  const set = (name: string, v: unknown) => {
    setValues((prev) => ({ ...prev, [name]: v }))
    setErrors((prev) => (prev[name] ? { ...prev, [name]: '' } : prev))
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    for (const f of fields) {
      const v = values[f.name]
      if (f.required && (v === undefined || v === null || v === '' ||
          (Array.isArray(v) && v.length === 0))) {
        next[f.name] = 'จำเป็นต้องกรอก'
        continue
      }
      const msg = f.validate?.(v, values)
      if (msg) next[f.name] = msg
    }
    setErrors(next)
    if (Object.keys(next).length > 0) {
      // พาโฟกัสไปช่องแรกที่ผิด ไม่ให้ผู้ใช้ต้องไล่หาเอง
      const first = fields.find((f) => next[f.name])
      if (first) document.getElementById(`fld-${first.name}`)?.focus()
      return
    }
    onSubmit(values)
  }

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onCancel()
      }}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-title"
        className="card max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-b-none sm:rounded-xl"
      >
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 id="form-title" className="text-base font-semibold text-slate-900 dark:text-white">
            {title}
          </h2>
        </header>

        <form onSubmit={submit} className="p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f, i) => (
              <div key={f.name} className={f.wide || f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                <label htmlFor={`fld-${f.name}`} className="field-label">
                  {f.label}
                  {f.required && <span className="ml-1 text-rose-600" aria-hidden="true">*</span>}
                  {f.required && <span className="sr-only"> (จำเป็น)</span>}
                </label>

                {f.type === 'select' ? (
                  <select
                    id={`fld-${f.name}`}
                    ref={i === 0 ? (firstRef as React.Ref<HTMLSelectElement>) : undefined}
                    className="field-input"
                    value={String(values[f.name] ?? '')}
                    onChange={(e) => set(f.name, e.target.value || null)}
                    aria-invalid={!!errors[f.name]}
                    aria-describedby={errors[f.name] ? `err-${f.name}` : f.help ? `help-${f.name}` : undefined}
                  >
                    <option value="">— เลือก —</option>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : f.type === 'multiselect' ? (
                  <div
                    id={`fld-${f.name}`}
                    className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-300 p-2 dark:border-slate-700"
                  >
                    {f.options?.map((o) => {
                      const arr = (values[f.name] as string[] | undefined) ?? []
                      return (
                        <label key={o.value} className="flex min-h-[36px] items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={arr.includes(o.value)}
                            onChange={(e) =>
                              set(f.name, e.target.checked
                                ? [...arr, o.value]
                                : arr.filter((x) => x !== o.value))
                            }
                          />
                          {o.label}
                        </label>
                      )
                    })}
                  </div>
                ) : f.type === 'checkbox' ? (
                  <label className="flex min-h-[44px] items-center gap-2 text-sm">
                    <input
                      id={`fld-${f.name}`}
                      type="checkbox"
                      className="h-5 w-5"
                      checked={!!values[f.name]}
                      onChange={(e) => set(f.name, e.target.checked)}
                    />
                    <span className="text-slate-700 dark:text-slate-300">{f.placeholder ?? 'ใช่'}</span>
                  </label>
                ) : f.type === 'textarea' ? (
                  <textarea
                    id={`fld-${f.name}`}
                    className="field-input min-h-[80px] py-2"
                    rows={3}
                    value={String(values[f.name] ?? '')}
                    onChange={(e) => set(f.name, e.target.value)}
                    aria-invalid={!!errors[f.name]}
                  />
                ) : (
                  <input
                    id={`fld-${f.name}`}
                    ref={i === 0 ? (firstRef as React.Ref<HTMLInputElement>) : undefined}
                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                    inputMode={f.type === 'number' ? 'decimal' : undefined}
                    step={f.type === 'number' ? 'any' : undefined}
                    className="field-input"
                    placeholder={f.placeholder}
                    value={String(values[f.name] ?? '')}
                    onChange={(e) =>
                      set(f.name, f.type === 'number'
                        ? (e.target.value === '' ? null : Number(e.target.value))
                        : e.target.value)
                    }
                    aria-invalid={!!errors[f.name]}
                    aria-describedby={errors[f.name] ? `err-${f.name}` : f.help ? `help-${f.name}` : undefined}
                  />
                )}

                {errors[f.name] ? (
                  <p id={`err-${f.name}`} className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                    <span aria-hidden="true">⚠ </span>{errors[f.name]}
                  </p>
                ) : f.help ? (
                  <p id={`help-${f.name}`} className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {f.help}
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          {extra && <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">{extra}</div>}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onCancel} disabled={saving} className="btn-secondary sm:min-w-[110px]">
              ยกเลิก
            </button>
            <button type="submit" disabled={saving} className="btn-primary sm:min-w-[130px]">
              {saving ? 'กำลังบันทึก…' : 'บันทึก'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
