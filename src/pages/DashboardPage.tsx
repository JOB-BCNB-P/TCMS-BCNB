import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { DataTable, type Column } from '@/components/DataTable'
import { BudgetLineChart, type SpendPoint } from '@/components/BudgetLineChart'
import { StatusBadge } from '@/components/StatusBadge'
import { formatBaht, formatNumber, fullName } from '@/lib/format'
import { formatDateBE, formatMonthBE } from '@/lib/thaiDate'
import { downloadCsv, toCsv } from '@/lib/csv'
import {
  EXPENSE_ITEM_LABEL,
  type AcademicYear, type BudgetUsageRow, type FiscalYear,
  type PaymentSummaryRow, type Semester,
} from '@/lib/types'

interface Filters {
  fiscalYearId: string
  academicYearId: string
  semesterId: string
  courseCode: string
}

export function DashboardPage() {
  const [filters, setFilters] = useState<Filters>({
    fiscalYearId: '', academicYearId: '', semesterId: '', courseCode: '',
  })

  const refs = useQuery({
    queryKey: ['dashboard-refs'],
    queryFn: async () => {
      const [fy, ay, sem] = await Promise.all([
        supabase.from('fiscal_years').select('id, year_be, start_date, end_date, is_closed').order('year_be', { ascending: false }),
        supabase.from('academic_years').select('id, year_be').order('year_be', { ascending: false }),
        supabase.from('semesters').select('id, academic_year_id, code, name_th'),
      ])
      if (fy.error) throw fy.error
      if (ay.error) throw ay.error
      if (sem.error) throw sem.error
      return {
        fiscalYears: (fy.data ?? []) as FiscalYear[],
        academicYears: (ay.data ?? []) as AcademicYear[],
        semesters: (sem.data ?? []) as Semester[],
      }
    },
  })

  // ปีงบประมาณปัจจุบันคือค่าเริ่มต้น ตามข้อกำหนดของหน้าแดชบอร์ด
  const activeFiscalYear = useMemo(() => {
    const list = refs.data?.fiscalYears ?? []
    if (filters.fiscalYearId) return list.find((f) => f.id === filters.fiscalYearId) ?? null
    const today = new Date().toISOString().slice(0, 10)
    return list.find((f) => f.start_date <= today && today <= f.end_date) ?? list[0] ?? null
  }, [refs.data, filters.fiscalYearId])

  const usage = useQuery({
    queryKey: ['budget-usage', activeFiscalYear?.id, filters.academicYearId, filters.semesterId],
    enabled: !!activeFiscalYear,
    queryFn: async () => {
      let q = supabase.from('v_budget_usage').select('*').eq('fiscal_year_id', activeFiscalYear!.id)
      if (filters.academicYearId) q = q.eq('academic_year_id', filters.academicYearId)
      if (filters.semesterId) q = q.eq('semester_id', filters.semesterId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as BudgetUsageRow[]
    },
  })

  const payments = useQuery({
    queryKey: ['payment-summary', activeFiscalYear?.id, filters.academicYearId, filters.semesterId],
    enabled: !!activeFiscalYear,
    queryFn: async () => {
      let q = supabase.from('v_payment_summary').select('*').eq('fiscal_year_id', activeFiscalYear!.id)
      if (filters.academicYearId) q = q.eq('academic_year_id', filters.academicYearId)
      if (filters.semesterId) q = q.eq('semester_id', filters.semesterId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as PaymentSummaryRow[]
    },
  })

  const courseOptions = useMemo(() => {
    const s = new Set<string>()
    for (const r of usage.data ?? []) s.add(`${r.course_code} ${r.course_name}`)
    return [...s].sort()
  }, [usage.data])

  const matchCourse = (code: string, name: string) =>
    !filters.courseCode || `${code} ${name}` === filters.courseCode

  // รวมหลายหมวดเงินของรายวิชาเดียวกันเป็นบรรทัดเดียว
  const perCourse = useMemo(() => {
    const m = new Map<string, { code: string; name: string; allocated: number; used: number }>()
    for (const r of usage.data ?? []) {
      if (!matchCourse(r.course_code, r.course_name)) continue
      const k = r.course_code
      const cur = m.get(k) ?? { code: r.course_code, name: r.course_name, allocated: 0, used: 0 }
      cur.allocated += Number(r.allocated_amount)
      cur.used += Number(r.used_amount)
      m.set(k, cur)
    }
    return [...m.values()].sort((a, b) => b.used - a.used)
  }, [usage.data, filters.courseCode])

  const spendPoints = useMemo<SpendPoint[]>(() => {
    const out: SpendPoint[] = []
    for (const r of payments.data ?? []) {
      if (!matchCourse(r.course_code, r.course_name)) continue
      const iso = r.teaching_month ?? r.payment_date
      if (!iso) continue
      out.push({ month: Number(iso.slice(5, 7)), courseCode: r.course_code, amount: Number(r.amount) })
    }
    return out
  }, [payments.data, filters.courseCode])

  const paymentRows = useMemo(
    () => (payments.data ?? []).filter((r) => matchCourse(r.course_code, r.course_name)),
    [payments.data, filters.courseCode],
  )

  const totals = useMemo(() => {
    const allocated = perCourse.reduce((s, r) => s + r.allocated, 0)
    const used = perCourse.reduce((s, r) => s + r.used, 0)
    return { allocated, used, remaining: allocated - used }
  }, [perCourse])

  const usedColumns: Column<(typeof perCourse)[number]>[] = [
    { key: 'code', header: 'รหัสวิชา', render: (r) => <span className="font-medium">{r.code}</span> },
    { key: 'name', header: 'ชื่อรายวิชา', render: (r) => r.name },
    { key: 'allocated', header: 'วงเงินที่จัดสรร', align: 'right', hideOnMobile: true, render: (r) => formatBaht(r.allocated) },
    { key: 'used', header: 'ใช้ไปแล้ว (บาท)', align: 'right', render: (r) => formatBaht(r.used) },
    {
      key: 'pct', header: 'สัดส่วน', align: 'right', hideOnMobile: true,
      render: (r) => (r.allocated > 0 ? `${formatNumber((r.used / r.allocated) * 100, 1)}%` : '-'),
    },
  ]

  const remainColumns: Column<(typeof perCourse)[number]>[] = [
    { key: 'code', header: 'รหัสวิชา', render: (r) => <span className="font-medium">{r.code}</span> },
    { key: 'name', header: 'ชื่อรายวิชา', render: (r) => r.name },
    { key: 'allocated', header: 'วงเงินที่จัดสรร', align: 'right', hideOnMobile: true, render: (r) => formatBaht(r.allocated) },
    {
      key: 'remaining', header: 'คงเหลือ (บาท)', align: 'right',
      render: (r) => {
        const v = r.allocated - r.used
        return (
          <span className={v <= 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : ''}>
            {formatBaht(v)}
            {v <= 0 && <span className="ml-1 text-xs">(หมด)</span>}
          </span>
        )
      },
    },
  ]

  const paymentColumns: Column<PaymentSummaryRow>[] = [
    { key: 'payee', header: 'คำนำหน้า ชื่อ-สกุล ผู้สอน', render: (r) => fullName(r.payee_prefix, r.payee_name, null) },
    { key: 'course', header: 'รายวิชา', render: (r) => `${r.course_code} ${r.course_name}` },
    { key: 'month', header: 'เดือน/ปี พ.ศ.', hideOnMobile: true, render: (r) => formatMonthBE(r.teaching_month) },
    { key: 'item', header: 'รายการ', hideOnMobile: true, render: (r) => EXPENSE_ITEM_LABEL[r.expense_item] ?? r.expense_item },
    { key: 'year', header: 'ชั้นปี', align: 'center', hideOnMobile: true, render: (r) => (r.student_year_level ? `ปี ${r.student_year_level}` : '-') },
    { key: 'amount', header: 'จำนวนเงิน', align: 'right', render: (r) => formatBaht(Number(r.amount)) },
    { key: 'paid', header: 'วันที่จ่ายเงิน', hideOnMobile: true, render: (r) => formatDateBE(r.payment_date) },
    { key: 'bank', header: 'โอนผ่านธนาคาร', hideOnMobile: true, render: (r) => r.payment_bank_name ?? '-' },
    { key: 'status', header: 'สถานะ', render: (r) => <StatusBadge status={r.status} /> },
  ]

  const exportPayments = () => {
    downloadCsv(
      `สรุปการจ่ายเงิน-ปีงบ${activeFiscalYear?.year_be ?? ''}`,
      toCsv(
        paymentRows.map((r) => ({
          ผู้สอน: fullName(r.payee_prefix, r.payee_name, null),
          รายวิชา: `${r.course_code} ${r.course_name}`,
          เดือน: formatMonthBE(r.teaching_month),
          รายการ: EXPENSE_ITEM_LABEL[r.expense_item] ?? r.expense_item,
          ชั้นปี: r.student_year_level ?? '',
          จำนวนเงิน: Number(r.amount).toFixed(2),
          วันที่จ่ายเงิน: formatDateBE(r.payment_date),
          ธนาคาร: r.payment_bank_name ?? '',
        })),
        [
          { key: 'ผู้สอน', header: 'คำนำหน้า ชื่อ-สกุล ผู้สอน' },
          { key: 'รายวิชา', header: 'รายวิชา' },
          { key: 'เดือน', header: 'เดือน ปี พ.ศ.' },
          { key: 'รายการ', header: 'รายการ' },
          { key: 'ชั้นปี', header: 'ชั้นปีที่สอน' },
          { key: 'จำนวนเงิน', header: 'จำนวนเงิน' },
          { key: 'วันที่จ่ายเงิน', header: 'วันที่จ่ายเงิน' },
          { key: 'ธนาคาร', header: 'โอนผ่านธนาคาร' },
        ],
      ),
    )
  }

  const error = refs.error ?? usage.error ?? payments.error

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">หน้าหลัก</h1>

      {error && (
        <div role="alert" className="card border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
          <span aria-hidden="true">⚠ </span>
          ไม่สามารถโหลดข้อมูลได้: {(error as Error).message}
        </div>
      )}

      {/* ตัวกรอง — เรียงแถวเดียวเหนือกราฟตามหลักการอ่านแดชบอร์ด */}
      <section className="card p-4">
        <h2 className="sr-only">ตัวกรองข้อมูล</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="f-fy" className="field-label">ปีงบประมาณ</label>
            <select
              id="f-fy" className="field-input" value={activeFiscalYear?.id ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, fiscalYearId: e.target.value }))}
            >
              {(refs.data?.fiscalYears ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  พ.ศ. {f.year_be}{f.is_closed ? ' (ปิดแล้ว)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="f-ay" className="field-label">ปีการศึกษา</label>
            <select
              id="f-ay" className="field-input" value={filters.academicYearId}
              onChange={(e) => setFilters((f) => ({ ...f, academicYearId: e.target.value, semesterId: '' }))}
            >
              <option value="">ทั้งหมด</option>
              {(refs.data?.academicYears ?? []).map((a) => (
                <option key={a.id} value={a.id}>พ.ศ. {a.year_be}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="f-sem" className="field-label">ภาคการศึกษา</label>
            <select
              id="f-sem" className="field-input" value={filters.semesterId}
              onChange={(e) => setFilters((f) => ({ ...f, semesterId: e.target.value }))}
            >
              <option value="">ทั้งหมด</option>
              {(refs.data?.semesters ?? [])
                .filter((s) => !filters.academicYearId || s.academic_year_id === filters.academicYearId)
                .map((s) => (
                  <option key={s.id} value={s.id}>{s.name_th}</option>
                ))}
            </select>
          </div>

          <div>
            <label htmlFor="f-course" className="field-label">รายวิชา</label>
            <select
              id="f-course" className="field-input" value={filters.courseCode}
              onChange={(e) => setFilters((f) => ({ ...f, courseCode: e.target.value }))}
            >
              <option value="">ทั้งหมด</option>
              {courseOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="วงเงินที่จัดสรร" value={formatBaht(totals.allocated)} />
        <StatTile label="ใช้ไปแล้ว" value={formatBaht(totals.used)} />
        <StatTile
          label="คงเหลือ" value={formatBaht(totals.remaining)}
          tone={totals.remaining <= 0 ? 'warn' : 'normal'}
        />
      </div>

      <BudgetLineChart
        points={spendPoints}
        fiscalYearBE={activeFiscalYear?.year_be ?? 0}
        loading={payments.isLoading}
      />

      <DataTable
        title="จำนวนเงินที่ใช้ไปแล้วแต่ละรายวิชา"
        description={`ปีงบประมาณ พ.ศ. ${activeFiscalYear?.year_be ?? '-'}`}
        rows={perCourse} columns={usedColumns} rowKey={(r) => `used-${r.code}`}
        loading={usage.isLoading}
      />

      <DataTable
        title="จำนวนเงินคงเหลือแต่ละรายวิชา"
        description={`ปีงบประมาณ พ.ศ. ${activeFiscalYear?.year_be ?? '-'}`}
        rows={perCourse} columns={remainColumns} rowKey={(r) => `remain-${r.code}`}
        loading={usage.isLoading}
      />

      <DataTable
        title="สรุปการจ่ายเงินของแต่ละรายวิชา"
        rows={paymentRows} columns={paymentColumns} rowKey={(r) => `${r.voucher_id}-${r.payee_name}-${r.expense_item}-${r.amount}`}
        loading={payments.isLoading}
        toolbar={
          <button type="button" onClick={exportPayments} className="btn-secondary !min-h-[40px] !px-3" disabled={paymentRows.length === 0}>
            ส่งออก CSV
          </button>
        }
      />
    </div>
  )
}

function StatTile({ label, value, tone = 'normal' }: { label: string; value: string; tone?: 'normal' | 'warn' }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p
        className={[
          'mt-1 text-xl font-semibold tabular-nums sm:text-2xl',
          tone === 'warn' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white',
        ].join(' ')}
      >
        {value}
        <span className="ml-1 text-sm font-normal text-slate-500">บาท</span>
      </p>
    </div>
  )
}
