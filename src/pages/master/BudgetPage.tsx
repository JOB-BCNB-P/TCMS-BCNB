import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { CrudPage } from '@/components/CrudPage'
import { useLookups } from '@/hooks/useCrud'
import { formatBaht } from '@/lib/format'
import { FUND_SOURCE_LABEL, EXPENSE_ITEM_LABEL, RATE_UNIT_LABEL, type FundSource, type RateUnit } from '@/lib/types'

interface Allocation {
  id: string
  course_offering_id: string
  budget_category_id: string
  allocated_amount: number
  note: string | null
  budget_categories: { name_th: string; fund_source: FundSource; expense_item: string } | null
  course_offerings: {
    section: string
    student_year_level: number
    courses: { code: string; name_th: string }
  } | null
}

interface PayRate {
  id: string
  fund_source: FundSource
  expense_item: string
  budget_category_name: string | null
  is_government_officer: boolean | null
  unit: RateUnit
  amount: number | null
  is_ceiling: boolean
  source_note: string | null
}

export function BudgetPage() {
  const lookups = useLookups()
  const [showRates, setShowRates] = useState(false)

  const rates = useQuery({
    queryKey: ['pay-rates'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_pay_rates')
        .select('id, fund_source, expense_item, budget_category_name, is_government_officer, unit, amount, is_ceiling, source_note')
        .order('fund_source')
      if (error) throw error
      return (data ?? []) as PayRate[]
    },
  })

  const offeringOptions = useMemo(
    () => (lookups.data?.offerings ?? []).map((o) => ({
      value: o.id,
      label: `${o.courses?.code ?? ''} ${o.courses?.name_th ?? ''} · ปี ${o.student_year_level} · หมู่ ${o.section}`,
    })),
    [lookups.data],
  )

  const categoryOptions = useMemo(
    () => (lookups.data?.budgetCategories ?? []).map((c) => ({
      value: c.id as string, label: c.name_th as string,
    })),
    [lookups.data],
  )

  return (
    <div className="space-y-4">
      <CrudPage<Allocation>
        title="หมวดเงินและวงเงินรายวิชา"
        description="ตั้งวงเงินที่จัดสรรให้แต่ละรายวิชาแยกตามแหล่งเงิน — ระบบจะปฏิเสธการเบิกที่ทำให้ยอดรวมเกินวงเงินนี้"
        menuKey="master.budget"
        table="course_budget_allocations"
        select="id, course_offering_id, budget_category_id, allocated_amount, note, budget_categories(name_th, fund_source, expense_item), course_offerings(section, student_year_level, courses(code, name_th))"
        orderBy="updated_at"
        label="วงเงิน"
        loadingExtra={lookups.isLoading}
        searchFields={(r) =>
          `${r.course_offerings?.courses?.code ?? ''} ${r.course_offerings?.courses?.name_th ?? ''} ${r.budget_categories?.name_th ?? ''}`}
        columns={[
          {
            key: 'course', header: 'รายวิชา',
            render: (r) => (
              <div>
                <span className="font-medium">{r.course_offerings?.courses?.code ?? '-'}</span>
                <span className="ml-1">{r.course_offerings?.courses?.name_th ?? ''}</span>
                {r.course_offerings && (
                  <span className="block text-xs text-slate-500">
                    ชั้นปี {r.course_offerings.student_year_level} · หมู่ {r.course_offerings.section}
                  </span>
                )}
              </div>
            ),
          },
          {
            key: 'fund', header: 'แหล่งเงิน', hideOnMobile: true,
            render: (r) => r.budget_categories ? FUND_SOURCE_LABEL[r.budget_categories.fund_source] : '-',
          },
          {
            key: 'item', header: 'รายการ',
            render: (r) => r.budget_categories
              ? EXPENSE_ITEM_LABEL[r.budget_categories.expense_item] ?? r.budget_categories.expense_item
              : '-',
          },
          {
            key: 'amount', header: 'วงเงินที่จัดสรร', align: 'right',
            render: (r) => formatBaht(Number(r.allocated_amount)),
          },
          { key: 'note', header: 'หมายเหตุ', hideOnMobile: true, render: (r) => r.note ?? '-' },
        ]}
        fields={[
          {
            name: 'course_offering_id', label: 'รายวิชาที่เปิดสอน', type: 'select',
            required: true, options: offeringOptions, wide: true,
            help: offeringOptions.length === 0
              ? 'ยังไม่มีรายวิชาที่เปิดสอน — ต้องสร้างรายวิชาและเปิดสอนในภาคการศึกษาก่อน'
              : undefined,
          },
          {
            name: 'budget_category_id', label: 'หมวดเงิน (แหล่งเงิน × รายการ)', type: 'select',
            required: true, options: categoryOptions, wide: true,
            help: 'อัตราค่าตอบแทนผูกกับหมวดเงินนี้ — เลือกผิดจะคิดเงินผิดอัตรา ดูตารางอัตราด้านล่าง',
          },
          {
            name: 'allocated_amount', label: 'วงเงินที่จัดสรร (บาท)', type: 'number', required: true,
            validate: (v) => (Number(v) < 0 ? 'ต้องไม่ติดลบ' : null),
          },
          { name: 'note', label: 'หมายเหตุ', type: 'textarea' },
        ]}
        toForm={(r) => ({
          course_offering_id: r?.course_offering_id ?? '',
          budget_category_id: r?.budget_category_id ?? '',
          allocated_amount: r?.allocated_amount ?? null,
          note: r?.note ?? '',
        })}
        exportColumns={[
          { key: 'code', header: 'รหัสวิชา', value: (r) => r.course_offerings?.courses?.code ?? '' },
          { key: 'name', header: 'ชื่อรายวิชา', value: (r) => r.course_offerings?.courses?.name_th ?? '' },
          { key: 'cat', header: 'หมวดเงิน', value: (r) => r.budget_categories?.name_th ?? '' },
          { key: 'amount', header: 'วงเงินที่จัดสรร', value: (r) => Number(r.allocated_amount).toFixed(2) },
          { key: 'note', header: 'หมายเหตุ', value: (r) => r.note ?? '' },
        ]}
      />

      <section className="card overflow-hidden">
        <button
          type="button"
          onClick={() => setShowRates((v) => !v)}
          className="flex w-full items-center justify-between p-4 text-left"
          aria-expanded={showRates}
        >
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              อัตราค่าตอบแทนตามหลักเกณฑ์ของวิทยาลัย
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              ระบบใช้ตารางนี้เติมอัตราและคำนวณเงินให้อัตโนมัติ และปฏิเสธการกรอกที่เกินเพดาน
            </p>
          </div>
          <span aria-hidden="true" className="text-slate-400">{showRates ? '▲' : '▼'}</span>
        </button>

        {showRates && (
          <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left">แหล่งเงิน</th>
                  <th scope="col" className="px-3 py-2 text-left">รายการ</th>
                  <th scope="col" className="px-3 py-2 text-left">ใช้กับ</th>
                  <th scope="col" className="px-3 py-2 text-right">อัตรา</th>
                  <th scope="col" className="px-3 py-2 text-left">หน่วย</th>
                  <th scope="col" className="px-3 py-2 text-left">แบบ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(rates.data ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2">{FUND_SOURCE_LABEL[r.fund_source]}</td>
                    <td className="px-3 py-2">{EXPENSE_ITEM_LABEL[r.expense_item] ?? r.expense_item}</td>
                    <td className="px-3 py-2">
                      {r.is_government_officer === null
                        ? 'ทุกกรณี'
                        : r.is_government_officer
                          ? 'ข้าราชการ/ลูกจ้างประจำ'
                          : 'ผู้ที่มิได้เป็นข้าราชการ'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.amount === null ? '—' : formatBaht(Number(r.amount))}
                    </td>
                    <td className="px-3 py-2">{RATE_UNIT_LABEL[r.unit]}</td>
                    <td className="px-3 py-2">
                      {r.amount === null
                        ? <span className="text-amber-600 dark:text-amber-400">เบิกตามจ่ายจริง (ไม่มีเพดาน)</span>
                        : r.is_ceiling
                          ? 'ไม่เกิน'
                          : 'อัตราตายตัว'}
                    </td>
                  </tr>
                ))}
                {rates.isLoading && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">กำลังโหลด…</td></tr>
                )}
              </tbody>
            </table>
            <p className="border-t border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              แก้ไขอัตราได้เฉพาะผู้ดูแลระบบผ่านตาราง <code>pay_rates</code> และทุกการแก้ไขถูกบันทึกไว้ในร่องรอยการใช้งาน
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
