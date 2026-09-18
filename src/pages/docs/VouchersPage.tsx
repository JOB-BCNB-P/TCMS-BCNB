import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { DataTable } from '@/components/DataTable'
import { FormModal } from '@/components/FormModal'
import { StatusBadge } from '@/components/StatusBadge'
import { useToast } from '@/components/Toast'
import { usePermissions } from '@/hooks/usePermissions'
import { useLookups } from '@/hooks/useCrud'
import { toThaiError } from '@/lib/errors'
import { formatBaht } from '@/lib/format'
import { formatDateBE } from '@/lib/thaiDate'
import { downloadCsv, toCsv } from '@/lib/csv'
import { STATUS_LABEL, type VoucherStatus } from '@/lib/types'

interface VoucherRow {
  id: string
  voucher_no: string | null
  voucher_kind: 'lecturer' | 'clinical_site'
  status: VoucherStatus
  doc_date: string
  subject_text: string | null
  semester_text: string | null
  total_amount: number
  course_offering_id: string
  fiscal_year_id: string
  departments: { name_th: string } | null
  fiscal_years: { year_be: number } | null
}

const KIND_LABEL = {
  lecturer: 'ค่าสอน (อาจารย์พิเศษ)',
  clinical_site: 'ค่าตอบแทนแหล่งฝึก',
} as const

