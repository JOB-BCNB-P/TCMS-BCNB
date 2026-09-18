import { useState } from 'react'
import { CrudPage } from '@/components/CrudPage'
import { useLookups } from '@/hooks/useCrud'
import { OrgSettingsCard } from './OrgSettingsCard'
import { formatDateBE, BE_OFFSET } from '@/lib/thaiDate'

interface AcademicYear { id: string; year_be: number; is_active: boolean }
interface Semester {
  id: string; academic_year_id: string; code: 'first' | 'second' | 'summer'
  name_th: string; start_date: string; end_date: string
  academic_years: { year_be: number } | null
}
interface FiscalYear {
  id: string; year_be: number; start_date: string; end_date: string; is_closed: boolean
}
interface Department {
  id: string; code: string; name_th: string; sort_order: number; is_active: boolean
}

const SEM_LABEL: Record<Semester['code'], string> = {
  first: 'ภาคการศึกษาที่ 1',
  second: 'ภาคการศึกษาที่ 2',
  summer: 'ภาคฤดูร้อน',
}

const TABS = [
  { key: 'ay', label: 'ปีการศึกษา' },
  { key: 'sem', label: 'ภาคการศึกษา' },
  { key: 'fy', label: 'ปีงบประมาณ' },
  { key: 'dept', label: 'สาขาวิชา' },
  { key: 'org', label: 'ค่าคงที่องค์กร' },
] as const

type TabKey = (typeof TABS)[number]['key']

/** ปีงบประมาณไทยตายตัว 1 ต.ค. ถึง 30 ก.ย. — คำนวณให้ ไม่ให้กรอกเอง */
function fiscalRange(yearBE: number): { start_date: string; end_date: string } {
  const endAD = yearBE - BE_OFFSET
  return { start_date: `${endAD - 1}-10-01`, end_date: `${endAD}-09-30` }
}

const yearValidate = (v: unknown) => {
  const n = Number(v)
  if (!Number.isInteger(n) || n < 2500 || n > 2700) return 'กรอกเป็นปี พ.ศ. เช่น 2569'
  return null
}

