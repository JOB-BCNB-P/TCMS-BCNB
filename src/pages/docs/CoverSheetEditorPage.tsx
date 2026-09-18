import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { usePermissions } from '@/hooks/usePermissions'
import { usePrintPage } from '@/hooks/usePrintPage'
import { settingObject, settingText, useAppSettings } from '@/hooks/useAppSettings'
import { FormModal, type FieldSpec } from '@/components/FormModal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { StatusBadge } from '@/components/StatusBadge'
import { useToast } from '@/components/Toast'
import { assertAffected, toThaiError } from '@/lib/errors'
import { bahtText, formatBaht, fullName } from '@/lib/format'
import { formatMonthBE } from '@/lib/thaiDate'
import type { VoucherStatus } from '@/lib/types'
import { CoverSheetPrint, type CoverItem } from './CoverSheetPrint'
import { STUDY_LEVEL_LABEL, TEACHER_TYPE_LABEL } from './CoverSheetsPage'

interface Sheet {
  id: string
  sheet_no: string | null
  fiscal_year_id: string
  teacher_type: 'regular' | 'special'
  study_level: 'bachelor' | 'below_bachelor'
  program_name: string
  student_year_level: number | null
  period_month: string
  requester_name: string | null; requester_position: string | null; request_date: string | null
  approver_name: string | null; approver_position: string | null; approve_date: string | null
  total_amount: number
  status: VoucherStatus
  note: string | null
  created_by: string | null
}

interface Item {
  id: string
  line_no: number
  voucher_id: string
  teacher_name: string
  subject_text: string
  hours: number | null
  amount: number
  subtotal: number
  note: string | null
  payment_vouchers: { voucher_no: string | null; status: VoucherStatus } | null
}

interface Candidate {
  id: string
  voucher_no: string | null
  subject_text: string | null
  total_amount: number
  status: VoucherStatus
  created_by: string | null
  submitted_by: string | null
  voucher_lines: {
    hours: number | null
    payees: { prefix: string | null; first_name: string; last_name: string } | null
    clinical_sites: { name_th: string } | null
  }[]
}

/** ชื่อผู้สอนบนหน้างบฯ เป็น snapshot ของยอดใบสำคัญ ณ วันทำเอกสาร */
function teacherNameOf(c: Candidate): string {
  const names = new Set<string>()
  for (const l of c.voucher_lines ?? []) {
    if (l.payees) names.add(fullName(l.payees.prefix, l.payees.first_name, l.payees.last_name))
    else if (l.clinical_sites) names.add(l.clinical_sites.name_th)
  }
  const arr = [...names]
  if (arr.length === 0) return '-'
  if (arr.length === 1) return arr[0]
  return `${arr[0]} และอื่น ๆ รวม ${arr.length} ราย`
}

function hoursOf(c: Candidate): number | null {
  const vals = (c.voucher_lines ?? []).map((l) => l.hours).filter((h): h is number => h !== null)
  if (vals.length === 0) return null
  return vals.reduce((a, b) => a + b, 0)
}

