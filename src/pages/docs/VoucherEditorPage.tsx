import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { usePermissions } from '@/hooks/usePermissions'
import { useLookups } from '@/hooks/useCrud'
import { usePrintPage } from '@/hooks/usePrintPage'
import { settingObject, settingText, useAppSettings } from '@/hooks/useAppSettings'
import { FormModal, type FieldSpec } from '@/components/FormModal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { StatusBadge } from '@/components/StatusBadge'
import { useToast } from '@/components/Toast'
import { assertAffected, toThaiError } from '@/lib/errors'
import { bahtText, formatBaht, fullName } from '@/lib/format'
import { formatDateBE, formatMonthBE, todayBangkok } from '@/lib/thaiDate'
import { EXPENSE_ITEM_LABEL, type VoucherStatus } from '@/lib/types'
import { VoucherPrint, type PrintLine } from './VoucherPrint'

interface Voucher {
  id: string
  voucher_no: string | null
  voucher_kind: 'lecturer' | 'clinical_site'
  status: VoucherStatus
  course_offering_id: string
  department_id: string
  fiscal_year_id: string
  faculty_text: string | null
  semester_text: string | null
  year_be: number | null
  subject_text: string | null
  teaching_level: 'bachelor' | 'graduate'
  doc_date: string
  preparer_coordinator_id: string | null
  preparer_position: string | null
  preparer_date: string | null
  payer_name: string | null; payer_position: string | null; payer_date: string | null
  certifier_name: string | null; certifier_position: string | null; certifier_date: string | null
  approver_name: string | null; approver_position: string | null; approver_date: string | null
  total_amount: number
  amount_in_words: string | null
  payment_date: string | null
  cancel_reason: string | null
  note: string | null
  created_by: string | null
  submitted_by: string | null
}

interface Line {
  id: string
  line_no: number
  payee_id: string | null
  clinical_site_id: string | null
  budget_category_id: string
  expense_item: string
  teaching_level: 'bachelor' | 'graduate'
  is_invited_external: boolean
  teaching_month: string | null
  student_year_level: number | null
  hours: number | null
  quantity: number | null
  rate: number | null
  amount: number
  receipt_date: string | null
  note: string | null
  payees: { prefix: string | null; first_name: string; last_name: string; position_title: string | null; is_government_officer: boolean } | null
  clinical_sites: { name_th: string; ward: string | null } | null
  budget_categories: { name_th: string; fund_source: string; expense_item: string } | null
}

const PERSON = 'p:'
const SITE = 's:'

