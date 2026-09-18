import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { DataTable, type Column } from '@/components/DataTable'
import { formatTimestampBE } from '@/lib/thaiDate'
import { toThaiError } from '@/lib/errors'
import { useAuth } from '@/auth/AuthProvider'

interface AuditRow {
  id: number
  occurred_at: string
  actor_email: string | null
  actor_role: string | null
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  schema_name: string
  table_name: string
  record_id: string | null
  before_data: Record<string, unknown> | null
  after_data: Record<string, unknown> | null
}

const ACTION_LABEL = { INSERT: 'เพิ่ม', UPDATE: 'แก้ไข', DELETE: 'ลบ' } as const
const ACTION_STYLE = {
  INSERT: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  UPDATE: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  DELETE: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
} as const

const TABLE_LABEL: Record<string, string> = {
  payment_vouchers: 'ใบหลักฐานการเบิกจ่าย',
  voucher_lines: 'รายการในใบหลักฐาน',
  treasury_cover_sheets: 'หน้างบใบสำคัญฯ',
  treasury_cover_sheet_items: 'รายการในหน้างบฯ',
  course_budget_allocations: 'วงเงินรายวิชา',
  pay_rates: 'อัตราค่าตอบแทน',
  payees: 'อาจารย์พิเศษ/แหล่งฝึก',
  clinical_sites: 'แหล่งฝึกปฏิบัติการ',
  courses: 'รายวิชา',
  course_offerings: 'รายวิชาที่เปิดสอน',
  user_profiles: 'ผู้ใช้งาน',
  user_department_scopes: 'ขอบเขตสาขาของผู้ใช้',
  role_menu_permissions: 'สิทธิ์เมนูของบทบาท',
  app_settings: 'ค่าตั้งค่าระบบ',
  fiscal_years: 'ปีงบประมาณ',
}

/** คอลัมน์ที่ไม่ต้องแสดงในหน้าต่างเปรียบเทียบ เพราะเปลี่ยนทุกครั้งและไม่มีความหมาย */
const NOISE = new Set(['updated_at', 'created_at'])

function diffFields(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  const out: { field: string; from: unknown; to: unknown }[] = []
  for (const k of keys) {
    if (NOISE.has(k)) continue
    const a = before?.[k]
    const b = after?.[k]
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ field: k, from: a, to: b })
  }
  return out
}

const show = (v: unknown) =>
  v === null || v === undefined || v === '' ? '(ว่าง)' : typeof v === 'object' ? JSON.stringify(v) : String(v)

