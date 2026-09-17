import { CrudPage } from '@/components/CrudPage'
import { useLookups } from '@/hooks/useCrud'

interface Course {
  id: string
  code: string
  name_th: string
  name_en: string | null
  course_kind: 'theory' | 'practice'
  department_id: string
  credits: number | null
  is_active: boolean
  departments: { name_th: string } | null
}

const KIND_LABEL = { theory: 'ทฤษฎี', practice: 'ปฏิบัติ' } as const

export function CoursesPage() {
  const lookups = useLookups()
  const deptOptions = (lookups.data?.departments ?? []).map((d) => ({
    value: d.id as string, label: d.name_th as string,
  }))

  return (
    <CrudPage<Course>
      title="รายวิชา"
      description="ข้อมูลรายวิชาของแต่ละสาขาวิชา — เปิดสอนในภาคใดบ้างกำหนดที่เมนูหมวดเงินและวงเงินรายวิชา"
      menuKey="master.course"
      table="courses"
      select="id, code, name_th, name_en, course_kind, department_id, credits, is_active, departments(name_th)"
      orderBy="code"
      label="รายวิชา"
      loadingExtra={lookups.isLoading}
      searchFields={(r) => `${r.code} ${r.name_th} ${r.name_en ?? ''}`}
      columns={[
        { key: 'code', header: 'รหัสวิชา', render: (r) => <span className="font-medium">{r.code}</span> },
        { key: 'name', header: 'ชื่อรายวิชา', render: (r) => r.name_th },
        { key: 'kind', header: 'ประเภท', render: (r) => KIND_LABEL[r.course_kind] },
        { key: 'dept', header: 'สาขาวิชา', hideOnMobile: true, render: (r) => r.departments?.name_th ?? '-' },
        { key: 'credits', header: 'หน่วยกิต', align: 'right', hideOnMobile: true, render: (r) => r.credits ?? '-' },
        {
          key: 'active', header: 'สถานะ',
          render: (r) => r.is_active
            ? <span className="text-emerald-700 dark:text-emerald-400">✔ ใช้งาน</span>
            : <span className="text-slate-500">✕ ปิดใช้งาน</span>,
        },
      ]}
      fields={[
        { name: 'code', label: 'รหัสวิชา', type: 'text', required: true, placeholder: 'เช่น PED101' },
        { name: 'name_th', label: 'ชื่อรายวิชา (ไทย)', type: 'text', required: true },
        { name: 'name_en', label: 'ชื่อรายวิชา (อังกฤษ)', type: 'text' },
        {
          name: 'course_kind', label: 'ประเภทรายวิชา', type: 'select', required: true,
          options: [{ value: 'theory', label: 'ทฤษฎี' }, { value: 'practice', label: 'ปฏิบัติ' }],
          help: 'วิชาปฏิบัติจึงจะผูกกับแหล่งฝึกได้',
        },
        { name: 'department_id', label: 'สาขาวิชา', type: 'select', required: true, options: deptOptions },
        {
          name: 'credits', label: 'หน่วยกิต', type: 'number',
          validate: (v) => (v !== null && v !== '' && Number(v) < 0 ? 'ต้องไม่ติดลบ' : null),
        },
        { name: 'is_active', label: 'สถานะ', type: 'checkbox', placeholder: 'เปิดใช้งาน' },
      ]}
      toForm={(r) => ({
        code: r?.code ?? '', name_th: r?.name_th ?? '', name_en: r?.name_en ?? '',
        course_kind: r?.course_kind ?? 'theory', department_id: r?.department_id ?? '',
        credits: r?.credits ?? null, is_active: r?.is_active ?? true,
      })}
      csv={{
        templateName: 'ฟอร์มนำเข้ารายวิชา',
        columns: [
          { header: 'รหัสวิชา', field: 'code', required: true, example: 'PED101' },
          { header: 'ชื่อรายวิชา', field: 'name_th', required: true, example: 'การพยาบาลเด็ก 1' },
          { header: 'ชื่อภาษาอังกฤษ', field: 'name_en', example: 'Pediatric Nursing 1' },
          {
            header: 'ประเภท (ทฤษฎี/ปฏิบัติ)', field: 'course_kind', required: true, example: 'ทฤษฎี',
            parse: (raw) => raw === 'ทฤษฎี' || raw.toLowerCase() === 'theory'
              ? { value: 'theory' }
              : raw === 'ปฏิบัติ' || raw.toLowerCase() === 'practice'
                ? { value: 'practice' }
                : { error: 'ต้องเป็น "ทฤษฎี" หรือ "ปฏิบัติ"' },
          },
          {
            header: 'สาขาวิชา', field: 'department_id', required: true, example: 'สาขาวิชาการพยาบาลเด็ก',
            parse: (raw) => {
              const d = (lookups.data?.departments ?? []).find(
                (x) => x.name_th === raw || x.code === raw,
              )
              return d ? { value: d.id } : { error: `ไม่พบสาขาวิชา "${raw}" — ใช้ชื่อหรือรหัสให้ตรงกับที่มีในระบบ` }
            },
          },
          {
            header: 'หน่วยกิต', field: 'credits', example: '3',
            parse: (raw) => Number.isFinite(Number(raw)) ? { value: Number(raw) } : { error: 'ต้องเป็นตัวเลข' },
          },
        ],
      }}
      exportColumns={[
        { key: 'code', header: 'รหัสวิชา', value: (r) => r.code },
        { key: 'name_th', header: 'ชื่อรายวิชา', value: (r) => r.name_th },
        { key: 'kind', header: 'ประเภท', value: (r) => KIND_LABEL[r.course_kind] },
        { key: 'dept', header: 'สาขาวิชา', value: (r) => r.departments?.name_th ?? '' },
        { key: 'credits', header: 'หน่วยกิต', value: (r) => r.credits ?? '' },
        { key: 'active', header: 'สถานะ', value: (r) => (r.is_active ? 'ใช้งาน' : 'ปิดใช้งาน') },
      ]}
    />
  )
}
