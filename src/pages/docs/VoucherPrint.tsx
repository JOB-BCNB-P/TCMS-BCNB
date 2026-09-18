import { formatBaht, bahtText, fullName } from '@/lib/format'
import { formatDateBE, formatMonthBE } from '@/lib/thaiDate'
import { EXPENSE_ITEM_LABEL } from '@/lib/types'

export interface PrintLine {
  line_no: number
  teaching_month: string | null
  student_year_level: number | null
  payee: { prefix: string | null; first_name: string; last_name: string; position_title: string | null } | null
  site: { name_th: string; ward: string | null } | null
  budget_category_name: string
  expense_item: string
  teaching_level: 'bachelor' | 'graduate'
  is_invited_external: boolean
  hours: number | null
  amount: number
  receipt_date: string | null
  note: string | null
}

export interface PrintVoucher {
  voucher_no: string | null
  org_name: string
  faculty_text: string | null
  semester_text: string | null
  year_be: number | null
  subject_text: string | null
  total_amount: number
  amount_in_words: string | null
  preparer_name: string | null
  preparer_position: string | null
  preparer_date: string | null
  payer_name: string | null
  payer_position: string | null
  payer_date: string | null
  certifier_name: string | null
  certifier_position: string | null
  certifier_date: string | null
  approver_name: string | null
  approver_position: string | null
  approver_date: string | null
}

const MIN_ROWS = 8

/**
 * ช่อง (12) หมายเหตุ
 *
 * แบบฟอร์มไม่มีคอลัมน์สำหรับประจำเดือน ชั้นปี หรือวัน-เวลาที่สอน
 * ข้อมูลเหล่านี้จึงรวมมาลงช่องหมายเหตุตามที่วิทยาลัยใช้จริง
 */
function noteText(l: PrintLine): string {
  const parts: string[] = []
  if (l.teaching_month) parts.push(`ประจำเดือน ${formatMonthBE(l.teaching_month)}`)
  if (l.student_year_level) parts.push(`ชั้นปี ${l.student_year_level}`)
  if (l.note) parts.push(l.note)
  return parts.join(' · ')
}

function Fill({ value, w = '8rem' }: { value?: string | number | null; w?: string }) {
  return (
    <span className="form-fill" style={{ minWidth: w }}>
      {value === null || value === undefined || value === '' ? ' ' : value}
    </span>
  )
}

function SignBlock({
  caption, name, position, date,
}: { caption: string; name: string | null; position: string | null; date: string | null }) {
  return (
    <div style={{ textAlign: 'center', fontSize: 12, lineHeight: 1.9 }}>
      <div>(ลงชื่อ) ..............................................</div>
      <div>( <Fill value={name} w="9rem" /> )</div>
      <div>ตำแหน่ง <Fill value={position} w="9rem" /></div>
      <div>วันที่ <Fill value={date ? formatDateBE(date) : null} w="7rem" /></div>
      <div style={{ marginTop: 2 }}>{caption}</div>
    </div>
  )
}

/** ชื่อผู้รับเงินในช่อง (4): บุคคล หรือ แหล่งฝึก ตามที่แม็ปไว้ใน docs/FORM-MAPPING.md §4 */
function payeeName(l: PrintLine): string {
  if (l.payee) return fullName(l.payee.prefix, l.payee.first_name, l.payee.last_name)
  if (l.site) return `${l.site.name_th}${l.site.ward ? ` (${l.site.ward})` : ''}`
  return ''
}

function payeePosition(l: PrintLine): string {
  if (l.payee) return l.payee.position_title ?? ''
  return EXPENSE_ITEM_LABEL[l.expense_item] ?? l.budget_category_name
}

