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
import { formatMonthBE, todayBangkok } from '@/lib/thaiDate'
import type { VoucherStatus } from '@/lib/types'

interface Sheet {
  id: string
  sheet_no: string | null
  fiscal_year_id: string
  teacher_type: 'regular' | 'special'
  study_level: 'bachelor' | 'below_bachelor'
  program_name: string
  student_year_level: number | null
  period_month: string
  total_amount: number
  status: VoucherStatus
  fiscal_years: { year_be: number } | null
}

export const TEACHER_TYPE_LABEL = { regular: 'อาจารย์', special: 'อาจารย์พิเศษ' } as const
export const STUDY_LEVEL_LABEL = { bachelor: 'ปริญญาตรี', below_bachelor: 'ต่ำกว่าปริญญาตรี' } as const

export function CoverSheetsPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const { can } = usePermissions()
  const lookups = useLookups()
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')

  const list = useQuery({
    queryKey: ['cover-sheets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('treasury_cover_sheets')
        .select('id, sheet_no, fiscal_year_id, teacher_type, study_level, program_name, student_year_level, period_month, total_amount, status, fiscal_years(year_be)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Sheet[]
    },
  })

  const create = useMutation({
    mutationFn: async (v: Record<string, unknown>) => {
      const { data, error } = await supabase.from('treasury_cover_sheets').insert({
        ...v,
        // ฐานข้อมูลบังคับให้เป็นวันที่ 1 ของเดือน
        period_month: `${String(v.period_month).slice(0, 7)}-01`,
      }).select('id').single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: (id) => {
      toast.success('สร้างหน้างบใบสำคัญฯ แล้ว')
      void qc.invalidateQueries({ queryKey: ['cover-sheets'] })
      setCreating(false)
      nav(`/docs/cover-sheets/${id}`)
    },
    onError: (e) => toast.error(toThaiError(e)),
  })

  const rows = useMemo(() => {
    const all = list.data ?? []
    const q = search.trim().toLowerCase()
    if (!q) return all
    return all.filter((r) => `${r.sheet_no ?? ''} ${r.program_name}`.toLowerCase().includes(q))
  }, [list.data, search])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">
            หน้างบใบสำคัญค่าสอนพิเศษประกอบฎีกา
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            รวมใบสำคัญหลายฉบับขึ้นเป็นฎีกาเดียว — ใบสำคัญหนึ่งฉบับขึ้นหน้างบฯ ได้ครั้งเดียวเท่านั้น
          </p>
        </div>
        {can('docs.cover', 'create') && (
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            + สร้างหน้างบฯ
          </button>
        )}
      </div>

      {list.error && (
        <div role="alert" className="card border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
          <span aria-hidden="true">⚠ </span>{toThaiError(list.error)}
        </div>
      )}

      <div className="card p-3">
        <label htmlFor="cs-q" className="sr-only">ค้นหา</label>
        <input id="cs-q" className="field-input" placeholder="ค้นหาจากเลขที่ฎีกาหรือชื่อหลักสูตร…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <DataTable
        title="หน้างบใบสำคัญฯ"
        rows={rows}
        rowKey={(r) => r.id}
        loading={list.isLoading || lookups.isLoading}
        emptyText="ยังไม่มีหน้างบฯ"
        columns={[
          {
            key: 'no', header: 'ประกอบฎีกาที่ / ประจำเดือน',
            render: (r) => (
              <div>
                <span className="font-medium">{r.sheet_no ?? '(ยังไม่ระบุเลขที่)'}</span>
                <span className="block text-xs text-slate-500">
                  ประจำเดือน {formatMonthBE(r.period_month)} · {TEACHER_TYPE_LABEL[r.teacher_type]}
                </span>
              </div>
            ),
          },
          {
            key: 'fy', header: 'ปีงบประมาณ', hideOnMobile: true,
            render: (r) => (r.fiscal_years ? `พ.ศ. ${r.fiscal_years.year_be}` : '-'),
          },
          {
            key: 'lv', header: 'หลักสูตร / ระดับ', hideOnMobile: true,
            render: (r) => `${r.program_name} · ${STUDY_LEVEL_LABEL[r.study_level]}${r.student_year_level ? ` ปีที่ ${r.student_year_level}` : ''}`,
          },
          { key: 'total', header: 'รวมทั้งสิ้น', align: 'right', render: (r) => formatBaht(r.total_amount) },
          { key: 'st', header: 'สถานะ', render: (r) => <StatusBadge status={r.status} /> },
          {
            key: '__a', header: 'จัดการ', align: 'right',
            render: (r) => (
              <button type="button" onClick={() => nav(`/docs/cover-sheets/${r.id}`)}
                className="btn-link-brand">
                เปิด
              </button>
            ),
          },
        ]}
      />

      <FormModal
        open={creating}
        title="สร้างหน้างบใบสำคัญฯ"
        saving={create.isPending}
        onCancel={() => setCreating(false)}
        fields={[
          {
            name: 'fiscal_year_id', label: 'ปีงบประมาณ', type: 'select', required: true,
            options: (lookups.data?.fiscalYears ?? []).map((f) => ({
              value: f.id as string, label: `พ.ศ. ${f.year_be}${f.is_closed ? ' (ปิดแล้ว)' : ''}`,
            })),
            help: 'ใบสำคัญที่นำขึ้นหน้างบฯ ต้องอยู่ปีงบประมาณเดียวกันนี้',
          },
          {
            name: 'period_month', label: 'ประจำเดือน', type: 'date', required: true,
            help: 'เลือกวันใดก็ได้ในเดือนนั้น',
          },
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
          { name: 'program_name', label: 'หลักสูตร', type: 'text', required: true, wide: true },
          { name: 'student_year_level', label: 'ชั้นปีที่', type: 'number' },
          { name: 'sheet_no', label: 'ประกอบฎีกาที่', type: 'text', help: 'เว้นว่างได้ กรอกภายหลังเมื่องานการเงินออกเลข' },
        ]}
        initial={{
          fiscal_year_id: '', period_month: todayBangkok(),
          teacher_type: 'special', study_level: 'bachelor',
          program_name: 'พยาบาลศาสตรบัณฑิต', student_year_level: null, sheet_no: '',
        }}
        onSubmit={(v) => create.mutate({ ...v, sheet_no: v.sheet_no === '' ? null : v.sheet_no })}
      />
    </div>
  )
}