export function AuditPage() {
  const { user } = useAuth()
  const [table, setTable] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [open, setOpen] = useState<AuditRow | null>(null)

  const canView = user?.role_code === 'admin' || user?.role_code === 'executive'

  const q = useQuery({
    queryKey: ['audit', table, from, to],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('read_audit_log', {
        p_table: table || null,
        p_record_id: null,
        p_from: from ? new Date(`${from}T00:00:00+07:00`).toISOString() : null,
        // ถึงสิ้นวันที่เลือก — RPC ใช้เงื่อนไข < p_to จึงบวกไปหนึ่งวัน
        // บวกด้วย Date ไม่ใช่การแทนที่ข้อความ เพราะวันสิ้นเดือนจะข้ามเดือนเอง
        p_to: to ? new Date(new Date(`${to}T00:00:00+07:00`).getTime() + 86_400_000).toISOString() : null,
        p_limit: 200,
        p_offset: 0,
      })
      if (error) throw error
      return (data ?? []) as AuditRow[]
    },
  })

  if (!canView) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">ร่องรอยการใช้งาน</h1>
        <div className="card p-6 text-sm text-slate-600 dark:text-slate-300">
          หน้านี้เปิดให้เฉพาะผู้ดูแลระบบและผู้บริหาร
        </div>
      </div>
    )
  }

  const columns: Column<AuditRow>[] = [
    { key: 'when', header: 'เมื่อ', render: (r) => formatTimestampBE(r.occurred_at) },
    {
      key: 'action', header: 'ทำอะไร',
      render: (r) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_STYLE[r.action]}`}>
          {ACTION_LABEL[r.action]}
        </span>
      ),
    },
    { key: 'table', header: 'กับข้อมูลใด', render: (r) => TABLE_LABEL[r.table_name] ?? r.table_name },
    { key: 'actor', header: 'โดยใคร', render: (r) => r.actor_email ?? '(ระบบ)' },
    { key: 'role', header: 'บทบาท', hideOnMobile: true, render: (r) => r.actor_role ?? '-' },
    {
      key: 'view', header: '', align: 'right',
      render: (r) => (
        <button type="button" onClick={() => setOpen(r)}
          className="btn-link-brand">
          ดูรายละเอียด
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">ร่องรอยการใช้งาน</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          บันทึกทุกการเพิ่ม แก้ไข และลบข้อมูลการเงิน — ลบหรือแก้ไขรายการในนี้ไม่ได้ แม้โดยผู้ดูแลระบบ
        </p>
      </div>

      {q.error && (
        <div role="alert" className="card border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
          <span aria-hidden="true">⚠ </span>{toThaiError(q.error)}
        </div>
      )}

      <section className="card p-4">
        <h2 className="sr-only">ตัวกรอง</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="a-table" className="field-label">ข้อมูล</label>
            <select id="a-table" className="field-input" value={table} onChange={(e) => setTable(e.target.value)}>
              <option value="">ทั้งหมด</option>
              {Object.entries(TABLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="a-from" className="field-label">ตั้งแต่วันที่</label>
            <input id="a-from" type="date" className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label htmlFor="a-to" className="field-label">ถึงวันที่</label>
            <input id="a-to" type="date" className="field-input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          แสดงได้สูงสุด 200 รายการล่าสุดต่อการค้นหนึ่งครั้ง — ถ้าต้องการช่วงกว้างกว่านี้ให้แคบตัวกรองลง
        </p>
      </section>

      <DataTable
        title="รายการที่พบ"
        rows={q.data ?? []}
        columns={columns}
        rowKey={(r) => String(r.id)}
        loading={q.isLoading}
        emptyText="ไม่พบร่องรอยในช่วงที่เลือก"
      />

      {open && (
        <div
          className="no-print fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(null) }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="ad-title"
            className="card max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-b-none sm:rounded-xl">
            <header className="sticky top-0 border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h2 id="ad-title" className="text-base font-semibold text-slate-900 dark:text-white">
                {ACTION_LABEL[open.action]}{TABLE_LABEL[open.table_name] ?? open.table_name}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {formatTimestampBE(open.occurred_at)} · โดย {open.actor_email ?? '(ระบบ)'}
                {open.actor_role ? ` (${open.actor_role})` : ''}
              </p>
            </header>

            <div className="p-4">
              <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                รหัสอ้างอิง: <span className="font-mono">{open.record_id ?? '-'}</span>
              </p>
              <table className="w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left">ช่องข้อมูล</th>
                    <th scope="col" className="px-3 py-2 text-left">ก่อน</th>
                    <th scope="col" className="px-3 py-2 text-left">หลัง</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {diffFields(open.before_data, open.after_data).map((d) => (
                    <tr key={d.field}>
                      <td className="px-3 py-2 align-top font-mono text-xs">{d.field}</td>
                      <td className="px-3 py-2 align-top break-all text-rose-700 dark:text-rose-400">{show(d.from)}</td>
                      <td className="px-3 py-2 align-top break-all text-emerald-700 dark:text-emerald-400">{show(d.to)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <footer className="sticky bottom-0 border-t border-slate-200 bg-white p-4 text-right dark:border-slate-800 dark:bg-slate-900">
              <button type="button" className="btn-secondary" onClick={() => setOpen(null)}>ปิด</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}