export function VoucherPrint({ v, lines }: { v: PrintVoucher; lines: PrintLine[] }) {
  const blanks = Math.max(0, MIN_ROWS - lines.length)

  return (
    <div className="print-doc print-page" style={{ fontFamily: 'Sarabun, sans-serif', color: '#000' }}>
      <h1 style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, margin: '2px 0' }}>
        หลักฐานการเบิกจ่ายเงินค่าสอนพิเศษและค่าสอนเกินภาระงานสอนในสถาบันอุดมศึกษา
      </h1>
      <div style={{ textAlign: 'center', fontSize: 12, marginBottom: 6 }}>
        {v.voucher_no ? `เลขที่ใบสำคัญ ${v.voucher_no}` : ''}
      </div>

      <div style={{ fontSize: 12, lineHeight: 2 }}>
        ส่วนราชการ <Fill value={v.org_name} w="18rem" />
        {'  '}คณะ <Fill value={v.faculty_text} w="12rem" />
        <br />
        ภาคการศึกษา <Fill value={v.semester_text} w="8rem" />
        {'  '}พ.ศ. <Fill value={v.year_be} w="4rem" />
        {'  '}วิชา <Fill value={v.subject_text} w="22rem" />
      </div>

      <table className="form-table" style={{ marginTop: 6 }}>
        <thead>
          <tr>
            <th rowSpan={2} style={{ width: '4%' }}>ลำดับที่</th>
            <th rowSpan={2} style={{ width: '15%' }}>ชื่อ – นามสกุล</th>
            <th rowSpan={2} style={{ width: '12%' }}>ตำแหน่งผู้ทำการสอน</th>
            <th rowSpan={2} style={{ width: '7%' }}>ผู้ได้รับเชิญให้สอน</th>
            <th colSpan={2} style={{ width: '12%' }}>ระดับการสอน</th>
            <th rowSpan={2} style={{ width: '9%' }}>
              จำนวนหน่วยชั่วโมงที่ทำการสอนพิเศษและสอนเกินภาระงานสอน
            </th>
            <th rowSpan={2} style={{ width: '10%' }}>จำนวนเงิน</th>
            <th rowSpan={2} style={{ width: '11%' }}>ลายมือชื่อผู้รับเงิน</th>
            <th rowSpan={2} style={{ width: '8%' }}>วัน เดือน ปี ที่รับเงิน</th>
            <th rowSpan={2} style={{ width: '14%' }}>หมายเหตุ</th>
          </tr>
          <tr>
            <th style={{ width: '6%' }}>ปริญญาตรี</th>
            <th style={{ width: '6%' }}>บัณฑิตศึกษา</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.line_no}>
              <td style={{ textAlign: 'center' }}>{l.line_no}</td>
              <td>{payeeName(l)}</td>
              <td>{payeePosition(l)}</td>
              <td style={{ textAlign: 'center' }}>{l.is_invited_external ? '✓' : ''}</td>
              <td style={{ textAlign: 'center' }}>{l.teaching_level === 'bachelor' ? '✓' : ''}</td>
              <td style={{ textAlign: 'center' }}>{l.teaching_level === 'graduate' ? '✓' : ''}</td>
              <td style={{ textAlign: 'center' }}>{l.hours ?? ''}</td>
              <td style={{ textAlign: 'right' }}>{formatBaht(l.amount)}</td>
              <td>&nbsp;</td>
              <td style={{ textAlign: 'center' }}>{l.receipt_date ? formatDateBE(l.receipt_date) : ''}</td>
              <td>{noteText(l)}</td>
            </tr>
          ))}
          {Array.from({ length: blanks }, (_, i) => (
            <tr key={`blank-${i}`}>
              <td style={{ textAlign: 'center' }}>{lines.length + i + 1}</td>
              <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
              <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
            </tr>
          ))}
          <tr>
            <td colSpan={7} style={{ textAlign: 'right', fontWeight: 600 }}>
              รวมจำนวนเงินทั้งสิ้น
            </td>
            <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatBaht(v.total_amount)}</td>
            <td colSpan={3}>&nbsp;</td>
          </tr>
          <tr>
            <td colSpan={11} style={{ fontSize: 12 }}>
              (ตัวอักษร) <Fill value={v.amount_in_words ?? bahtText(v.total_amount)} w="24rem" />
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 14 }}>
        <SignBlock caption="ผู้จัดทำ" name={v.preparer_name} position={v.preparer_position} date={v.preparer_date} />
        <SignBlock caption="ผู้จ่ายเงิน" name={v.payer_name} position={v.payer_position} date={v.payer_date} />
        <SignBlock caption="ผู้รับรอง" name={v.certifier_name} position={v.certifier_position} date={v.certifier_date} />
        <SignBlock caption="ผู้อนุมัติ" name={v.approver_name} position={v.approver_position} date={v.approver_date} />
      </div>
    </div>
  )
}
