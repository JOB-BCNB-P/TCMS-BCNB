import { CrudPage } from '@/components/CrudPage'
import { BankAccountField } from '@/components/BankAccountField'
import { useLookups } from '@/hooks/useCrud'

interface Site {
  id: string
  name_th: string
  ward: string | null
  province: string | null
  department_id: string | null
  phone: string | null
  has_bank_account: boolean
  is_active: boolean
  departments: { name_th: string } | null
}

export function SitesPage() {
  const lookups = useLookups()
  const deptOptions = (lookups.data?.departments ?? []).map((d) => ({
    value: d.id as string, label: d.name_th as string,
  }))
  const banks = (lookups.data?.banks ?? []) as { code: string; name_th: string }[]

  return (
    <CrudPage<Site>
      title="แหล่งฝึกปฏิบัติการ"
      description="สถานที่ที่นักศึกษาไปฝึกภาคปฏิบัติ — ผู้รับค่าตอบแทนแหล่งฝึกคือหน่วยงาน ไม่ใช่บุคคล"
      menuKey="master.site"
      table="clinical_sites"
      select="id, name_th, ward, province, department_id, phone, has_bank_account, is_active, departments(name_th)"
      orderBy="name_th"
      label="แหล่งฝึก"
      loadingExtra={lookups.isLoading}
      searchFields={(r) => `${r.name_th} ${r.ward ?? ''} ${r.province ?? ''}`}
      columns={[
        { key: 'name', header: 'ชื่อสถานที่', render: (r) => <span className="font-medium">{r.name_th}</span> },
        { key: 'ward', header: 'Ward', render: (r) => r.ward ?? '-' },
        { key: 'province', header: 'จังหวัด', hideOnMobile: true, render: (r) => r.province ?? '-' },
        { key: 'dept', header: 'สาขาวิชา', hideOnMobile: true, render: (r) => r.departments?.name_th ?? '-' },
        {
          key: 'bank', header: 'เลขบัญชี', align: 'center',
          render: (r) => r.has_bank_account
            ? <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />มีแล้ว
              </span>
            : <span className="text-slate-400">ยังไม่มี</span>,
        },
      ]}
      fields={[
        { name: 'name_th', label: 'ชื่อสถานที่', type: 'text', required: true, wide: true },
        { name: 'ward', label: 'Ward', type: 'text' },
        { name: 'province', label: 'จังหวัด', type: 'text' },
        {
          name: 'department_id', label: 'สาขาวิชาที่รับผิดชอบ', type: 'select', options: deptOptions,
          help: 'ถ้าเว้นว่าง ทุกสาขาวิชาจะมองเห็นแหล่งฝึกนี้',
        },
        { name: 'phone', label: 'เบอร์โทรศัพท์', type: 'text' },
        { name: 'is_active', label: 'สถานะ', type: 'checkbox', placeholder: 'เปิดใช้งาน' },
      ]}
      toForm={(r) => ({
        name_th: r?.name_th ?? '', ward: r?.ward ?? '', province: r?.province ?? '',
        department_id: r?.department_id ?? '', phone: r?.phone ?? '', is_active: r?.is_active ?? true,
      })}
      renderExtra={(row) => (
        <BankAccountField
          ownerType="clinical_site"
          ownerId={row?.id ?? null}
          ownerName={row?.name_th ?? ''}
          hasAccount={row?.has_bank_account ?? false}
          banks={banks}
        />
      )}
      csv={{
        templateName: 'ฟอร์มนำเข้าแหล่งฝึก',
        columns: [
          { header: 'ชื่อสถานที่', field: 'name_th', required: true, example: 'โรงพยาบาลราชวิถี' },
          { header: 'Ward', field: 'ward', example: 'อายุรกรรมชาย' },
          { header: 'จังหวัด', field: 'province', example: 'กรุงเทพมหานคร' },
          { header: 'เบอร์โทรศัพท์', field: 'phone', example: '021234567' },
        ],
      }}
      exportColumns={[
        { key: 'name', header: 'ชื่อสถานที่', value: (r) => r.name_th },
        { key: 'ward', header: 'Ward', value: (r) => r.ward ?? '' },
        { key: 'province', header: 'จังหวัด', value: (r) => r.province ?? '' },
        { key: 'dept', header: 'สาขาวิชา', value: (r) => r.departments?.name_th ?? '' },
        { key: 'bank', header: 'มีเลขบัญชีแล้ว', value: (r) => (r.has_bank_account ? 'มี' : 'ยังไม่มี') },
      ]}
    />
  )
}
