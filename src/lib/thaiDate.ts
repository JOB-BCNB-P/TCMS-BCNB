/**
 * การจัดการวันที่ของระบบ
 *
 * กฎเหล็ก: ฐานข้อมูลเก็บ ค.ศ. เสมอ (ชนิด date และ timestamptz)
 * การแปลงเป็น พ.ศ. เกิดขึ้นที่ชั้นแสดงผลเท่านั้น
 * ห้ามส่งปี พ.ศ. กลับเข้าคอลัมน์ชนิดวันที่ มิฉะนั้นการคำนวณช่วงเวลาจะผิดทั้งระบบ
 */

export const BE_OFFSET = 543
export const TZ = 'Asia/Bangkok'

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]
const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

/** แปลงคอลัมน์ชนิด date ("2026-09-17") เป็นส่วนประกอบ โดยไม่ผ่าน timezone */
function parseDateOnly(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}

/** "2026-09-17" → "17 ก.ย. 2569" */
export function formatDateBE(iso: string | null | undefined, long = false): string {
  if (!iso) return '-'
  const p = parseDateOnly(iso)
  if (!p) return '-'
  const months = long ? THAI_MONTHS : THAI_MONTHS_SHORT
  return `${p.d} ${months[p.m - 1]} ${p.y + BE_OFFSET}`
}

/** "2026-09-01" → "กันยายน 2569" (ใช้กับช่อง "ประจำเดือน") */
export function formatMonthBE(iso: string | null | undefined): string {
  if (!iso) return '-'
  const p = parseDateOnly(iso)
  if (!p) return '-'
  return `${THAI_MONTHS[p.m - 1]} ${p.y + BE_OFFSET}`
}

/** เวลาประทับเหตุการณ์ (timestamptz) → แสดงตามเวลาไทยเสมอ */
export function formatTimestampBE(iso: string | null | undefined): string {
  if (!iso) return '-'
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return '-'
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(dt)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const y = Number(get('year')) + BE_OFFSET
  const mth = THAI_MONTHS_SHORT[Number(get('month')) - 1]
  return `${Number(get('day'))} ${mth} ${y} ${get('hour')}:${get('minute')} น.`
}

/** วันที่ปัจจุบันตามเวลาไทย ในรูปแบบ "YYYY-MM-DD" (ค.ศ.) สำหรับส่งเข้าฐานข้อมูล */
export function todayBangkok(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

/**
 * ปีงบประมาณไทยเริ่ม 1 ตุลาคม
 * ดังนั้นเดือนตุลาคมเป็นต้นไป นับเป็นปีงบประมาณถัดไป
 * ต้องให้ผลตรงกับฟังก์ชัน public.fiscal_year_be() ในฐานข้อมูล
 */
export function fiscalYearBE(iso: string): number {
  const p = parseDateOnly(iso)
  if (!p) return NaN
  return p.y + BE_OFFSET + (p.m >= 10 ? 1 : 0)
}

/** ช่วงวันที่ของปีงบประมาณ พ.ศ. ที่ระบุ (คืนเป็น ค.ศ. สำหรับ query) */
export function fiscalYearRange(yearBE: number): { start: string; end: string } {
  const endAD = yearBE - BE_OFFSET
  return { start: `${endAD - 1}-10-01`, end: `${endAD}-09-30` }
}

export const thaiMonthName = (m: number) => THAI_MONTHS[m - 1] ?? ''
export const thaiMonthShort = (m: number) => THAI_MONTHS_SHORT[m - 1] ?? ''
