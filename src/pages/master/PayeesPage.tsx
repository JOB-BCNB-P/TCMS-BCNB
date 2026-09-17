import { supabase } from '@/lib/supabase'
import { CrudPage } from '@/components/CrudPage'
import { BankAccountField } from '@/components/BankAccountField'
import { useLookups } from '@/hooks/useCrud'
import { fullName } from '@/lib/format'

interface Payee {
  id: string
  payee_kind: 'special_lecturer' | 'preceptor'
  prefix: string | null
  first_name: string
  last_name: string
  position_title: string | null
  organization: string | null
  ward: string | null
  phone: string | null
  email: string | null
  is_government_officer: boolean | null
  has_bank_account: boolean
  is_active: boolean
  payee_departments: { department_id: string }[]
}

interface Props {
  kind: 'special_lecturer' | 'preceptor'
}

/**
 * อาจารย์พิเศษและอาจารย์แหล่งฝึกอยู่ตาราง payees เดียวกัน ต่างกันที่ payee_kind
 * และอาจารย์แหล่งฝึกมีช่อง Ward เพิ่ม
 */
export function PayeesPage({ kind }: Props) {
  const lookups = useLookups()
  const isPreceptor = kind === 'preceptor'
  const label = isPreceptor ? 'อาจารย์แหล่งฝึก' : 'อาจารย์พิเศษ'
  const menuKey = isPreceptor ? 'master.preceptor' : 'master.lecturer'

  const deptOptions = (lookups.data?.departments ?? []).map((d) => ({
    value: d.id as string, label: d.name_th as string,
  }))
  const banks = (lookups.data?.banks ?? []) as { code: string; name_th: string }[]

  /** สาขาวิชาที่เชิญสอนเก็บในตารางเชื่อม จึงต้องซิงก์แยกหลังบันทึกแถวหลัก */
  const syncDepartments = async (row: { id: string }, values: Record<string, unknown>) => {
    const want = (values.department_ids as string[] | undefined) ?? []
    const { data: current } = await supabase
      .from('payee_departments').select('department_id').eq('payee_id', row.id)
    const have = (current ?? []).map((r) => r.department_id as string)

    const toAdd = want.filter((d) => !have.includes(d))
    const toDel = have.filter((d) => !want.includes(d))

    if (toAdd.length > 0) {
      const { error } = await supabase.from('payee_departments')
        .insert(toAdd.map((d) => ({ payee_id: row.id, department_id: d })))
      if (error) throw error
    }
    if (toDel.length > 0) {
      const { error } = await supabase.from('payee_departments')
        .delete().eq('payee_id', row.id).in('department_id', toDel)
      if (error) throw error
    }
  }

  return (
    <CrudPage<Payee>
      title={label}
      description={
        isPreceptor
          ? 'อาจารย์จากแหล่งฝึกที่ได้รับเชิญสอนภาคปฏิบัติ'
          : 'ผู้ได้รับเชิญให้สอนที่ไม่ใช่อาจารย์ประจำของวิทยาลัย'
      }
      menuKey={menuKey}
      table="payees"
      select="id, payee_kind, prefix, first_name, last_name, position_title, organization, ward, phone, email, is_government_officer, has_bank_account, is_active, payee_departments(department_id)"
      orderBy="first_name"
      label={label}
      filters={{ payee_kind: kind }}
      defaults={{ payee_kind: kind }}
      afterSave={syncDepartments}
      loadingExtra={lookups.isLoading}
      searchFields={(r) => `${r.prefix ?? ''}${r.first_name} ${r.last_name} ${r.organization ?? ''} ${r.phone ?? ''}`}
      columns={[
        { key: 'name', header: 'คำนำหน้า ชื่อ-สกุล', render: (r) => fullName(r.prefix, r.first_name, r.last_name) },
        { key: 'pos', header: 'ตำแหน่ง', hideOnMobile: true, render: (r) => r.position_title ?? '-' },
        { key: 'org', header: 'หน่วยงาน', hideOnMobile: true, render: (r) => r.organization ?? '-' },
        ...(isPreceptor
          ? [{ key: 'ward', header: 'Ward', hideOnMobile: true, render: (r: Payee) => r.ward ?? '-' }]
          : []),
        { key: 'phone', header: 'โทรศัพท์', hideOnMobile: true, render: (r) => r.phone ?? '-' },
        {
          key: 'gov', header: 'สถานะ', hideOnMobile: true,
          render: (r) => r.is_government_officer === null
            ? <span className="text-amber-600">ยังไม่ระบุ</span>
            : r.is_government_officer
              ? 'ข้าราชการ/ลูกจ้างประจำ'
              : 'ไม่ใช่ข้าราชการ',
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
        { name: 'prefix', label: 'คำนำหน้า', type: 'text', placeholder: 'นาง / นาย / นางสาว' },
        { name: 'first_name', label: 'ชื่อ', type: 'text', required: true },
        { name: 'last_name', label: 'นามสกุล', type: 'text', required: true },
        {
          name: 'position_title', label: 'ตำแหน่ง', type: 'text',
          help: 'ข้อความนี้จะถูกพิมพ์ลงช่อง "ตำแหน่งผู้ทำการสอน" ในแบบ FM2.2-03',
        },
        { name: 'organization', label: 'หน่วยงาน', type: 'text' },
        ...(isPreceptor
          ? [{ name: 'ward', label: 'Ward (ในโรงพยาบาล)', type: 'text' as const }]
          : []),
        {
          name: 'phone', label: 'เบอร์โทรศัพท์', type: 'text',
          validate: (v) => (v && !/^[0-9\-+ ]{6,20}$/.test(String(v)) ? 'รูปแบบเบอร์โทรไม่ถูกต้อง' : null),
        },
        {
          name: 'email', label: 'อีเมล', type: 'text',
          validate: (v) => (v && !/^\S+@\S+\.\S+$/.test(String(v)) ? 'รูปแบบอีเมลไม่ถูกต้อง' : null),
        },
        {
          name: 'department_ids', label: 'สาขาวิชาที่เชิญสอน', type: 'multiselect',
          required: true, options: deptOptions, wide: true,
          help: 'สำคัญ: เลขานุการจะเห็นรายชื่อนี้ได้เฉพาะสาขาที่ติ๊กไว้เท่านั้น ถ้าไม่ติ๊กเลยจะไม่มีใครนอกจากผู้ดูแลระบบเห็น',
        },
        {
          name: 'is_government_officer', label: 'เป็นข้าราชการหรือลูกจ้างประจำของทางราชการ/พนักงานรัฐวิสาหกิจ',
          type: 'checkbox', placeholder: 'ใช่ เป็นข้าราชการ/ลูกจ้างประจำ', wide: true,
          help: 'มีผลต่ออัตราค่าสอนทฤษฎีโดยตรง — ผู้ที่ "ไม่ใช่" ได้อัตรา 800 บาท/ชั่วโมง ผู้ที่ "ใช่" ได้ 400 บาท/ชั่วโมง และช่อง "ผู้ได้รับเชิญให้สอน" ในแบบฟอร์มจะถูกติ๊กเมื่อไม่ใช่ข้าราชการ',
        },
        { name: 'is_active', label: 'สถานะ', type: 'checkbox', placeholder: 'เปิดใช้งาน' },
      ]}
      toForm={(r) => ({
        prefix: r?.prefix ?? '', first_name: r?.first_name ?? '', last_name: r?.last_name ?? '',
        position_title: r?.position_title ?? '', organization: r?.organization ?? '',
        ward: r?.ward ?? '', phone: r?.phone ?? '', email: r?.email ?? '',
        department_ids: r?.payee_departments?.map((d) => d.department_id) ?? [],
        is_government_officer: r?.is_government_officer ?? false,
        is_active: r?.is_active ?? true,
      })}
      fromForm={(v) => {
        // department_ids ไม่ใช่คอลัมน์ของ payees — ซิงก์แยกใน afterSave
        const { department_ids: _ignored, ...rest } = v
        void _ignored
        return rest
      }}
      renderExtra={(row) => (
        <BankAccountField
          ownerType="payee"
          ownerId={row?.id ?? null}
          ownerName={fullName(row?.prefix, row?.first_name, row?.last_name)}
          hasAccount={row?.has_bank_account ?? false}
          banks={banks}
        />
      )}
      exportColumns={[
        { key: 'name', header: 'คำนำหน้า ชื่อ-สกุล', value: (r) => fullName(r.prefix, r.first_name, r.last_name) },
        { key: 'pos', header: 'ตำแหน่ง', value: (r) => r.position_title ?? '' },
        { key: 'org', header: 'หน่วยงาน', value: (r) => r.organization ?? '' },
        { key: 'ward', header: 'Ward', value: (r) => r.ward ?? '' },
        { key: 'phone', header: 'โทรศัพท์', value: (r) => r.phone ?? '' },
        { key: 'email', header: 'อีเมล', value: (r) => r.email ?? '' },
        {
          key: 'gov', header: 'เป็นข้าราชการ',
          value: (r) => (r.is_government_officer === null ? '' : r.is_government_officer ? 'ใช่' : 'ไม่ใช่'),
        },
        // เลขบัญชีไม่อยู่ในไฟล์ส่งออกโดยเจตนา — ส่งออกได้เท่ากับหลุดได้
        { key: 'bank', header: 'มีเลขบัญชีแล้ว', value: (r) => (r.has_bank_account ? 'มี' : 'ยังไม่มี') },
      ]}
    />
  )
}
