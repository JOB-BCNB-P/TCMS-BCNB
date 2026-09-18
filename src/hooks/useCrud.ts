import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toThaiError } from '@/lib/errors'
import { useToast } from '@/components/Toast'

interface Options {
  /** ชื่อตารางใน schema public */
  table: string
  /** คอลัมน์ที่ต้องการ รวม join แบบ PostgREST ได้ */
  select: string
  /** คอลัมน์ที่ใช้เรียงลำดับ */
  orderBy?: string
  ascending?: boolean
  /** คำเรียกรายการนี้ในข้อความแจ้งผล เช่น "รายวิชา" */
  label: string
  /** ตัวกรองเพิ่มเติมแบบ eq */
  filters?: Record<string, string | null | undefined>
}

export function useCrud<T extends { id: string }>(opts: Options) {
  const qc = useQueryClient()
  const toast = useToast()
  const key = [opts.table, opts.select, opts.filters] as const

  const list = useQuery({
    queryKey: key,
    queryFn: async () => {
      let q = supabase.from(opts.table).select(opts.select)
      for (const [col, val] of Object.entries(opts.filters ?? {})) {
        if (val) q = q.eq(col, val)
      }
      if (opts.orderBy) q = q.order(opts.orderBy, { ascending: opts.ascending ?? true })
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as T[]
    },
  })

  /**
   * คีย์ของ query ที่ "ประกอบจาก" หลายตาราง จึงไม่ถูก invalidate ด้วยชื่อตาราง
   *
   * ['lookups'] ตั้ง staleTime ไว้ 5 นาที ถ้าไม่ล้างที่นี่ ผู้ใช้จะเพิ่มรายวิชาที่เปิดสอน
   * แล้วไปสร้างใบเบิกทันทีโดยไม่เห็นรายการที่เพิ่งเพิ่ม และหน้าจอจะบอกว่า "ยังไม่มี"
   */
  const DERIVED_KEYS = ['lookups', 'offering-extra', 'courses-for-offering']

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: [opts.table] })
    void qc.invalidateQueries({
      predicate: (q) => DERIVED_KEYS.includes(String(q.queryKey[0])),
    })
  }

  const create = useMutation({
    mutationFn: async (row: Record<string, unknown>) => {
      const { data, error } = await supabase.from(opts.table).insert(row).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => { toast.success(`บันทึก${opts.label}เรียบร้อย`); invalidate() },
    onError: (e) => toast.error(toThaiError(e)),
  })

  const update = useMutation({
    mutationFn: async ({ id, ...row }: Record<string, unknown> & { id: string }) => {
      const { data, error } = await supabase.from(opts.table).update(row).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => { toast.success(`แก้ไข${opts.label}เรียบร้อย`); invalidate() },
    onError: (e) => toast.error(toThaiError(e)),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(opts.table).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { toast.success(`ลบ${opts.label}เรียบร้อย`); invalidate() },
    onError: (e) => toast.error(toThaiError(e)),
  })

  /** นำเข้าหลายแถว แบ่งเป็นก้อนเพื่อไม่ให้ยิงคำขอเดียวใหญ่เกินไป */
  const bulkInsert = useMutation({
    mutationFn: async (rows: Record<string, unknown>[]) => {
      const CHUNK = 200
      let done = 0
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await supabase.from(opts.table).insert(rows.slice(i, i + CHUNK))
        if (error) {
          // บอกให้ชัดว่านำเข้าไปได้กี่แถวก่อนพัง ผู้ใช้จะได้รู้ว่าต้องเริ่มจากแถวไหน
          throw new Error(
            `${toThaiError(error)}\nนำเข้าสำเร็จ ${done} แถวก่อนหยุด — แก้ไฟล์แล้วนำเข้าเฉพาะแถวที่เหลือ`,
          )
        }
        done += Math.min(CHUNK, rows.length - i)
      }
      return done
    },
    onSuccess: (n) => { toast.success(`นำเข้า${opts.label} ${n} รายการเรียบร้อย`); invalidate() },
    onError: (e) => toast.error(toThaiError(e)),
  })

  return { list, create, update, remove, bulkInsert, invalidate }
}

/** ตารางอ้างอิงที่ใช้เป็นตัวเลือกใน dropdown หลายหน้า */
export function useLookups() {
  return useQuery({
    queryKey: ['lookups'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [dept, ay, sem, fy, bc, banks, offerings] = await Promise.all([
        supabase.from('departments').select('id, code, name_th').order('sort_order'),
        supabase.from('academic_years').select('id, year_be').order('year_be', { ascending: false }),
        supabase.from('semesters').select('id, academic_year_id, code, name_th'),
        supabase.from('fiscal_years').select('id, year_be, is_closed').order('year_be', { ascending: false }),
        supabase.from('budget_categories').select('id, code, name_th, fund_source, expense_item').order('sort_order'),
        supabase.from('banks').select('code, name_th').order('name_th'),
        supabase
          .from('course_offerings')
          .select('id, section, student_year_level, department_id, course_id, courses(code, name_th)')
          .order('created_at', { ascending: false }),
      ])
      const first = [dept, ay, sem, fy, bc, banks, offerings].find((r) => r.error)
      if (first?.error) throw first.error
      return {
        departments: dept.data ?? [],
        academicYears: ay.data ?? [],
        semesters: sem.data ?? [],
        fiscalYears: fy.data ?? [],
        budgetCategories: bc.data ?? [],
        banks: banks.data ?? [],
        offerings: (offerings.data ?? []) as unknown as {
          id: string; section: string; student_year_level: number
          department_id: string; course_id: string
          courses: { code: string; name_th: string }
        }[],
      }
    },
  })
}

/**
 * ซิงก์ตารางเชื่อมแบบหลายต่อหลาย (เช่น สาขาวิชาที่ร่วมดูแลรายวิชา)
 *
 * เทียบของเดิมกับของใหม่แล้วเพิ่ม/ลบเฉพาะส่วนต่าง ไม่ลบทิ้งทั้งหมดแล้วใส่ใหม่
 * เพราะการลบทิ้งจะทำให้ audit เต็มไปด้วยรายการลบ-เพิ่มที่ไม่ได้เปลี่ยนอะไรจริง
 * และถ้าคำสั่งที่สองพลาด ข้อมูลจะหายทั้งชุด
 */
export async function syncLinkTable(opts: {
  table: string
  parentColumn: string
  parentId: string
  childColumn: string
  /** ค่าที่ต้องการให้เหลืออยู่หลังซิงก์ */
  want: string[]
  /** ค่าที่ห้ามลบ เช่น สาขาเจ้าภาพ ซึ่ง trigger ในฐานข้อมูลจะใส่กลับมาอยู่ดี */
  keep?: string[]
}): Promise<void> {
  const { table, parentColumn, parentId, childColumn, keep = [] } = opts
  const want = [...new Set([...opts.want, ...keep])]

  const { data: current, error: readErr } = await supabase
    .from(table).select(childColumn).eq(parentColumn, parentId)
  if (readErr) throw readErr

  const have = (current ?? []).map((r) => (r as unknown as Record<string, unknown>)[childColumn] as string)
  const toAdd = want.filter((v) => !have.includes(v))
  const toDel = have.filter((v) => !want.includes(v))

  if (toAdd.length > 0) {
    const { error } = await supabase.from(table)
      .insert(toAdd.map((v) => ({ [parentColumn]: parentId, [childColumn]: v })))
    if (error) throw error
  }
  if (toDel.length > 0) {
    const { error } = await supabase.from(table)
      .delete().eq(parentColumn, parentId).in(childColumn, toDel)
    if (error) throw error
  }
}