export function ReferencePage() {
  const [tab, setTab] = useState<TabKey>('ay')
  const lookups = useLookups()

  const ayOptions = (lookups.data?.academicYears ?? []).map((a) => ({
    value: a.id as string, label: `พ.ศ. ${a.year_be}`,
  }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">
          ปีการศึกษา / ภาคการศึกษา / ปีงบประมาณ
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          ข้อมูลพื้นฐานที่รายวิชาที่เปิดสอน วงเงิน และใบเบิกทุกใบอ้างถึง — แก้ไขได้เฉพาะผู้ดูแลระบบ
        </p>
      </div>

      <div className="card overflow-x-auto p-1">
        <div role="tablist" aria-label="กลุ่มข้อมูลอ้างอิง" className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`min-h-[40px] whitespace-nowrap rounded-lg px-3 text-sm ${
                tab === t.key
                  ? 'bg-brand-600 font-medium text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'ay' && (
        <CrudPage<AcademicYear>
          title="ปีการศึกษา"
          description="ปี พ.ศ. ที่ใช้เปิดรายวิชา — ปิดใช้งานแทนการลบเมื่อมีข้อมูลผูกอยู่แล้ว"
          menuKey="settings.ref"
          table="academic_years"
          select="id, year_be, is_active"
          orderBy="year_be"
          ascending={false}
          label="ปีการศึกษา"
          columns={[
            { key: 'y', header: 'ปีการศึกษา', render: (r) => <span className="font-medium">พ.ศ. {r.year_be}</span> },
            {
              key: 'a', header: 'สถานะ',
              render: (r) => r.is_active
                ? <span className="text-emerald-700 dark:text-emerald-400">✔ ใช้งาน</span>
                : <span className="text-slate-500">✕ ปิดใช้งาน</span>,
            },
          ]}
          fields={[
            { name: 'year_be', label: 'ปีการศึกษา (พ.ศ.)', type: 'number', required: true, placeholder: '2569', validate: yearValidate },
            { name: 'is_active', label: 'สถานะ', type: 'checkbox', placeholder: 'เปิดใช้งาน' },
          ]}
          toForm={(r) => ({ year_be: r?.year_be ?? null, is_active: r?.is_active ?? true })}
        />
      )}

      {tab === 'sem' && (
        <CrudPage<Semester>
          title="ภาคการศึกษา"
          description="แต่ละปีการศึกษามีได้ภาคละหนึ่งรายการ — วันเริ่ม/สิ้นสุดใช้ตรวจว่าวันที่สอนในใบเบิกอยู่ในภาคจริง"
          menuKey="settings.ref"
          table="semesters"
          select="id, academic_year_id, code, name_th, start_date, end_date, academic_years(year_be)"
          orderBy="start_date"
          ascending={false}
          label="ภาคการศึกษา"
          loadingExtra={lookups.isLoading}
          columns={[
            {
              key: 'n', header: 'ภาคการศึกษา',
              render: (r) => (
                <div>
                  <span className="font-medium">{r.name_th}</span>
                  <span className="block text-xs text-slate-500">
                    ปีการศึกษา {r.academic_years ? `พ.ศ. ${r.academic_years.year_be}` : '-'}
                  </span>
                </div>
              ),
            },
            {
              key: 'd', header: 'ช่วงเวลา', hideOnMobile: true,
              render: (r) => `${formatDateBE(r.start_date)} – ${formatDateBE(r.end_date)}`,
            },
          ]}
          fields={[
            {
              name: 'academic_year_id', label: 'ปีการศึกษา', type: 'select', required: true, options: ayOptions,
              help: ayOptions.length === 0 ? 'ยังไม่มีปีการศึกษา — เพิ่มที่แท็บก่อนหน้า' : undefined,
            },
            {
              name: 'code', label: 'ภาค', type: 'select', required: true,
              options: (Object.keys(SEM_LABEL) as Semester['code'][]).map((c) => ({ value: c, label: SEM_LABEL[c] })),
            },
            { name: 'name_th', label: 'ชื่อที่ใช้แสดง', type: 'text', help: 'เว้นว่างได้ ระบบจะตั้งให้ตามภาคที่เลือก' },
            {
              name: 'start_date', label: 'วันเริ่มภาค', type: 'date', required: true,
              help: 'ปฏิทินเป็น ค.ศ. — พ.ศ. = ค.ศ. + 543',
            },
            {
              name: 'end_date', label: 'วันสิ้นสุดภาค', type: 'date', required: true,
              validate: (v, all) =>
                String(v) < String(all.start_date ?? '') ? 'ต้องไม่ก่อนวันเริ่มภาค' : null,
            },
          ]}
          toForm={(r) => ({
            academic_year_id: r?.academic_year_id ?? '',
            code: r?.code ?? 'first',
            name_th: r?.name_th ?? '',
            start_date: r?.start_date ?? '',
            end_date: r?.end_date ?? '',
          })}
          fromForm={(v) => ({
            ...v,
            name_th: String(v.name_th ?? '').trim() || SEM_LABEL[v.code as Semester['code']],
          })}
          exportColumns={[
            { key: 'ay', header: 'ปีการศึกษา', value: (r) => r.academic_years?.year_be ?? '' },
            { key: 'n', header: 'ภาคการศึกษา', value: (r) => r.name_th },
            { key: 's', header: 'วันเริ่ม', value: (r) => formatDateBE(r.start_date) },
            { key: 'e', header: 'วันสิ้นสุด', value: (r) => formatDateBE(r.end_date) },
          ]}
        />
      )}

      {tab === 'fy' && (
        <CrudPage<FiscalYear>
          title="ปีงบประมาณ"
          description="วันเริ่ม 1 ต.ค. ถึง 30 ก.ย. ระบบคำนวณให้เอง — ปิดปีงบแล้วจะแก้เอกสารย้อนหลังไม่ได้อีก"
          menuKey="settings.ref"
          table="fiscal_years"
          select="id, year_be, start_date, end_date, is_closed"
          orderBy="year_be"
          ascending={false}
          label="ปีงบประมาณ"
          columns={[
            { key: 'y', header: 'ปีงบประมาณ', render: (r) => <span className="font-medium">พ.ศ. {r.year_be}</span> },
            {
              key: 'd', header: 'ช่วงเวลา', hideOnMobile: true,
              render: (r) => `${formatDateBE(r.start_date)} – ${formatDateBE(r.end_date)}`,
            },
            {
              key: 'c', header: 'สถานะ',
              render: (r) => r.is_closed
                ? <span className="text-amber-700 dark:text-amber-400">🔒 ปิดแล้ว</span>
                : <span className="text-emerald-700 dark:text-emerald-400">✔ เปิดอยู่</span>,
            },
          ]}
          fields={[
            { name: 'year_be', label: 'ปีงบประมาณ (พ.ศ.)', type: 'number', required: true, placeholder: '2569', validate: yearValidate },
            {
              name: 'is_closed', label: 'ปิดปีงบประมาณ', type: 'checkbox', placeholder: 'ปิดแล้ว (ห้ามแก้ย้อนหลัง)',
              help: 'เมื่อปิดแล้ว ฐานข้อมูลจะปฏิเสธการสร้างและแก้ไขเอกสารของปีงบนี้ทุกกรณี',
            },
          ]}
          toForm={(r) => ({ year_be: r?.year_be ?? null, is_closed: r?.is_closed ?? false })}
          fromForm={(v) => ({ ...v, ...fiscalRange(Number(v.year_be)) })}
        />
      )}

      {tab === 'dept' && (
        <CrudPage<Department>
          title="สาขาวิชา"
          description="ขอบเขตการมองเห็นข้อมูลของเลขานุการสาขาผูกกับรายการนี้ — ลบไม่ได้เมื่อมีรายวิชาหรือผู้ใช้ผูกอยู่"
          menuKey="settings.ref"
          table="departments"
          select="id, code, name_th, sort_order, is_active"
          orderBy="sort_order"
          label="สาขาวิชา"
          columns={[
            { key: 'c', header: 'รหัส', render: (r) => <span className="font-medium">{r.code}</span> },
            { key: 'n', header: 'ชื่อสาขาวิชา', render: (r) => r.name_th },
            { key: 'o', header: 'ลำดับ', align: 'right', hideOnMobile: true, render: (r) => r.sort_order },
            {
              key: 'a', header: 'สถานะ',
              render: (r) => r.is_active
                ? <span className="text-emerald-700 dark:text-emerald-400">✔ ใช้งาน</span>
                : <span className="text-slate-500">✕ ปิดใช้งาน</span>,
            },
          ]}
          fields={[
            { name: 'code', label: 'รหัสสาขาวิชา', type: 'text', required: true, placeholder: 'PED' },
            { name: 'name_th', label: 'ชื่อสาขาวิชา', type: 'text', required: true, wide: true },
            { name: 'sort_order', label: 'ลำดับการแสดง', type: 'number' },
            { name: 'is_active', label: 'สถานะ', type: 'checkbox', placeholder: 'เปิดใช้งาน' },
          ]}
          toForm={(r) => ({
            code: r?.code ?? '', name_th: r?.name_th ?? '',
            sort_order: r?.sort_order ?? 0, is_active: r?.is_active ?? true,
          })}
        />
      )}

      {tab === 'org' && <OrgSettingsCard />}
    </div>
  )
}