export function CoverSheetEditorPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const { user } = useAuth()
  const { can } = usePermissions()
  usePrintPage('portrait')

  const [editHeader, setEditHeader] = useState(false)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Item | null>(null)

  const sq = useQuery({
    queryKey: ['cover-sheet', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('treasury_cover_sheets').select('*').eq('id', id).single()
      if (error) throw error
      return data as unknown as Sheet
    },
  })

  const iq = useQuery({
    queryKey: ['cover-sheet-items', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('treasury_cover_sheet_items')
        .select('*, payment_vouchers(voucher_no, status)')
        .eq('sheet_id', id).order('line_no')
      if (error) throw error
      return (data ?? []) as unknown as Item[]
    },
  })

  const settings = useAppSettings()

  const fyId = sq.data?.fiscal_year_id
  const candidates = useQuery({
    enabled: !!fyId,
    queryKey: ['cover-candidates', fyId],
    queryFn: async () => {
      const [vs, used] = await Promise.all([
        supabase.from('payment_vouchers')
          .select('id, voucher_no, subject_text, total_amount, status, created_by, submitted_by, voucher_lines(hours, payees(prefix, first_name, last_name), clinical_sites(name_th))')
          .eq('fiscal_year_id', fyId)
          .in('status', ['submitted', 'verified', 'paid'])
          .order('voucher_no'),
        supabase.from('treasury_cover_sheet_items').select('voucher_id'),
      ])
      if (vs.error) throw vs.error
      if (used.error) throw used.error
      const taken = new Set((used.data ?? []).map((r) => r.voucher_id as string))
      return ((vs.data ?? []) as unknown as Candidate[]).filter((v) => !taken.has(v.id))
    },
  })

  const s = sq.data
  const items = iq.data ?? []
  const isAdmin = user?.role_code === 'admin'
  const editable = !!s && can('docs.cover', 'update') && (s.status === 'draft' || s.status === 'submitted')

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['cover-sheet', id] })
    void qc.invalidateQueries({ queryKey: ['cover-sheet-items', id] })
    void qc.invalidateQueries({ queryKey: ['cover-candidates'] })
    void qc.invalidateQueries({ queryKey: ['cover-sheets'] })
  }

  const saveHeader = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { data, error } = await supabase.from('treasury_cover_sheets')
        .update(values).eq('id', id).select('id')
      if (error) throw error
      assertAffected(data)
    },
    onSuccess: () => { toast.success('บันทึกหัวเอกสารเรียบร้อย'); setEditHeader(false); invalidate() },
    onError: (e) => toast.error(toThaiError(e)),
  })

  const addItem = useMutation({
    mutationFn: async (voucherId: string) => {
      const c = (candidates.data ?? []).find((x) => x.id === voucherId)
      if (!c) throw new Error('ไม่พบใบสำคัญที่เลือก')
      const nextNo = items.reduce((m, i) => Math.max(m, i.line_no), 0) + 1
      const { error } = await supabase.from('treasury_cover_sheet_items').insert({
        sheet_id: id,
        voucher_id: voucherId,
        line_no: nextNo,
        teacher_name: teacherNameOf(c),
        subject_text: c.subject_text ?? '-',
        hours: hoursOf(c),
        amount: c.total_amount,
        subtotal: c.total_amount,
      })
      if (error) throw error
    },
    onSuccess: () => { toast.success('เพิ่มใบสำคัญขึ้นหน้างบฯ แล้ว'); setAdding(false); invalidate() },
    onError: (e) => toast.error(toThaiError(e)),
  })

  const removeItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { data, error } = await supabase.from('treasury_cover_sheet_items')
        .delete().eq('id', itemId).select('id')
      if (error) throw error
      assertAffected(data)
    },
    onSuccess: () => { toast.success('นำออกจากหน้างบฯ แล้ว'); setRemoving(null); invalidate() },
    onError: (e) => toast.error(toThaiError(e)),
  })

  const setStatus = useMutation({
    mutationFn: async (next: VoucherStatus) => {
      const { data, error } = await supabase.from('treasury_cover_sheets')
        .update({ status: next }).eq('id', id).select('id')
      if (error) throw error
      assertAffected(data)
    },
    onSuccess: () => { toast.success('เปลี่ยนสถานะเรียบร้อย'); invalidate() },
    onError: (e) => toast.error(toThaiError(e)),
  })

  const director = settingObject(settings.data, 'org.director')

  const headerFields: FieldSpec[] = [
    { name: 'sheet_no', label: 'ประกอบฎีกาที่', type: 'text' },
    { name: 'program_name', label: 'หลักสูตร', type: 'text', required: true },
    { name: 'student_year_level', label: 'ชั้นปีที่', type: 'number' },
    {
      name: 'teacher_type', label: 'ประเภทผู้สอน', type: 'select', required: true,
      options: [
        { value: 'special', label: TEACHER_TYPE_LABEL.special },
        { value: 'regular', label: TEACHER_TYPE_LABEL.regular },
      ],
    },
    {
      name: 'study_level', label: 'ระดับ', type: 'select', required: true,
      options: [
        { value: 'bachelor', label: STUDY_LEVEL_LABEL.bachelor },
        { value: 'below_bachelor', label: STUDY_LEVEL_LABEL.below_bachelor },
      ],
    },
    { name: 'period_month', label: 'ประจำเดือน', type: 'date', required: true },
    { name: 'requester_name', label: 'ผู้เบิก', type: 'text' },
    { name: 'requester_position', label: 'ตำแหน่งผู้เบิก', type: 'text' },
    { name: 'request_date', label: 'วันที่ (ผู้เบิก)', type: 'date' },
    { name: 'approver_name', label: 'ผู้อนุมัติ', type: 'text' },
    { name: 'approver_position', label: 'ตำแหน่งผู้อนุมัติ', type: 'text' },
    { name: 'approve_date', label: 'วันที่ (ผู้อนุมัติ)', type: 'date' },
    { name: 'note', label: 'หมายเหตุภายใน', type: 'textarea' },
  ]

  const printItems: CoverItem[] = items.map((i) => ({
    line_no: i.line_no,
    voucher_no: i.payment_vouchers?.voucher_no ?? null,
    teacher_name: i.teacher_name,
    subject_text: i.subject_text,
    hours: i.hours,
    amount: i.amount,
    subtotal: i.subtotal,
    note: i.note,
  }))

  const candidateOptions = useMemo(() => (candidates.data ?? []).map((c) => ({
    value: c.id,
    label: `${c.voucher_no ?? '(ไม่มีเลขที่)'} · ${c.subject_text ?? '-'} · ${formatBaht(c.total_amount)} บาท`,
  })), [candidates.data])

  if (sq.isLoading) return <p className="text-sm text-slate-500">กำลังโหลดเอกสาร…</p>
  if (sq.error || !s) {
    return (
      <div role="alert" className="card border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
        <span aria-hidden="true">⚠ </span>{sq.error ? toThaiError(sq.error) : 'ไม่พบเอกสาร'}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="no-print card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <button type="button" onClick={() => nav('/docs/cover-sheets')}
            className="text-xs text-brand-700 hover:underline dark:text-brand-300">
            ← กลับไปรายการหน้างบฯ
          </button>
          <h1 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
            {s.sheet_no ? `ประกอบฎีกาที่ ${s.sheet_no}` : 'หน้างบฯ (ยังไม่ระบุเลขที่)'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            ประจำเดือน {formatMonthBE(s.period_month)} · รวม {formatBaht(s.total_amount)} บาท
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={s.status} />
          <button type="button" className="btn-secondary !min-h-[40px] !px-3" onClick={() => window.print()}>
            พิมพ์หน้างบฯ
          </button>
          {s.status === 'draft' && editable && (
            <button type="button" className="btn-primary !min-h-[40px] !px-3"
              disabled={items.length === 0 || setStatus.isPending}
              onClick={() => setStatus.mutate('submitted')}>
              ส่งฎีกา
            </button>
          )}
          {s.status === 'submitted' && isAdmin && (
            <button type="button" className="btn-secondary !min-h-[40px] !px-3"
              onClick={() => setStatus.mutate('draft')}>
              ย้อนกลับเป็นร่าง
            </button>
          )}
        </div>
      </div>

      <div className="no-print card p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">หัวเอกสารและช่องลงนาม</h2>
          {editable && (
            <button type="button" className="btn-secondary !min-h-[36px] !px-3 !text-xs"
              onClick={() => setEditHeader(true)}>
              แก้ไข
            </button>
          )}
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {([
            ['ประเภทผู้สอน', TEACHER_TYPE_LABEL[s.teacher_type]],
            ['ระดับ', STUDY_LEVEL_LABEL[s.study_level]],
            ['หลักสูตร', s.program_name],
            ['ชั้นปีที่', s.student_year_level],
            ['ประจำเดือน', formatMonthBE(s.period_month)],
            ['ผู้เบิก', s.requester_name],
            ['ผู้อนุมัติ', s.approver_name],
          ] as [string, string | number | null][]).map(([k, val]) => (
            <div key={k}>
              <dt className="text-xs text-slate-500 dark:text-slate-400">{k}</dt>
              <dd className="text-slate-800 dark:text-slate-100">{val ?? '—'}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="no-print card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">ใบสำคัญที่นำขึ้นฎีกา</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              เลือกได้เฉพาะใบสำคัญที่ส่งแล้วในปีงบประมาณเดียวกัน และยังไม่เคยขึ้นหน้างบฯ ใดมาก่อน
            </p>
          </div>
          {editable && (
            <button type="button" className="btn-primary !min-h-[36px] !px-3 !text-xs"
              onClick={() => setAdding(true)}>
              + เพิ่มใบสำคัญ
            </button>
          )}
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="table-head">
              <tr>
                <th scope="col" className="px-2 py-2 text-left">#</th>
                <th scope="col" className="px-2 py-2 text-left">ใบสำคัญ</th>
                <th scope="col" className="px-2 py-2 text-left">ชื่อผู้สอน / วิชา</th>
                <th scope="col" className="px-2 py-2 text-right">หน่วย ชม.</th>
                <th scope="col" className="px-2 py-2 text-right">รวมเงิน</th>
                {editable && <th scope="col" className="px-2 py-2 text-right">จัดการ</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {items.length === 0 && (
                <tr><td colSpan={editable ? 6 : 5} className="px-2 py-6 text-center text-slate-500">
                  ยังไม่มีใบสำคัญในหน้างบฯ นี้
                </td></tr>
              )}
              {items.map((i) => (
                <tr key={i.id}>
                  <td className="px-2 py-2">{i.line_no}</td>
                  <td className="px-2 py-2">{i.payment_vouchers?.voucher_no ?? '-'}</td>
                  <td className="px-2 py-2">
                    {i.teacher_name}
                    <span className="block text-xs text-slate-500">{i.subject_text}</span>
                  </td>
                  <td className="px-2 py-2 text-right">{i.hours ?? '-'}</td>
                  <td className="px-2 py-2 text-right font-medium">{formatBaht(i.subtotal)}</td>
                  {editable && (
                    <td className="px-2 py-2 text-right">
                      <button type="button" onClick={() => setRemoving(i)}
                        className="btn-link-danger">
                        นำออก
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 dark:border-slate-700">
                <td colSpan={4} className="px-2 py-2 text-right font-semibold">รวมทั้งสิ้น</td>
                <td className="px-2 py-2 text-right font-semibold">{formatBaht(s.total_amount)}</td>
                {editable && <td />}
              </tr>
              <tr>
                <td colSpan={editable ? 6 : 5} className="px-2 pb-2 text-right text-xs text-slate-500">
                  ({bahtText(s.total_amount)})
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="print-only">
        <CoverSheetPrint
          s={{
            sheet_no: s.sheet_no,
            org_name: settingText(settings.data, 'org.name'),
            teacher_type: s.teacher_type,
            study_level: s.study_level,
            program_name: s.program_name,
            student_year_level: s.student_year_level,
            period_month: s.period_month,
            total_amount: s.total_amount,
            requester_name: s.requester_name,
            requester_position: s.requester_position,
            request_date: s.request_date,
            approver_name: s.approver_name ?? ([director.prefix, director.name].filter(Boolean).join('') || null),
            approver_position: s.approver_position ?? director.position ?? null,
            approve_date: s.approve_date,
          }}
          items={printItems}
        />
      </div>

      <FormModal
        open={editHeader}
        title="แก้ไขหัวเอกสารหน้างบฯ"
        fields={headerFields}
        saving={saveHeader.isPending}
        onCancel={() => setEditHeader(false)}
        initial={{
          sheet_no: s.sheet_no ?? '', program_name: s.program_name,
          student_year_level: s.student_year_level ?? null,
          teacher_type: s.teacher_type, study_level: s.study_level,
          period_month: s.period_month,
          requester_name: s.requester_name ?? '', requester_position: s.requester_position ?? '',
          request_date: s.request_date ?? '',
          approver_name: s.approver_name ?? ([director.prefix, director.name].filter(Boolean).join('') || ''),
          approver_position: s.approver_position ?? director.position ?? '',
          approve_date: s.approve_date ?? '',
          note: s.note ?? '',
        }}
        onSubmit={(values) => {
          const clean: Record<string, unknown> = {}
          for (const [k, val] of Object.entries(values)) clean[k] = val === '' ? null : val
          clean.period_month = `${String(values.period_month).slice(0, 7)}-01`
          saveHeader.mutate(clean)
        }}
      />

      <FormModal
        open={adding}
        title="เพิ่มใบสำคัญขึ้นหน้างบฯ"
        saving={addItem.isPending}
        onCancel={() => setAdding(false)}
        fields={[{
          name: 'voucher_id', label: 'ใบสำคัญ', type: 'select', required: true, wide: true,
          options: candidateOptions,
          help: candidateOptions.length === 0
            ? 'ไม่มีใบสำคัญที่ยังไม่ถูกนำขึ้นหน้างบฯ ในปีงบประมาณนี้'
            : 'ยอดเงินและชื่อผู้สอนจะถูกคัดลอกมาเป็น snapshot ณ ตอนนี้',
        }]}
        initial={{ voucher_id: '' }}
        onSubmit={(v) => addItem.mutate(String(v.voucher_id))}
      />

      <ConfirmDialog
        open={!!removing}
        danger
        title="นำใบสำคัญออกจากหน้างบฯ"
        message={'ใบสำคัญจะกลับไปเป็นรายการที่เลือกขึ้นหน้างบฯ ใหม่ได้\nการนำออกถูกบันทึกไว้ในร่องรอยการใช้งาน'}
        confirmLabel="ยืนยันนำออก"
        busy={removeItem.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => { if (removing) removeItem.mutate(removing.id) }}
      />

      {s.status === 'draft' && items.length === 0 && (
        <p className="no-print text-xs text-slate-500">
          ต้องมีใบสำคัญอย่างน้อยหนึ่งฉบับจึงจะส่งฎีกาได้
        </p>
      )}
    </div>
  )
}
