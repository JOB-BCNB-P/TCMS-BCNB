import { useRef, useState } from 'react'
import Papa from 'papaparse'
import { IMPORT_LIMITS, downloadCsv, toCsv } from '@/lib/csv'
import { useToast } from './Toast'

export interface CsvColumn {
  /** หัวคอลัมน์ภาษาไทยในไฟล์ CSV */
  header: string
  /** ชื่อคอลัมน์ในฐานข้อมูล */
  field: string
  required?: boolean
  /** แปลงค่าจากข้อความในไฟล์เป็นค่าที่ส่งเข้าฐานข้อมูล คืน string = ข้อความผิดพลาด */
  parse?: (raw: string) => { value: unknown } | { error: string }
  example?: string
}

interface Props {
  open: boolean
  title: string
  columns: CsvColumn[]
  templateName: string
  importing?: boolean
  onCancel: () => void
  onImport: (rows: Record<string, unknown>[]) => void
}

interface PreviewRow {
  line: number
  values: Record<string, unknown>
  errors: string[]
}

/**
 * นำเข้าข้อมูลจากไฟล์ CSV
 *
 * ตรวจทั้งไฟล์ให้เสร็จก่อน แล้วแสดงให้ดูว่าแถวไหนผิดเพราะอะไร
 * ผู้ใช้จึงเห็นภาพรวมก่อนกดยืนยัน ไม่ใช่ยิงเข้าฐานข้อมูลแล้วพังกลางทาง
 * การตรวจที่นี่เป็นเพียงการช่วยผู้กรอก — ความถูกต้องจริงยังบังคับที่ฐานข้อมูล
 * ผ่าน RLS, CHECK constraint และ trigger เสมอ
 */
export function CsvImport({
  open, title, columns, templateName, importing, onCancel, onImport,
}: Props) {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<PreviewRow[] | null>(null)
  const [fileName, setFileName] = useState('')

  if (!open) return null

  const downloadTemplate = () => {
    downloadCsv(
      templateName,
      toCsv(
        [Object.fromEntries(columns.map((c) => [c.header, c.example ?? ''])) as Record<string, unknown>],
        columns.map((c) => ({ key: c.header, header: c.header })),
      ),
    )
  }

  const handleFile = (file: File) => {
    if (file.size > IMPORT_LIMITS.maxBytes) {
      toast.error(`ไฟล์ใหญ่เกิน ${IMPORT_LIMITS.maxBytes / 1024 / 1024} MB — แบ่งไฟล์ให้เล็กลงก่อน`)
      return
    }
    setFileName(file.name)
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      encoding: 'utf-8',
      complete: (res) => {
        if (res.data.length > IMPORT_LIMITS.maxRows) {
          toast.error(`ไฟล์มี ${res.data.length} แถว เกินครั้งละ ${IMPORT_LIMITS.maxRows} แถว — แบ่งไฟล์ก่อน`)
          return
        }
        const missing = columns
          .filter((c) => c.required && !(res.meta.fields ?? []).includes(c.header))
          .map((c) => c.header)
        if (missing.length > 0) {
          toast.error(`ไฟล์ขาดคอลัมน์ที่จำเป็น: ${missing.join(', ')} — ดาวน์โหลดฟอร์มเปล่าไปใช้เป็นต้นแบบ`)
          return
        }

        const parsed: PreviewRow[] = res.data.map((raw, i) => {
          const values: Record<string, unknown> = {}
          const errors: string[] = []
          for (const c of columns) {
            const text = (raw[c.header] ?? '').trim()
            if (c.required && text === '') {
              errors.push(`${c.header}: จำเป็นต้องกรอก`)
              continue
            }
            if (text === '') { values[c.field] = null; continue }
            if (c.parse) {
              const out = c.parse(text)
              if ('error' in out) errors.push(`${c.header}: ${out.error}`)
              else values[c.field] = out.value
            } else {
              values[c.field] = text
            }
          }
          return { line: i + 2, values, errors }  // +2 เพราะแถวแรกเป็นหัวตาราง
        })
        setRows(parsed)
      },
      error: () => toast.error('อ่านไฟล์ไม่สำเร็จ — ตรวจว่าเป็นไฟล์ CSV และบันทึกเป็น UTF-8'),
    })
  }

  const bad = rows?.filter((r) => r.errors.length > 0) ?? []
  const good = rows?.filter((r) => r.errors.length === 0) ?? []

  return (
    <div
      className="anim-overlay no-print fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !importing) onCancel() }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="csv-title"
        className="anim-dialog card max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-b-none sm:rounded-xl">
        <header className="sticky top-0 border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 id="csv-title" className="text-base font-semibold text-slate-900 dark:text-white">
            นำเข้า{title}จากไฟล์ CSV
          </h2>
        </header>

        <div className="space-y-4 p-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
            <li>ดาวน์โหลดฟอร์มเปล่าไปกรอก (หัวคอลัมน์ต้องคงไว้ตามเดิม)</li>
            <li>บันทึกเป็น CSV UTF-8 แล้วเลือกไฟล์ที่นี่</li>
            <li>ตรวจผลก่อนกดยืนยัน ระบบจะนำเข้าเฉพาะแถวที่ไม่มีข้อผิดพลาด</li>
          </ol>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary !min-h-[40px] !px-3" onClick={downloadTemplate}>
              ดาวน์โหลดฟอร์มเปล่า
            </button>
            <button type="button" className="btn-secondary !min-h-[40px] !px-3"
              onClick={() => fileRef.current?.click()}>
              เลือกไฟล์ CSV
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
            {fileName && <span className="self-center text-sm text-slate-500">{fileName}</span>}
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            จำกัดครั้งละ {IMPORT_LIMITS.maxRows.toLocaleString('th-TH')} แถว
            และไฟล์ไม่เกิน {IMPORT_LIMITS.maxBytes / 1024 / 1024} MB
          </p>

          {rows && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                  พร้อมนำเข้า {good.length} แถว
                </span>
                {bad.length > 0 && (
                  <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-900 dark:bg-rose-950 dark:text-rose-200">
                    มีข้อผิดพลาด {bad.length} แถว (จะถูกข้าม)
                  </span>
                )}
              </div>

              {bad.length > 0 && (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-rose-200 dark:border-rose-900">
                  <table className="w-full text-sm">
                    <thead className="table-head">
                      <tr>
                        <th scope="col" className="px-3 py-2 text-left">บรรทัดที่</th>
                        <th scope="col" className="px-3 py-2 text-left">ปัญหาที่พบ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rose-100 dark:divide-rose-900/50">
                      {bad.map((r) => (
                        <tr key={r.line}>
                          <td className="px-3 py-2 align-top tabular-nums">{r.line}</td>
                          <td className="px-3 py-2">{r.errors.join(' · ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary sm:min-w-[110px]" disabled={importing} onClick={onCancel}>
            ยกเลิก
          </button>
          <button
            type="button" className="btn-primary sm:min-w-[190px]"
            disabled={importing || good.length === 0}
            onClick={() => onImport(good.map((r) => r.values))}
          >
            {importing ? 'กำลังนำเข้า…' : `ยืนยันนำเข้า ${good.length} แถว`}
          </button>
        </footer>
      </div>
    </div>
  )
}
