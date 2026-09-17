import { CrudPage } from '@/components/CrudPage'
import { useLookups } from '@/hooks/useCrud'
import { fullName } from '@/lib/format'

interface Coordinator {
  id: string
  prefix: string | null
  first_name: string
  last_name: string
  position_title: string | null
  department_id: string
  is_active: boolean
  departments: { name_th: string } | null
}

export function CoordinatorsPage() {
  const lookups = useLookups()
  const deptOptions = (lookups.data?.departments ?? []).map((d) => ({
    value: d.id as string, label: d.name_th as string,
  }))

  return (
    <CrudPage<Coordinator>
      title="ผู้ประสานงานรายวิชา"
      description='คนเดียวกับ "ผู้จัดทำ" ที่จะลงนามในใบหลักฐานการเบิกจ่ายค่าสอนพิเศษ'
      menuKey="master.coord"
      table="coordinators"
      select="id, prefix, first_name, last_name, position_title, department_id, is_active, departments(name_th)"
      orderBy="first_name"
      label="ผู้ประสานงานรายวิชา"
      loadingExtra={lookups.isLoading}
      searchFields={(r) => `${r.first_name} ${r.last_name} ${r.position_title ?? ''}`}
      columns={[
        { key: 'name', header: 'คำนำหน้า ชื่อ-สกุล', render: (r) => fullName(r.prefix, r.first_name, r.last_name) },
        { key: 'pos', header: 'ตำแหน่ง', render: (r) => r.position_title ?? '-' },
        { key: 'dept', header: 'สาขาวิชา', hideOnMobile: true, render: (r) => r.departments?.name_th ?? '-' },
        {
          key: 'active', header: 'สถานะ',
          render: (r) => r.is_active
            ? <span className="text-emerald-700 dark:text-emerald-400">✔ ใช้งาน</span>
            : <span className="text-slate-500">✕ ปิดใช้งาน</span>,
        },
      ]}
      fields={[
        { name: 'prefix', label: 'คำนำหน้า', type: 'text' },
        { name: 'first_name', label: 'ชื่อ', type: 'text', required: true },
        { name: 'last_name', label: 'นามสกุล', type: 'text', required: true },
        {
          name: 'position_title', label: 'ตำแหน่ง', type: 'text',
          help: 'พิมพ์ลงช่อง "ตำแหน่ง" ใต้ลายมือชื่อผู้จัดทำในแบบฟอร์ม',
        },
        { name: 'department_id', label: 'สาขาวิชา', type: 'select', required: true, options: deptOptions },
        { name: 'is_active', label: 'สถานะ', type: 'checkbox', placeholder: 'เปิดใช้งาน' },
      ]}
      toForm={(r) => ({
        prefix: r?.prefix ?? '', first_name: r?.first_name ?? '', last_name: r?.last_name ?? '',
        position_title: r?.position_title ?? '', department_id: r?.department_id ?? '',
        is_active: r?.is_active ?? true,
      })}
      exportColumns={[
        { key: 'name', header: 'คำนำหน้า ชื่อ-สกุล', value: (r) => fullName(r.prefix, r.first_name, r.last_name) },
        { key: 'pos', header: 'ตำแหน่ง', value: (r) => r.position_title ?? '' },
        { key: 'dept', header: 'สาขาวิชา', value: (r) => r.departments?.name_th ?? '' },
      ]}
    />
  )
}
