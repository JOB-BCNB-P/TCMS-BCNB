import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { CrudPage } from '@/components/CrudPage'
import { syncLinkTable, useLookups } from '@/hooks/useCrud'
import { fullName } from '@/lib/format'

interface Offering {
  id: string
  course_id: string
  academic_year_id: string
  semester_id: string
  fiscal_year_id: string
  department_id: string
  student_year_level: number
  cohort_no: number | null
  room: string | null
  section: string
  faculty_text: string | null
  note: string | null
  courses: { code: string; name_th: string; course_kind: string } | null
  academic_years: { year_be: number } | null
  semesters: { name_th: string } | null
  fiscal_years: { year_be: number } | null
  course_coordinators: { coordinator_id: string }[]
  payee_course_offerings: { payee_id: string }[]
  course_clinical_sites: { clinical_site_id: string }[]
}

/**
 * รายวิชาที่เปิดสอน — หน่วยที่ตั้งวงเงินและทำใบเบิก
 *
 * รายวิชาเดียวกันเปิดสอนคนละปีการศึกษา ภาค ชั้นปี หรือหมู่ ถือเป็นคนละรายการ
 * และมีวงเงินแยกกัน หน้านี้จึงเป็นจุดที่ต้องกรอกก่อนจะไปตั้งวงเงินหรือทำเอกสารได้
 */
