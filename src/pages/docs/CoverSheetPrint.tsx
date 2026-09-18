import { formatBaht, bahtText } from '@/lib/format'
import { formatDateBE, formatMonthBE } from '@/lib/thaiDate'

export interface CoverItem {
  line_no: number
  voucher_no: string | null
  teacher_name: string
  subject_text: string
  hours: number | null
  amount: number
  subtotal: number
  note: string | null
}

export interface CoverSheetDoc {
  sheet_no: string | null
  org_name: string
  teacher_type: 'regular' | 'special'
  study_level: 'bachelor' | 'below_bachelor'
  program_name: string
  student_year_level: number | null
  period_month: string
  total_amount: number
  requester_name: string | null
  requester_position: string | null
  request_date: string | null
  approver_name: string | null
  approver_position: string | null
  approve_date: string | null
}

const MIN_ROWS = 10

function Fill({ value, w = '8rem' }: { value?: string | number | null; w?: string }) {
  return (
    <span className="form-fill" style={{ minWidth: w }}>
      {value === null || value === undefined || value === '' ? ' ' : value}
    </span>
  )
}

/** ช่องวงกลมให้กา ○ / ● ตามต้นฉบับ */
function Choice({ on, label }: { on: boolean; label: string }) {
  return (
    <span style={{ marginRight: 16 }}>
      <span style={{ fontSize: 13 }}>{on ? '☑' : '☐'}</span> {label}
    </span>
  )
}

export function CoverSheetPrint({ s, items }: { s: CoverSheetDoc; items: CoverItem[] }) {
  const blanks = Math.max(0, MIN_ROWS - items.length)

  return (
    <div className="print-doc print-page" style={{ fontFamily: 'Sarabun, sans-serif', color: '#000' }}>
      <h1 style={{ textAlign: 'center', fontSize: 16, fontWeight: 700, margin: '0 0 2px' }}>
        หน้างบใบสำคัญค่าสอนพิเศษ
      </h1>
      <div style={{ textAlign: 'center', fontSize: 12, marginBottom: 8 }}>
        ประกอบฎีกาที่ <Fill value={s.sheet_no} w="7rem" />
      </div>

      <div style={{ fontSize: 12, lineHeight: 2 }}>
        ส่วนราชการ <Fill value={s.org_name} w="20rem" />
        <br />
        <Choice on={s.teacher_type === 'regular'} label="อาจารย์" />
        <Choice on={s.teacher_type === 'special'} label="อาจารย์พิเศษ" />
        {'   '}ระดับ{' '}
        <Choice on={s.study_level === 'bachelor'} label="ปริญญาตรี" />
        <Choice on={s.study_level === 'below_bachelor'} label="ต่ำกว่าปริญญาตรี" />
        <br />
        หลักสูตร <Fill value={s.program_name} w="14rem" />
        {'  '}ปีที่ <Fill value={s.student_year_level} w="3rem" />
        {'  '}ประจำเดือน <Fill value={formatMonthBE(s.period_month)} w="10rem" />
      </div>

      <table className="form-table" style={{ marginTop: 8 }}>
        <thead>
          <tr>
            <th style={{ width: '5%' }}>ลำดับที่</th>
            <th style={{ width: '13%' }}>ใบสำคัญ</th>
            <th style={{ width: '24%' }}>ชื่อผู้สอน</th>
            <th style={{ width: '22%' }}>วิชา</th>
            <th style={{ width: '8%' }}>หน่วยชั่วโมง</th>
            <th style={{ width: '12%' }}>จำนวนเงิน (บาท)</th>
            <th style={{ width: '12%' }}>รวมเงิน (บาท)</th>
            <th style={{ width: '4%' }}>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.line_no}>
              <td style={{ textAlign: 'center' }}>{i.line_no}</td>
              <td style={{ textAlign: 'center' }}>{i.voucher_no ?? ''}</td>
              <td>{i.teacher_name}</td>
              <td>{i.subject_text}</td>
              <td style={{ textAlign: 'center' }}>{i.hours ?? ''}</td>
              <td style={{ textAlign: 'right' }}>{formatBaht(i.amount)}</td>
              <td style={{ textAlign: 'right' }}>{formatBaht(i.subtotal)}</td>
              <td>{i.note ?? ''}</td>
            </tr>
          ))}
          {Array.from({ length: blanks }, (_, k) => (
            <tr key={`b-${k}`}>
              <td style={{ textAlign: 'center' }}>{items.length + k + 1}</td>
              <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
              <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
            </tr>
          ))}
          <tr>
            <td colSpan={6} style={{ textAlign: 'right', fontWeight: 600 }}>รวมทั้งสิ้น</td>
            <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatBaht(s.total_amount)}</td>
            <td>&nbsp;</td>
          </tr>
          <tr>
            <td colSpan={8} style={{ fontSize: 12 }}>
              (ตัวอักษร) <Fill value={bahtText(s.total_amount)} w="22rem" />
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24, fontSize: 12, lineHeight: 2 }}>
        <div style={{ textAlign: 'center' }}>
          <div>(ลงชื่อ) .............................................. ผู้เบิก</div>
          <div>( <Fill value={s.requester_name} w="10rem" /> )</div>
          <div>ตำแหน่ง <Fill value={s.requester_position} w="10rem" /></div>
          <div>วันที่ <Fill value={s.request_date ? formatDateBE(s.request_date) : null} w="8rem" /></div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div>อนุมัติ</div>
          <div>(ลงชื่อ) ..............................................</div>
          <div>( <Fill value={s.approver_name} w="10rem" /> )</div>
          <div>ตำแหน่ง <Fill value={s.approver_position} w="10rem" /></div>
          <div>วันที่ <Fill value={s.approve_date ? formatDateBE(s.approve_date) : null} w="8rem" /></div>
        </div>
      </div>
    </div>
  )
}