export function VouchersPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const { can } = usePermissions()
  const lookups = useLookups()
  const [fy, setFy] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)

  const list = useQuery({
    queryKey: ['vouchers', fy, status],
    queryFn: async () => {
      let q = supabase.from('payment_vouchers')
        .select('id, voucher_no, voucher_kind, status, doc_date, subject_text, semester_text, total_amount, course_offering_id, fiscal_year_id, departments(name_th), fiscal_years(year_be)')
        .order('created_at', { ascending: false })
      if (fy) q = q.eq('fiscal_year_id', fy)
      if (status) q = q.eq('status', status)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as VoucherRow[]
    },
  })

  const create = useMutation({
    mutationFn: async (v: { course_offering_id: string; voucher_kind: string }) => {
      const off = (lookups.data?.offerings ?? []).find((o) => o.id === v.course_offering_id)

      // ข้อความบนแบบฟอร์มเก็บเป็น snapshot ไม่ join สด
      // เอกสารที่ส่งฎีกาแล้วต้องไม่เปลี่ยนตามการแก้ชื่อวิชาภายหลัง
      const { data: offering, error: offErr } = await supabase
        .from('course_offerings')
        .select('faculty_text, student_year_level, academic_years(year_be), semesters(name_th), courses(code, name_th)')
        .eq('id', v.course_offering_id).single()
      if (offErr) throw offErr
      const o = offering as unknown as {
        faculty_text: string | null
        academic_years: { year_be: number } | null
        semesters: { name_th: string } | null
        courses: { code: string; name_th: string } | null
      }

      const { data, error } = await supabase.from('payment_vouchers').insert({
        course_offering_id: v.course_offering_id,
        voucher_kind: v.voucher_kind,
        faculty_text: o.faculty_text,
        semester_text: o.semesters?.name_th ?? null,
        year_be: o.academic_years?.year_be ?? null,
        subject_text: o.courses ? `${o.courses.code} ${o.courses.name_th}` : (off?.courses?.name_th ?? null),
      }).select('id').single()
      if (error) throw error

      // เช็คลิสต์เอกสารแนบถูกสร้างโดย trigger ในฐานข้อมูล (migration 0015)
      // ไม่สร้างจากที่นี่ เพราะถ้าคำสั่งที่สองพลาด จะได้ใบสำคัญที่ส่งได้โดยไม่ต้องตรวจเอกสารแนบ
      return data.id as string
    },
    onSuccess: (id) => {
      toast.success('สร้างร่างใบเบิกแล้ว')
      void qc.invalidateQueries({ queryKey: ['vouchers'] })
      setCreating(false)
      nav(`/docs/vouchers/${id}`)
    },
    onError: (e) => toast.error(toThaiError(e)),
  })

  /**
   * เตือนเมื่อรายวิชานี้มีใบเบิกอยู่แล้ว
   *
   * ต้องนับจากฐานข้อมูล ไม่ใช่จาก list.data เพราะรายการบนหน้าจอถูกกรอง
   * ด้วยปีงบประมาณและสถานะอยู่ ถ้ามีใบเบิกของภาคเดียวกันในปีงบอื่นจะไม่ถูกนับ
   * แล้วคำเตือน "เบิกภาคละ 1 ครั้ง" จะไม่ขึ้นทั้งที่ควรขึ้น
   */
  const confirmThenCreate = async (v: Record<string, unknown>) => {
    const { count, error } = await supabase
      .from('payment_vouchers')
      .select('id', { count: 'exact', head: true })
      .eq('course_offering_id', String(v.course_offering_id))
      .neq('status', 'cancelled')
    if (error) { toast.error(toThaiError(error)); return }
    if ((count ?? 0) > 0 && !window.confirm(
      `รายวิชานี้มีใบเบิกอยู่แล้ว ${count} ใบ\n` +
      'หลักเกณฑ์กำหนดให้เบิกภาคละ 1 ครั้ง — ถ้าเป็นการเบิกเพิ่มเติมหรือแก้ไข ให้ระบุเหตุผลไว้ในช่องหมายเหตุ\n\n' +
      'ต้องการสร้างใบใหม่ต่อไปหรือไม่')) return
    create.mutate(v as unknown as { course_offering_id: string; voucher_kind: string })
  }

  const rows = useMemo(() => {
    const all = list.data ?? []
    const q = search.trim().toLowerCase()
    if (!q) return all
    return all.filter((r) =>
      `${r.voucher_no ?? ''} ${r.subject_text ?? ''}`.toLowerCase().includes(q))
  }, [list.data, search])

  const offeringOptions = (lookups.data?.offerings ?? []).map((o) => ({
    value: o.id,
    label: `${o.courses?.code ?? ''} ${o.courses?.name_th ?? ''} · ชั้นปี ${o.student_year_level} หมู่ ${o.section}`,
  }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">
            ใบหลักฐานการเบิกจ่ายเงินค่าสอนพิเศษ
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            แบบ FM2.2-03 — ใช้ทั้งของอาจารย์พิเศษและของแหล่งฝึก
          </p>
        </div>
        {can('docs.voucher', 'create') && (
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            + สร้างใบเบิก
          </button>
        )}
      </div>

      {list.error && (
        <div role="alert" className="card border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
          <span aria-hidden="true">⚠ </span>{toThaiError(list.error)}
        </div>
      )}

      <div className="card grid gap-3 p-3 sm:grid-cols-3">
        <div>
          <label htmlFor="f-fy" className="field-label">ปีงบประมาณ</label>
          <select id="f-fy" className="field-input" value={fy} onChange={(e) => setFy(e.target.value)}>
            <option value="">ทุกปีงบประมาณ</option>
            {(lookups.data?.fiscalYears ?? []).map((f) => (
              <option key={f.id as string} value={f.id as string}>พ.ศ. {f.year_be}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-st" className="field-label">สถานะ</label>
          <select id="f-st" className="field-input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">ทุกสถานะ</option>
            {(Object.keys(STATUS_LABEL) as VoucherStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-q" className="field-label">ค้นหา</label>
          <input id="f-q" className="field-input" placeholder="เลขที่ใบสำคัญ หรือชื่อวิชา"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <DataTable
        title="ใบหลักฐานการเบิกจ่าย"
        rows={rows}
        rowKey={(r) => r.id}
        loading={list.isLoading || lookups.isLoading}
        emptyText="ยังไม่มีใบเบิก — กดปุ่มสร้างใบเบิกเพื่อเริ่ม"
        toolbar={
          <button type="button" className="btn-secondary !min-h-[40px] !px-3" disabled={rows.length === 0}
            onClick={() => downloadCsv('ใบหลักฐานการเบิกจ่าย', toCsv(
              rows.map((r) => ({
                no: r.voucher_no ?? '',
                kind: KIND_LABEL[r.voucher_kind],
                subject: r.subject_text ?? '',
                dept: r.departments?.name_th ?? '',
                fy: r.fiscal_years?.year_be ?? '',
                date: formatDateBE(r.doc_date),
                total: r.total_amount,
                status: STATUS_LABEL[r.status],
              })),
              [
                { key: 'no', header: 'เลขที่ใบสำคัญ' },
                { key: 'kind', header: 'ประเภท' },
                { key: 'subject', header: 'วิชา' },
                { key: 'dept', header: 'สาขาวิชา' },
                { key: 'fy', header: 'ปีงบประมาณ' },
                { key: 'date', header: 'ลงวันที่' },
                { key: 'total', header: 'จำนวนเงิน' },
                { key: 'status', header: 'สถานะ' },
              ],
            ))}>
            ส่งออก CSV
          </button>
        }
        columns={[
          {
            key: 'no', header: 'เลขที่ / วิชา',
            render: (r) => (
              <div>
                <span className="font-medium">{r.voucher_no ?? '(ยังไม่มีเลขที่)'}</span>
                <span className="block text-xs text-slate-500">
                  {r.subject_text ?? '-'} · {KIND_LABEL[r.voucher_kind]}
                </span>
              </div>
            ),
          },
          { key: 'dept', header: 'สาขาวิชา', hideOnMobile: true, render: (r) => r.departments?.name_th ?? '-' },
          { key: 'date', header: 'ลงวันที่', hideOnMobile: true, render: (r) => formatDateBE(r.doc_date) },
          { key: 'total', header: 'จำนวนเงิน', align: 'right', render: (r) => formatBaht(r.total_amount) },
          { key: 'status', header: 'สถานะ', render: (r) => <StatusBadge status={r.status} /> },
          {
            key: '__a', header: 'จัดการ', align: 'right',
            render: (r) => (
              <button type="button" onClick={() => nav(`/docs/vouchers/${r.id}`)}
                className="rounded px-2 py-1 text-xs text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-slate-800">
                เปิด
              </button>
            ),
          },
        ]}
      />

      <FormModal
        open={creating}
        title="สร้างใบเบิกใหม่"
        saving={create.isPending}
        onCancel={() => setCreating(false)}
        fields={[
          {
            name: 'course_offering_id', label: 'รายวิชาที่เปิดสอน', type: 'select', required: true,
            options: offeringOptions, wide: true,
            help: offeringOptions.length === 0
              ? 'ยังไม่มีรายวิชาที่เปิดสอน — สร้างที่เมนู "รายวิชาที่เปิดสอน" ก่อน'
              : 'ข้อความบนแบบฟอร์ม (คณะ ภาค พ.ศ. วิชา) จะถูกเติมจากรายการนี้ และแก้ได้ในหน้าถัดไป',
          },
          {
            name: 'voucher_kind', label: 'ประเภทใบเบิก', type: 'select', required: true, wide: true,
            options: [
              { value: 'lecturer', label: KIND_LABEL.lecturer },
              { value: 'clinical_site', label: KIND_LABEL.clinical_site },
            ],
            help: 'ใช้แบบฟอร์ม FM2.2-03 เหมือนกันทั้งสองประเภท ต่างกันที่ผู้รับเงินในแต่ละบรรทัด',
          },
        ]}
        initial={{ course_offering_id: '', voucher_kind: 'lecturer' }}
        onSubmit={(v) => { void confirmThenCreate(v) }}
      />
    </div>
  )
}
