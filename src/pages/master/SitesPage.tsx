import { CrudPage } from '@/components/CrudPage'
import { BankAccountField } from '@/components/BankAccountField'
import { syncLinkTable, useLookups } from '@/hooks/useCrud'

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
  clinical_site_departments: { department_id: string }[]
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
      select="id, name_th, ward, province, department_id, phone, has_bank_account, is_active, departments(name_th), clinical_site_departments(department_id)"
      orderBy="name_th"
      label="แหล่งฝึก"
      loadingExtra={lookups.isLoading}
      searchFields={(r) => `${r.name_th} ${r.ward ?? ''} ${r.province ?? ''}`}
      afterSave={async (row, values) =>
        syncLinkTable({
          table: 'clinical_site_departments',
          parentColumn: 'clinical_site_id',
          parentId: row.id,
          childColumn: 'department_id',
          want: (values.co_department_ids as string[] | undefined) ?? [],
          keep: values.department_id ? [String(values.department_id)] : [],
        })
      }
      columns={[
        { key: 'name', header: 'ชื่อสถานที่', render: (r) => <span className="font-medium">{r.name_th}</span> },
        { key: 'ward', header: 'Ward', render: (r) => r.ward ?? '-' },
        { key: 'province', header: 'จังหวัด', hideOnMobile: true, render: (r) => r.province ?? '-' },
        {
          key: 'dept', header: 'สาขาที่ใช้', hideOnMobile: true,
          render: (r) => {
            const ids = (r.clinical_site_departments ?? []).map((d) => d.department_id)
            if (ids.length === 0) {
              return <span className="text-brand-700 dark:text-brand-300">ใช้ร่วมทุกสาขา</span>
            }
            return deptOptions.filter((o) => ids.includes(o.value)).map((o) => o.label).join(', ')
          },
        },
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
          name: 'department_id', label: 'สาขาหลักที่รับผิดชอบ', type: 'select', options: deptOptions,
          help: 'เว้นว่างได้ถ้าเป็นแหล่งฝึกกลางที่ทุกสาขาใช้ร่วมกัน',
        },
        {
          name: 'co_department_ids', label: 'สาขาอื่นที่ใช้แหล่งฝึกนี้', type: 'multiselect',
          options: deptOptions, wide: true,
          help: 'ติ๊กเฉพาะสาขาที่ใช้จริง — ถ้าไม่ติ๊กเลยและเว้นสาขาหลักว่างไว้ ทุกสาขาจะเห็นแหล่งฝึกนี้',
        },
        { name: 'phone', label: 'เบอร์โทรศัพท์', type: 'text' },
        { name: 'is_active', label: 'สถานะ', type: 'checkbox', placeholder: 'เปิดใช้งาน' },
      ]}
      toForm={(r) => ({
        name_th: r?.name_th ?? '', ward: r?.ward ?? '', province: r?.province ?? '',
        department_id: r?.department_id ?? '', phone: r?.phone ?? '', is_active: r?.is_active ?? true,
        co_department_ids: r?.clinical_site_departments?.map((d) => d.department_id) ?? [],
      })}
      fromForm={(v) => {
        const { co_department_ids: _ignored, ...rest } = v
        void _ignored
        return rest
      }}
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
        {
          key: 'dept', header: 'สาขาที่ใช้',
          value: (r) => {
            const ids = (r.clinical_site_departments ?? []).map((d) => d.department_id)
            return ids.length === 0
              ? 'ใช้ร่วมทุกสาขา'
              : deptOptions.filter((o) => ids.includes(o.value)).map((o) => o.label).join(' / ')
          },
        },
        { key: 'bank', header: 'มีเลขบัญชีแล้ว', value: (r) => (r.has_bank_account ? 'มี' : 'ยังไม่มี') },
      ]}
    />
  )
}