export function VoucherEditorPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const { user } = useAuth()
  const { can } = usePermissions()
  const lookups = useLookups()
  usePrintPage('landscape')

  const [editHeader, setEditHeader] = useState(false)
  const [editLine, setEditLine] = useState<Line | null | undefined>(undefined)
  const [deleteLine, setDeleteLine] = useState<Line | null>(null)
  const [statusAction, setStatusAction] = useState<VoucherStatus | null>(null)

  const vq = useQuery({
    queryKey: ['voucher', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('payment_vouchers')
        .select('*').eq('id', id).single()
      if (error) throw error
      return data as unknown as Voucher
    },
  })

  const lq = useQuery({
    queryKey: ['voucher-lines', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('voucher_lines')
        .select('*, payees(prefix, first_name, last_name, position_title, is_government_officer), clinical_sites(name_th, ward), budget_categories(name_th, fund_source, expense_item)')
        .eq('voucher_id', id).order('line_no')
      if (error) throw error
      return (data ?? []) as unknown as Line[]
    },
  })

  const cq = useQuery({
    queryKey: ['voucher-checklist', id],
    queryFn: async () => {
      const [items, marks] = await Promise.all([
        supabase.from('checklist_items').select('key, name_th, sort_order').eq('is_active', true).order('sort_order'),
        supabase.from('voucher_checklists').select('item_key, is_checked').eq('voucher_id', id),
      ])
      if (items.error) throw items.error
      if (marks.error) throw marks.error
      const checked = new Map((marks.data ?? []).map((m) => [m.item_key as string, m.is_checked as boolean]))
      return (items.data ?? []).map((i) => ({
        key: i.key as string, name_th: i.name_th as string, is_checked: checked.get(i.key as string) ?? false,
      }))
    },
  })

  const offeringId = vq.data?.course_offering_id
  const oq = useQuery({
    enabled: !!offeringId,
    queryKey: ['voucher-offering', offeringId],
    queryFn: async () => {
      const [coords, payees, sites, alloc] = await Promise.all([
        supabase.from('course_coordinators')
          .select('coordinators(id, prefix, first_name, last_name, position_title)')
          .eq('course_offering_id', offeringId),
        supabase.from('payee_course_offerings')
          .select('payees(id, prefix, first_name, last_name, position_title, is_government_officer, is_active)')
          .eq('course_offering_id', offeringId),
        supabase.from('course_clinical_sites')
          .select('clinical_sites(id, name_th, ward, is_active)')
          .eq('course_offering_id', offeringId),
        supabase.from('course_budget_allocations')
          .select('budget_category_id, allocated_amount')
          .eq('course_offering_id', offeringId),
      ])
      const bad = [coords, payees, sites, alloc].find((r) => r.error)
      if (bad?.error) throw bad.error
      type C = { id: string; prefix: string | null; first_name: string; last_name: string; position_title: string | null }
      type P = C & { is_government_officer: boolean; is_active: boolean }
      type S = { id: string; name_th: string; ward: string | null; is_active: boolean }
      return {
        coordinators: (coords.data ?? []).map((r) => (r as unknown as { coordinators: C }).coordinators).filter(Boolean),
        payees: (payees.data ?? []).map((r) => (r as unknown as { payees: P }).payees).filter(Boolean),
        sites: (sites.data ?? []).map((r) => (r as unknown as { clinical_sites: S }).clinical_sites).filter(Boolean),
        allocations: (alloc.data ?? []) as { budget_category_id: string; allocated_amount: number }[],
      }
    },
  })

  const settings = useAppSettings()

  const v = vq.data
  const lines = lq.data ?? []
  const isAdmin = user?.role_code === 'admin'
  const editable = !!v && can('docs.voucher', 'update') &&
    (v.status === 'draft' || v.status === 'submitted' || (v.status === 'verified' && isAdmin))

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['voucher', id] })
    void qc.invalidateQueries({ queryKey: ['voucher-lines', id] })
    void qc.invalidateQueries({ queryKey: ['vouchers'] })
  }

  const saveHeader = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      // ต้องมี .select() เสมอ: ถ้า RLS กรองแถวนี้ออก PostgREST ตอบ 204 ไม่ใช่ error
      // การบันทึกที่ไม่เปลี่ยนอะไรจะขึ้นว่า "เรียบร้อย" ทั้งที่ไม่มีอะไรเกิดขึ้น
      const { data, error } = await supabase.from('payment_vouchers').update({
        ...values,
        amount_in_words: bahtText(v?.total_amount ?? 0),
      }).eq('id', id).select('id')
      if (error) throw error
      assertAffected(data)
    },
    onSuccess: () => { toast.success('บันทึกหัวเอกสารเรียบร้อย'); setEditHeader(false); invalidate() },
    onError: (e) => toast.error(toThaiError(e)),
  })

  const saveLine = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const row = { ...values, voucher_id: id }
      if (editLine) {
        const { data, error } = await supabase.from('voucher_lines')
          .update(row).eq('id', editLine.id).select('id')
        if (error) throw error
        assertAffected(data)
      } else {
        const { error } = await supabase.from('voucher_lines').insert(row)
        if (error) throw error
      }
    },
    onSuccess: () => { toast.success('บันทึกรายการเรียบร้อย'); setEditLine(undefined); invalidate() },
    onError: (e) => toast.error(toThaiError(e)),
  })

  const removeLine = useMutation({
    mutationFn: async (lineId: string) => {
      const { data, error } = await supabase.from('voucher_lines')
        .delete().eq('id', lineId).select('id')
      if (error) throw error
      assertAffected(data)
    },
    onSuccess: () => { toast.success('ลบรายการเรียบร้อย'); setDeleteLine(null); invalidate() },
    onError: (e) => toast.error(toThaiError(e)),
  })

  const toggleCheck = useMutation({
    mutationFn: async (p: { key: string; value: boolean }) => {
      const { error } = await supabase.from('voucher_checklists').upsert({
        voucher_id: id, item_key: p.key, is_checked: p.value,
        checked_by: p.value ? user?.id ?? null : null,
        checked_at: p.value ? new Date().toISOString() : null,
      }, { onConflict: 'voucher_id,item_key' })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['voucher-checklist', id] }),
    onError: (e) => toast.error(toThaiError(e)),
  })

  const changeStatus = useMutation({
    mutationFn: async (p: { status: VoucherStatus; payment_date?: string; bank?: string; reason?: string }) => {
      const { error } = await supabase.rpc('set_voucher_status', {
        p_voucher_id: id,
        p_new_status: p.status,
        p_payment_date: p.payment_date ?? null,
        p_bank_code: p.bank ?? null,
        p_reason: p.reason ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => { toast.success('เปลี่ยนสถานะเรียบร้อย'); setStatusAction(null); invalidate() },
    onError: (e) => toast.error(toThaiError(e)),
  })

  const allocatedIds = new Set((oq.data?.allocations ?? []).map((a) => a.budget_category_id))
  const categoryOptions = (lookups.data?.budgetCategories ?? []).map((b) => ({
    value: b.id as string,
    label: `${b.name_th}${allocatedIds.has(b.id as string) ? '' : ' — ยังไม่ได้ตั้งวงเงิน'}`,
  }))

  const payeeOptions = [
    ...(oq.data?.payees ?? []).filter((p) => p.is_active).map((p) => ({
      value: PERSON + p.id,
      label: fullName(p.prefix, p.first_name, p.last_name),
    })),
    ...(oq.data?.sites ?? []).filter((s) => s.is_active).map((s) => ({
      value: SITE + s.id,
      label: `[แหล่งฝึก] ${s.name_th}${s.ward ? ` · ${s.ward}` : ''}`,
    })),
  ]

  const coordOptions = (oq.data?.coordinators ?? []).map((c) => ({
    value: c.id, label: fullName(c.prefix, c.first_name, c.last_name),
  }))

  const govOf = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const p of oq.data?.payees ?? []) m.set(p.id, p.is_government_officer)
    return m
  }, [oq.data])

  const lineFields: FieldSpec[] = [
    {
      name: 'payee_ref', label: 'ผู้รับเงิน', type: 'select', required: true, options: payeeOptions, wide: true,
      help: payeeOptions.length === 0
        ? 'รายวิชานี้ยังไม่ได้ผูกอาจารย์หรือแหล่งฝึก — เพิ่มที่เมนู "รายวิชาที่เปิดสอน" ก่อน'
        : 'รายชื่อมาจากที่ผูกไว้กับรายวิชาที่เปิดสอน',
    },
    {
      name: 'budget_category_id', label: 'หมวดเงิน (แหล่งเงิน + รายการ)', type: 'select', required: true,
      options: categoryOptions, wide: true,
      help: 'ต้องตั้งวงเงินของหมวดนี้ให้รายวิชาไว้ก่อน มิฉะนั้นฐานข้อมูลจะปฏิเสธ',
    },
    {
      name: 'teaching_month', label: 'ประจำเดือน', type: 'date',
      help: 'เลือกวันใดก็ได้ในเดือนนั้น ระบบจะเก็บเป็นวันที่ 1 ของเดือน และใช้หาอัตราที่บังคับใช้ ณ เดือนนั้น',
    },
    { name: 'student_year_level', label: 'ชั้นปีของนักศึกษา', type: 'number' },
    {
      name: 'hours', label: 'จำนวนหน่วยชั่วโมง', type: 'number',
      help: 'ช่อง (8) บนแบบฟอร์ม — รายการเหมาจ่ายเว้นว่างได้',
    },
    {
      name: 'quantity', label: 'จำนวนหน่วยที่ใช้คำนวณ', type: 'number',
      help: 'อัตราแบบบาท/ชั่วโมง ระบบเติมจากจำนวนหน่วยชั่วโมงให้ · แบบบาท/คน/เดือน ให้กรอกจำนวนคนหรือกลุ่ม',
    },
    {
      name: 'rate', label: 'อัตราต่อหน่วย (บาท)', type: 'number',
      help: 'เว้นว่างเพื่อใช้อัตราตามหลักเกณฑ์ — กรอกเกินเพดานหรือผิดจากอัตราตายตัว ฐานข้อมูลจะปฏิเสธ',
    },
    {
      name: 'amount', label: 'จำนวนเงิน (บาท)', type: 'number',
      help: 'เว้นว่างเพื่อให้คำนวณจาก จำนวนหน่วย × อัตรา · รายการเบิกตามจ่ายจริงต้องกรอกเอง',
    },
    {
      name: 'teaching_level', label: 'ระดับการสอน', type: 'select', required: true,
      options: [{ value: 'bachelor', label: 'ปริญญาตรี' }, { value: 'graduate', label: 'บัณฑิตศึกษา' }],
    },
    {
      name: 'is_invited_external', label: 'ผู้ได้รับเชิญให้สอน (ช่อง 6)', type: 'checkbox',
      placeholder: 'ติ๊กในแบบฟอร์ม', wide: true,
      help: 'ติ๊กเมื่อผู้รับเงิน "ไม่ใช่" ข้าราชการ ลูกจ้างประจำของทางราชการ หรือพนักงานรัฐวิสาหกิจ (ตามข้อ 14.3) — ระบบเสนอค่าให้จากข้อมูลผู้รับเงิน แต่แก้ได้',
    },
    { name: 'receipt_date', label: 'วัน เดือน ปี ที่รับเงิน', type: 'date' },
    { name: 'note', label: 'หมายเหตุ', type: 'text' },
  ]

  const headerFields: FieldSpec[] = [
    { name: 'faculty_text', label: 'คณะ', type: 'text', wide: true },
    { name: 'semester_text', label: 'ภาคการศึกษา (ข้อความบนแบบฟอร์ม)', type: 'text' },
    { name: 'year_be', label: 'พ.ศ.', type: 'number' },
    { name: 'subject_text', label: 'วิชา', type: 'text', wide: true },
    { name: 'doc_date', label: 'วันที่เอกสาร', type: 'date', required: true },
    {
      name: 'teaching_level', label: 'ระดับการสอน (ค่าตั้งต้นของรายการ)', type: 'select',
      options: [{ value: 'bachelor', label: 'ปริญญาตรี' }, { value: 'graduate', label: 'บัณฑิตศึกษา' }],
    },
    {
      name: 'preparer_coordinator_id', label: '(14) ผู้จัดทำ', type: 'select', options: coordOptions, wide: true,
      help: 'ผู้ประสานงานรายวิชาที่ผูกไว้กับรายวิชาที่เปิดสอน',
    },
    { name: 'preparer_position', label: 'ตำแหน่งผู้จัดทำ', type: 'text' },
    { name: 'preparer_date', label: 'วันที่ (ผู้จัดทำ)', type: 'date' },
    { name: 'payer_name', label: '(15) ผู้จ่ายเงิน', type: 'text' },
    { name: 'payer_position', label: 'ตำแหน่งผู้จ่ายเงิน', type: 'text' },
    { name: 'payer_date', label: 'วันที่ (ผู้จ่ายเงิน)', type: 'date' },
    { name: 'certifier_name', label: '(16) ผู้รับรอง', type: 'text' },
    { name: 'certifier_position', label: 'ตำแหน่งผู้รับรอง', type: 'text' },
    { name: 'certifier_date', label: 'วันที่ (ผู้รับรอง)', type: 'date' },
    { name: 'approver_name', label: '(17) ผู้อนุมัติ', type: 'text' },
    { name: 'approver_position', label: 'ตำแหน่งผู้อนุมัติ', type: 'text' },
    { name: 'approver_date', label: 'วันที่ (ผู้อนุมัติ)', type: 'date' },
    { name: 'note', label: 'หมายเหตุภายใน (ไม่พิมพ์ลงแบบฟอร์ม)', type: 'textarea' },
  ]

  const director = settingObject(settings.data, 'org.director')
  const preparer = (oq.data?.coordinators ?? []).find((c) => c.id === v?.preparer_coordinator_id)

  const printLines: PrintLine[] = lines.map((l) => ({
    line_no: l.line_no,
    payee: l.payees,
    site: l.clinical_sites,
    budget_category_name: l.budget_categories?.name_th ?? '',
    expense_item: l.expense_item,
    teaching_level: l.teaching_level,
    is_invited_external: l.is_invited_external,
    hours: l.hours,
    amount: l.amount,
    receipt_date: l.receipt_date,
    note: l.note,
  }))

  if (vq.isLoading) {
    return <p className="text-sm text-slate-500">กำลังโหลดเอกสาร…</p>
  }
  if (vq.error || !v) {
    return (
      <div role="alert" className="card border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
        <span aria-hidden="true">⚠ </span>{vq.error ? toThaiError(vq.error) : 'ไม่พบเอกสาร'}
      </div>
    )
  }

  const checklistDone = (cq.data ?? []).every((c) => c.is_checked)
  const isMaker = !!user && (v.created_by === user.id || v.submitted_by === user.id)

  return (
    <div className="space-y-4">
      {/* ---------- แถบสถานะและปุ่มดำเนินการ ---------- */}
      <div className="no-print card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <button type="button" onClick={() => nav('/docs/vouchers')}
            className="text-xs text-brand-700 hover:underline dark:text-brand-300">
            ← กลับไปรายการใบเบิก
          </button>
          <h1 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
            {v.voucher_no ?? 'ใบเบิก (ยังไม่มีเลขที่)'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {v.subject_text ?? '-'} · รวม {formatBaht(v.total_amount)} บาท
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={v.status} />
          <button type="button" className="btn-secondary !min-h-[40px] !px-3" onClick={() => window.print()}>
            พิมพ์ FM2.2-03
          </button>
          {v.status === 'draft' && can('docs.voucher', 'update') && (
            <button type="button" className="btn-primary !min-h-[40px] !px-3"
              disabled={changeStatus.isPending}
              onClick={() => changeStatus.mutate({ status: 'submitted' })}>
              ส่งเอกสาร
            </button>
          )}
          {v.status === 'submitted' && (user?.role_code === 'finance' || isAdmin) && (
            <button type="button" className="btn-primary !min-h-[40px] !px-3"
              disabled={changeStatus.isPending}
              onClick={() => changeStatus.mutate({ status: 'verified' })}>
              ตรวจสอบแล้ว
            </button>
          )}
          {v.status === 'verified' && (user?.role_code === 'finance' || isAdmin) && (
            <button type="button" className="btn-primary !min-h-[40px] !px-3"
              onClick={() => setStatusAction('paid')}>
              บันทึกการจ่ายเงิน
            </button>
          )}
          {isAdmin && v.status !== 'paid' && v.status !== 'cancelled' && (
            <button type="button" className="btn-secondary !min-h-[40px] !px-3"
              onClick={() => setStatusAction('cancelled')}>
              ยกเลิกเอกสาร
            </button>
          )}
        </div>
      </div>

      {v.status === 'submitted' && isMaker && (user?.role_code === 'finance' || isAdmin) && (
        <div className="no-print card border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          เอกสารฉบับนี้คุณเป็นผู้จัดทำ — ระบบจะไม่ยอมให้คุณเป็นผู้ตรวจสอบหรือผู้จ่ายเงินเอง
          ต้องให้เจ้าหน้าที่อีกท่านเป็นผู้กด
        </div>
      )}

      {v.status === 'cancelled' && v.cancel_reason && (
        <div className="no-print card border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
          เหตุผลการยกเลิก: {v.cancel_reason}
        </div>
      )}

      {/* ---------- หัวเอกสาร ---------- */}
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
            ['คณะ', v.faculty_text],
            ['ภาคการศึกษา', v.semester_text],
            ['พ.ศ.', v.year_be],
            ['วิชา', v.subject_text],
            ['วันที่เอกสาร', formatDateBE(v.doc_date)],
            ['ผู้จัดทำ', preparer ? fullName(preparer.prefix, preparer.first_name, preparer.last_name) : null],
            ['ผู้จ่ายเงิน', v.payer_name],
            ['ผู้รับรอง', v.certifier_name],
            ['ผู้อนุมัติ', v.approver_name],
          ] as [string, string | number | null][]).map(([k, val]) => (
            <div key={k}>
              <dt className="text-xs text-slate-500 dark:text-slate-400">{k}</dt>
              <dd className="text-slate-800 dark:text-slate-100">{val ?? '—'}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ---------- รายการในใบหลักฐาน ---------- */}
      <div className="no-print card p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">รายการในใบหลักฐาน</h2>
          {editable && (
            <button type="button" className="btn-primary !min-h-[36px] !px-3 !text-xs"
              onClick={() => setEditLine(null)}>
              + เพิ่มรายการ
            </button>
          )}
        </div>

        {lq.error && (
          <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-400">
            <span aria-hidden="true">⚠ </span>{toThaiError(lq.error)}
          </p>
        )}

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="table-head">
              <tr>
                <th scope="col" className="px-2 py-2 text-left">#</th>
                <th scope="col" className="px-2 py-2 text-left">ผู้รับเงิน</th>
                <th scope="col" className="px-2 py-2 text-left">หมวดเงิน / รายการ</th>
                <th scope="col" className="px-2 py-2 text-right">หน่วย ชม.</th>
                <th scope="col" className="px-2 py-2 text-right">อัตรา</th>
                <th scope="col" className="px-2 py-2 text-right">จำนวนเงิน</th>
                {editable && <th scope="col" className="px-2 py-2 text-right">จัดการ</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {lines.length === 0 && (
                <tr><td colSpan={editable ? 7 : 6} className="px-2 py-6 text-center text-slate-500">
                  ยังไม่มีรายการ — กดปุ่มเพิ่มรายการ
                </td></tr>
              )}
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-2 py-2">{l.line_no}</td>
                  <td className="px-2 py-2">
                    {l.payees
                      ? fullName(l.payees.prefix, l.payees.first_name, l.payees.last_name)
                      : l.clinical_sites
                        ? `${l.clinical_sites.name_th}${l.clinical_sites.ward ? ` · ${l.clinical_sites.ward}` : ''}`
                        : '-'}
                    <span className="block text-xs text-slate-500">
                      {l.teaching_month ? `ประจำเดือน ${formatMonthBE(l.teaching_month)}` : ''}
                      {l.is_invited_external ? ' · ติ๊กผู้ได้รับเชิญให้สอน' : ''}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    {l.budget_categories?.name_th ?? '-'}
                    <span className="block text-xs text-slate-500">
                      {EXPENSE_ITEM_LABEL[l.expense_item] ?? l.expense_item}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right">{l.hours ?? '-'}</td>
                  <td className="px-2 py-2 text-right">{l.rate === null ? '-' : formatBaht(l.rate)}</td>
                  <td className="px-2 py-2 text-right font-medium">{formatBaht(l.amount)}</td>
                  {editable && (
                    <td className="px-2 py-2 text-right">
                      <button type="button" onClick={() => setEditLine(l)}
                        className="rounded px-2 py-1 text-xs text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-slate-800">
                        แก้ไข
                      </button>
                      <button type="button" onClick={() => setDeleteLine(l)}
                        className="rounded px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-slate-800">
                        ลบ
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 dark:border-slate-700">
                <td colSpan={5} className="px-2 py-2 text-right font-semibold">รวมจำนวนเงินทั้งสิ้น</td>
                <td className="px-2 py-2 text-right font-semibold">{formatBaht(v.total_amount)}</td>
                {editable && <td />}
              </tr>
              <tr>
                <td colSpan={editable ? 7 : 6} className="px-2 pb-2 text-right text-xs text-slate-500">
                  ({bahtText(v.total_amount)})
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ---------- เช็คลิสต์เอกสารแนบ ---------- */}
      <div className="no-print card p-4">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">เช็คลิสต์เอกสารแนบ</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          ต้องติ๊กครบทุกข้อจึงจะส่งเอกสารได้ — เงื่อนไขนี้บังคับที่ฐานข้อมูล
        </p>
        <ul className="mt-3 space-y-2">
          {(cq.data ?? []).map((c) => (
            <li key={c.key}>
              <label className="flex min-h-[36px] items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={c.is_checked}
                  disabled={!editable || toggleCheck.isPending}
                  onChange={(e) => toggleCheck.mutate({ key: c.key, value: e.target.checked })} />
                <span className="text-slate-700 dark:text-slate-300">{c.name_th}</span>
              </label>
            </li>
          ))}
        </ul>
        {!checklistDone && v.status === 'draft' && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            ยังติ๊กไม่ครบ — กดส่งเอกสารแล้วฐานข้อมูลจะปฏิเสธ
          </p>
        )}
      </div>

      {/* ---------- ส่วนที่พิมพ์ลงกระดาษ ---------- */}
      <div className="print-only">
        <VoucherPrint
          v={{
            voucher_no: v.voucher_no,
            org_name: settingText(settings.data, 'org.name'),
            form_code: settingText(settings.data, 'form.voucher_code') || 'FM2.2-03',
            faculty_text: v.faculty_text,
            semester_text: v.semester_text,
            year_be: v.year_be,
            subject_text: v.subject_text,
            total_amount: v.total_amount,
            amount_in_words: v.amount_in_words,
            preparer_name: preparer ? fullName(preparer.prefix, preparer.first_name, preparer.last_name) : null,
            preparer_position: v.preparer_position ?? preparer?.position_title ?? null,
            preparer_date: v.preparer_date,
            payer_name: v.payer_name, payer_position: v.payer_position, payer_date: v.payer_date,
            certifier_name: v.certifier_name, certifier_position: v.certifier_position, certifier_date: v.certifier_date,
            approver_name: v.approver_name ?? ([director.prefix, director.name].filter(Boolean).join('') || null),
            approver_position: v.approver_position ?? director.position ?? null,
            approver_date: v.approver_date,
          }}
          lines={printLines}
        />
      </div>

      {/* ---------- ป๊อปอัพต่าง ๆ ---------- */}
      <FormModal
        open={editHeader}
        title="แก้ไขหัวเอกสารและช่องลงนาม"
        fields={headerFields}
        saving={saveHeader.isPending}
        onCancel={() => setEditHeader(false)}
        initial={{
          faculty_text: v.faculty_text ?? '', semester_text: v.semester_text ?? '',
          year_be: v.year_be ?? null, subject_text: v.subject_text ?? '',
          doc_date: v.doc_date, teaching_level: v.teaching_level,
          preparer_coordinator_id: v.preparer_coordinator_id ?? '',
          preparer_position: v.preparer_position ?? '', preparer_date: v.preparer_date ?? '',
          payer_name: v.payer_name ?? '', payer_position: v.payer_position ?? '', payer_date: v.payer_date ?? '',
          certifier_name: v.certifier_name ?? '', certifier_position: v.certifier_position ?? '',
          certifier_date: v.certifier_date ?? '',
          approver_name: v.approver_name ?? [director.prefix, director.name].filter(Boolean).join('') ?? '',
          approver_position: v.approver_position ?? director.position ?? '',
          approver_date: v.approver_date ?? '',
          note: v.note ?? '',
        }}
        onSubmit={(values) => {
          const clean: Record<string, unknown> = {}
          for (const [k, val] of Object.entries(values)) clean[k] = val === '' ? null : val
          saveHeader.mutate(clean)
        }}
      />

      <FormModal
        open={editLine !== undefined}
        title={editLine ? `แก้ไขรายการที่ ${editLine.line_no}` : 'เพิ่มรายการในใบหลักฐาน'}
        fields={lineFields}
        saving={saveLine.isPending}
        onCancel={() => setEditLine(undefined)}
        initial={{
          payee_ref: editLine
            ? (editLine.payee_id ? PERSON + editLine.payee_id : editLine.clinical_site_id ? SITE + editLine.clinical_site_id : '')
            : '',
          budget_category_id: editLine?.budget_category_id ?? '',
          teaching_month: editLine?.teaching_month ?? '',
          student_year_level: editLine?.student_year_level ?? null,
          hours: editLine?.hours ?? null,
          quantity: editLine?.quantity ?? null,
          rate: editLine?.rate ?? null,
          amount: editLine?.amount ?? null,
          teaching_level: editLine?.teaching_level ?? v.teaching_level,
          is_invited_external: editLine
            ? editLine.is_invited_external
            : true,
          receipt_date: editLine?.receipt_date ?? '',
          note: editLine?.note ?? '',
        }}
        onSubmit={(values) => {
          const ref = String(values.payee_ref ?? '')
          const cat = (lookups.data?.budgetCategories ?? []).find((b) => b.id === values.budget_category_id)
          if (!cat) { toast.error('ไม่พบหมวดเงินที่เลือก'); return }

          // ช่อง (6) ติ๊กเมื่อผู้รับเงิน "ไม่ใช่" ข้าราชการ ซึ่งสวนสัญชาตญาณ
          // จึงเตือนเมื่อค่าที่กรอกขัดกับข้อมูลผู้รับเงินที่บันทึกไว้
          if (ref.startsWith(PERSON)) {
            const isGov = govOf.get(ref.slice(PERSON.length))
            if (isGov === true && values.is_invited_external && !window.confirm(
              'ผู้รับเงินรายนี้บันทึกไว้ว่าเป็นข้าราชการ/ลูกจ้างของทางราชการ\n' +
              'ช่อง "ผู้ได้รับเชิญให้สอน" ตามข้อ 14.3 ติ๊กเฉพาะผู้ที่ไม่ใช่ข้าราชการ\n\n' +
              'ยืนยันจะติ๊กช่องนี้หรือไม่')) return
            if (isGov === false && !values.is_invited_external && !window.confirm(
              'ผู้รับเงินรายนี้บันทึกไว้ว่าไม่ใช่ข้าราชการ ปกติต้องติ๊กช่อง "ผู้ได้รับเชิญให้สอน"\n\n' +
              'ยืนยันจะไม่ติ๊กหรือไม่')) return
          }

          // วันที่ 1 ของเดือนเสมอ ตาม constraint ของฐานข้อมูล
          const month = values.teaching_month
            ? `${String(values.teaching_month).slice(0, 7)}-01`
            : null

          const nextLineNo = editLine
            ? editLine.line_no
            : (lines.reduce((m, l) => Math.max(m, l.line_no), 0) + 1)

          saveLine.mutate({
            line_no: nextLineNo,
            payee_id: ref.startsWith(PERSON) ? ref.slice(PERSON.length) : null,
            clinical_site_id: ref.startsWith(SITE) ? ref.slice(SITE.length) : null,
            budget_category_id: values.budget_category_id,
            // ต้องตรงกับรายการของหมวดเงิน มิฉะนั้น trigger จะปฏิเสธ จึงไม่ให้ผู้ใช้เลือกเอง
            expense_item: cat.expense_item,
            teaching_level: values.teaching_level,
            is_invited_external: !!values.is_invited_external,
            teaching_month: month,
            student_year_level: values.student_year_level ?? null,
            hours: values.hours ?? null,
            quantity: values.quantity ?? null,
            rate: values.rate ?? null,
            amount: values.amount ?? 0,
            receipt_date: values.receipt_date === '' ? null : values.receipt_date,
            note: values.note === '' ? null : values.note,
          })
        }}
      />

      <ConfirmDialog
        open={!!deleteLine}
        danger
        title="ยืนยันการลบรายการ"
        message={'ลบแล้วกู้คืนไม่ได้ และยอดรวมในใบหลักฐานจะถูกคำนวณใหม่\nการลบถูกบันทึกไว้ในร่องรอยการใช้งาน'}
        confirmLabel="ยืนยันลบ"
        busy={removeLine.isPending}
        onCancel={() => setDeleteLine(null)}
        onConfirm={() => { if (deleteLine) removeLine.mutate(deleteLine.id) }}
      />

      <FormModal
        open={statusAction === 'paid'}
        title="บันทึกการจ่ายเงิน"
        saving={changeStatus.isPending}
        onCancel={() => setStatusAction(null)}
        fields={[
          { name: 'payment_date', label: 'วันที่จ่ายเงินจริง', type: 'date', required: true },
          {
            name: 'bank', label: 'ธนาคารที่โอน', type: 'select', required: true,
            options: (lookups.data?.banks ?? []).map((b) => ({ value: b.code as string, label: b.name_th as string })),
          },
        ]}
        initial={{ payment_date: todayBangkok(), bank: '' }}
        onSubmit={(vals) => changeStatus.mutate({
          status: 'paid',
          payment_date: String(vals.payment_date),
          bank: String(vals.bank),
        })}
      />

      <FormModal
        open={statusAction === 'cancelled'}
        title="ยกเลิกเอกสาร"
        saving={changeStatus.isPending}
        onCancel={() => setStatusAction(null)}
        fields={[
          {
            name: 'reason', label: 'เหตุผลการยกเลิก', type: 'textarea', required: true, wide: true,
            help: 'บันทึกไว้ถาวรในเอกสารและในร่องรอยการใช้งาน ต้องยาวอย่างน้อย 5 ตัวอักษร',
            validate: (val) => (String(val ?? '').trim().length < 5 ? 'ต้องระบุเหตุผลอย่างน้อย 5 ตัวอักษร' : null),
          },
        ]}
        initial={{ reason: '' }}
        onSubmit={(vals) => changeStatus.mutate({ status: 'cancelled', reason: String(vals.reason) })}
      />
    </div>
  )
}
