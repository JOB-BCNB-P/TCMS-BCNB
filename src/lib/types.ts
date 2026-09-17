export type RoleCode =
  | 'admin'
  | 'academic'
  | 'secretary'
  | 'finance'
  | 'instructor'
  | 'executive'

export const ROLE_LABEL: Record<RoleCode, string> = {
  admin: 'ผู้ดูแลระบบ/ผู้รับผิดชอบการเบิกจ่ายค่าสอน',
  academic: 'เจ้าหน้าที่งานวิชาการ',
  secretary: 'เลขานุการสาขาวิชา',
  finance: 'เจ้าหน้าที่งานการเงิน',
  instructor: 'อาจารย์',
  executive: 'ผู้บริหาร',
}

export type VoucherStatus =
  | 'draft'
  | 'submitted'
  | 'verified'
  | 'paid'
  | 'cancelled'

/**
 * ข้อกำหนด: ถ้ายังไม่เลือกสถานะ "จ่ายเงินแล้ว" ให้แสดงว่า "อยู่ระหว่างดำเนินการ"
 * สีต้องมีข้อความหรือไอคอนกำกับเสมอ ไม่ใช้สีเพียงอย่างเดียว
 */
export const STATUS_LABEL: Record<VoucherStatus, string> = {
  draft: 'อยู่ระหว่างดำเนินการ (ร่าง)',
  submitted: 'อยู่ระหว่างดำเนินการ (ส่งเอกสารแล้ว)',
  verified: 'อยู่ระหว่างดำเนินการ (ตรวจสอบแล้ว)',
  paid: 'จ่ายเงินแล้ว',
  cancelled: 'ยกเลิก',
}

export interface UserProfile {
  id: string
  email: string
  prefix: string | null
  first_name: string
  last_name: string
  position_title: string | null
  role_id: string
  is_active: boolean
}

export interface SessionUser extends UserProfile {
  role_code: RoleCode
  department_ids: string[]
}

export interface MenuPermission {
  menu_key: string
  can_view: boolean
  can_create: boolean
  can_update: boolean
  can_delete: boolean
}

export interface Department {
  id: string
  code: string
  name_th: string
  sort_order: number
}

export interface FiscalYear {
  id: string
  year_be: number
  start_date: string
  end_date: string
  is_closed: boolean
}

export interface AcademicYear {
  id: string
  year_be: number
}

export interface Semester {
  id: string
  academic_year_id: string
  code: 'first' | 'second' | 'summer'
  name_th: string
}

export interface BudgetUsageRow {
  course_offering_id: string
  department_id: string
  fiscal_year_id: string
  academic_year_id: string
  semester_id: string
  course_code: string
  course_name: string
  budget_category_id: string
  budget_category_name: string
  allocated_amount: number
  used_amount: number
  remaining_amount: number
}

export interface PaymentSummaryRow {
  voucher_id: string
  voucher_no: string | null
  status: VoucherStatus
  department_id: string
  fiscal_year_id: string
  academic_year_id: string
  semester_id: string
  course_code: string
  course_name: string
  student_year_level: number | null
  teaching_month: string | null
  fiscal_year_be: number
  payee_prefix: string | null
  payee_name: string | null
  payee_type: 'person' | 'site'
  expense_item: string
  budget_category_name: string
  hours: number | null
  amount: number
  payment_date: string | null
  payment_bank_name: string | null
}

export const EXPENSE_ITEM_LABEL: Record<string, string> = {
  theory: 'ค่าสอนทฤษฎี',
  lab: 'ค่าสอนทดลอง',
  practice: 'ค่าสอนภาคปฏิบัติ',
  site_compensation: 'ค่าตอบแทนแหล่งฝึก',
  supervision_travel: 'ค่าเดินทางไปนิเทศ',
  simulated_patient: 'ค่าตอบแทนผู้ป่วยเสมือน',
  external_clinical: 'ค่าตอบแทนบุคคลภายนอกสอนคลินิก',
}

export type FundSource = 'general_subsidy' | 'institutional_revenue'

/** "หมวดเงิน" ในเอกสารของวิทยาลัย = แหล่งเงิน ไม่ใช่ประเภทรายการ */
export const FUND_SOURCE_LABEL: Record<FundSource, string> = {
  general_subsidy: 'เงินอุดหนุนทั่วไป',
  institutional_revenue: 'เงินรายได้สถาบัน',
}

export type RateUnit = 'hour' | 'person_month' | 'person_group_month' | 'actual_cost'

export const RATE_UNIT_LABEL: Record<RateUnit, string> = {
  hour: 'บาท/ชั่วโมง',
  person_month: 'บาท/คน/เดือน',
  person_group_month: 'บาท/คน/กลุ่ม/เดือน',
  actual_cost: 'เบิกตามจ่ายจริง',
}