export function OfferingsPage() {
  const lookups = useLookups()

  const extra = useQuery({
    queryKey: ['offering-extra'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [coords, payees, sites] = await Promise.all([
        supabase.from('coordinators')
          .select('id, prefix, first_name, last_name, is_active').order('first_name'),
        supabase.from('payees')
          .select('id, payee_kind, prefix, first_name, last_name, is_active').order('first_name'),
        supabase.from('clinical_sites')
          .select('id, name_th, ward, is_active').order('name_th'),
      ])
      const bad = [coords, payees, sites].find((r) => r.error)
      if (bad?.error) throw bad.error
      return {
        coordinators: coords.data ?? [],
        payees: payees.data ?? [],
        sites: sites.data ?? [],
      }
    },
  })

  const courses = useQuery({
    queryKey: ['courses-for-offering'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('courses').select('id, code, name_th, course_kind, is_active')
        .order('code')
      if (error) throw error
      return data ?? []
    },
  })

  const ayOptions = (lookups.data?.academicYears ?? []).map((a) => ({
    value: a.id as string, label: `พ.ศ. ${a.year_be}`,
  }))
  const fyOptions = (lookups.data?.fiscalYears ?? []).map((f) => ({
    value: f.id as string,
    label: `พ.ศ. ${f.year_be}${f.is_closed ? ' (ปิดแล้ว)' : ''}`,
  }))
  const semOptions = (lookups.data?.semesters ?? []).map((s) => {
    const ay = (lookups.data?.academicYears ?? []).find((a) => a.id === s.academic_year_id)
    return { value: s.id as string, label: `${s.name_th} / ${ay ? `พ.ศ. ${ay.year_be}` : ''}` }
  })
  const courseOpts = (courses.data ?? [])
    .filter((c) => c.is_active)
    .map((c) => ({ value: c.id as string, label: `${c.code} ${c.name_th}` }))
  const coordOpts = (extra.data?.coordinators ?? [])
    .filter((c) => c.is_active)
    .map((c) => ({ value: c.id as string, label: fullName(c.prefix, c.first_name, c.last_name) }))
  const lecturerOpts = (extra.data?.payees ?? [])
    .filter((p) => p.is_active)
    .map((p) => ({
      value: p.id as string,
      label: `${fullName(p.prefix, p.first_name, p.last_name)}${p.payee_kind === 'preceptor' ? ' (แหล่งฝึก)' : ''}`,
    }))
  const siteOpts = (extra.data?.sites ?? [])
    .filter((s) => s.is_active)
    .map((s) => ({ value: s.id as string, label: `${s.name_th}${s.ward ? ` · ${s.ward}` : ''}` }))

  return (
    <CrudPage<Offering>
      title="รายวิชาที่เปิดสอน"
      description="รายวิชาเดียวกันคนละปี คนละภาค หรือคนละหมู่ ถือเป็นคนละรายการและมีวงเงินแยกกัน — ต้องสร้างที่นี่ก่อนจึงจะตั้งวงเงินและทำใบเบิกได้"
      menuKey="master.offering"
      table="course_offerings"
      select="id, course_id, academic_year_id, semester_id, fiscal_year_id, department_id, student_year_level, cohort_no, room, section, faculty_text, note, courses(code, name_th, course_kind), academic_years(year_be), semesters(name_th), fiscal_years(year_be), course_coordinators(coordinator_id), payee_course_offerings(payee_id), course_clinical_sites(clinical_site_id)"
      orderBy="created_at"
      label="รายวิชาที่เปิดสอน"
      loadingExtra={lookups.isLoading || courses.isLoading || extra.isLoading}
      searchFields={(r) => `${r.courses?.code ?? ''} ${r.courses?.name_th ?? ''} ${r.section}`}
      afterSave={async (row, values) => {
        await syncLinkTable({
          table: 'course_coordinators', parentColumn: 'course_offering_id', parentId: row.id,
          childColumn: 'coordinator_id', want: (values.coordinator_ids as string[]) ?? [],
        })
        await syncLinkTable({
          table: 'payee_course_offerings', parentColumn: 'course_offering_id', parentId: row.id,
          childColumn: 'payee_id', want: (values.payee_ids as string[]) ?? [],
        })
        await syncLinkTable({
          table: 'course_clinical_sites', parentColumn: 'course_offering_id', parentId: row.id,
          childColumn: 'clinical_site_id', want: (values.site_ids as string[]) ?? [],
        })
      }}
      columns={[
        {
          key: 'course', header: 'รายวิชา',
          render: (r) => (
            <div>
              <span className="font-medium">{r.courses?.code ?? '-'}</span>
              <span className="ml-1">{r.courses?.name_th ?? ''}</span>
              <span className="block text-xs text-slate-500">
                ชั้นปี {r.student_year_level} · หมู่ {r.section}
                {r.cohort_no ? ` · รุ่น ${r.cohort_no}` : ''}
                {r.room ? ` · ห้อง ${r.room}` : ''}
              </span>
            </div>
          ),
        },
        {
          key: 'term', header: 'ปี/ภาค', hideOnMobile: true,
          render: (r) => (
            <span>
              {r.academic_years ? `พ.ศ. ${r.academic_years.year_be}` : '-'}
              <span className="block text-xs text-slate-500">{r.semesters?.name_th ?? ''}</span>
            </span>
          ),
        },
        {
          key: 'fy', header: 'ปีงบประมาณ', hideOnMobile: true,
          render: (r) => (r.fiscal_years ? `พ.ศ. ${r.fiscal_years.year_be}` : '-'),
        },
        {
          key: 'links', header: 'ผู้เกี่ยวข้อง', align: 'center',
          render: (r) => (
            <span className="text-xs text-slate-600 dark:text-slate-300">
              ผู้ประสาน {r.course_coordinators?.length ?? 0} ·
              อาจารย์ {r.payee_course_offerings?.length ?? 0} ·
              แหล่งฝึก {r.course_clinical_sites?.length ?? 0}
            </span>
          ),
        },
      ]}
      fields={[
        {
          name: 'course_id', label: 'รายวิชา', type: 'select', required: true,
          options: courseOpts, wide: true,
          help: courseOpts.length === 0 ? 'ยังไม่มีรายวิชาที่เปิดใช้งาน — เพิ่มที่เมนูรายวิชาก่อน' : undefined,
        },
        { name: 'academic_year_id', label: 'ปีการศึกษา', type: 'select', required: true, options: ayOptions },
        {
          name: 'semester_id', label: 'ภาคการศึกษา', type: 'select', required: true, options: semOptions,
          help: 'ต้องเป็นภาคของปีการศึกษาที่เลือกไว้ มิฉะนั้นระบบจะปฏิเสธ',
        },
        {
          name: 'fiscal_year_id', label: 'ปีงบประมาณ', type: 'select', required: true, options: fyOptions,
          help: 'ปีงบเริ่ม 1 ตุลาคม — การสอนในภาคหนึ่งอาจข้ามปีงบ ให้ยึดตามที่งานการเงินใช้เบิก',
        },
        {
          name: 'student_year_level', label: 'ชั้นปีที่สอน', type: 'number', required: true,
          validate: (v) => (Number(v) < 1 || Number(v) > 4 ? 'ต้องอยู่ระหว่าง 1–4' : null),
        },
        { name: 'section', label: 'หมู่เรียน', type: 'text', required: true, placeholder: '1' },
        { name: 'cohort_no', label: 'รุ่นที่', type: 'number' },
        { name: 'room', label: 'ห้อง', type: 'text' },
        {
          name: 'faculty_text', label: 'คณะ (พิมพ์ลงแบบฟอร์ม)', type: 'text',
          help: 'ข้อความนี้จะไปอยู่ในช่อง "คณะ" ของใบหลักฐานการเบิกจ่าย เว้นว่างได้',
        },
        {
          name: 'coordinator_ids', label: 'ผู้ประสานงานรายวิชา', type: 'multiselect',
          options: coordOpts, wide: true,
          help: 'เลือกได้หลายคน — คนที่เลือกไว้จะปรากฏเป็นตัวเลือก "ผู้จัดทำ" ตอนสร้างใบเบิก',
        },
        {
          name: 'payee_ids', label: 'อาจารย์พิเศษ/อาจารย์แหล่งฝึก ประจำรายวิชา', type: 'multiselect',
          options: lecturerOpts, wide: true,
          help: 'รายชื่อที่เลือกไว้จะขึ้นเป็นตัวเลือกตอนกรอกรายการในใบเบิก',
        },
        {
          name: 'site_ids', label: 'แหล่งฝึกประจำรายวิชา', type: 'multiselect',
          options: siteOpts, wide: true,
          help: 'ใช้กับรายวิชาภาคปฏิบัติ',
        },
        { name: 'note', label: 'หมายเหตุ', type: 'textarea' },
      ]}
      toForm={(r) => ({
        course_id: r?.course_id ?? '',
        academic_year_id: r?.academic_year_id ?? '',
        semester_id: r?.semester_id ?? '',
        fiscal_year_id: r?.fiscal_year_id ?? '',
        student_year_level: r?.student_year_level ?? null,
        section: r?.section ?? '1',
        cohort_no: r?.cohort_no ?? null,
        room: r?.room ?? '',
        faculty_text: r?.faculty_text ?? '',
        note: r?.note ?? '',
        coordinator_ids: r?.course_coordinators?.map((c) => c.coordinator_id) ?? [],
        payee_ids: r?.payee_course_offerings?.map((p) => p.payee_id) ?? [],
        site_ids: r?.course_clinical_sites?.map((s) => s.clinical_site_id) ?? [],
      })}
      fromForm={(v) => {
        const {
          coordinator_ids: _a, payee_ids: _b, site_ids: _c, ...rest
        } = v
        void _a; void _b; void _c
        // department_id ถูกเติมจากรายวิชาโดย trigger ในฐานข้อมูล ไม่ส่งจากหน้าเว็บ
        return rest
      }}
      exportColumns={[
        { key: 'code', header: 'รหัสวิชา', value: (r) => r.courses?.code ?? '' },
        { key: 'name', header: 'ชื่อรายวิชา', value: (r) => r.courses?.name_th ?? '' },
        { key: 'ay', header: 'ปีการศึกษา', value: (r) => r.academic_years?.year_be ?? '' },
        { key: 'sem', header: 'ภาคการศึกษา', value: (r) => r.semesters?.name_th ?? '' },
        { key: 'fy', header: 'ปีงบประมาณ', value: (r) => r.fiscal_years?.year_be ?? '' },
        { key: 'year', header: 'ชั้นปี', value: (r) => r.student_year_level },
        { key: 'section', header: 'หมู่', value: (r) => r.section },
      ]}
    />
  )
}
