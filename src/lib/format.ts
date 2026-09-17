const baht = new Intl.NumberFormat('th-TH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** จำนวนเงินแสดงทศนิยม 2 ตำแหน่งเสมอ ตามแบบเอกสารราชการ */
export function formatBaht(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  return baht.format(value)
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

const UNITS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
const PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน']

function readInteger(nStr: string): string {
  if (nStr === '0') return 'ศูนย์'
  // เกินหลักล้าน ตัดเป็นกลุ่มละ 6 หลักแล้วต่อด้วยคำว่า "ล้าน"
  if (nStr.length > 7) {
    const head = nStr.slice(0, nStr.length - 6)
    const tail = nStr.slice(-6)
    return `${readInteger(head)}ล้าน${tail === '000000' ? '' : readInteger(String(Number(tail)))}`
  }
  let out = ''
  const len = nStr.length
  for (let i = 0; i < len; i++) {
    const d = Number(nStr[i])
    const place = len - i - 1
    if (d === 0) continue
    if (place === 0 && d === 1 && len > 1) out += 'เอ็ด'
    else if (place === 1 && d === 1) out += ''
    else if (place === 1 && d === 2) out += 'ยี่'
    else out += UNITS[d]
    out += PLACES[place]
  }
  return out
}

/**
 * แปลงจำนวนเงินเป็นตัวอักษรไทย สำหรับช่อง "(ตัวอักษร)..........บาท" ในแบบ FM2.2-03
 * ตัวเลขนี้ปรากฏบนเอกสารที่ส่งฎีกา จึงต้องตรวจสอบผลลัพธ์ก่อนใช้งานจริง
 */
export function bahtText(amount: number): string {
  if (!Number.isFinite(amount)) return ''
  const neg = amount < 0
  const rounded = Math.round(Math.abs(amount) * 100) / 100
  const intPart = Math.floor(rounded)
  const satang = Math.round((rounded - intPart) * 100)

  let text = `${readInteger(String(intPart))}บาท`
  text += satang === 0 ? 'ถ้วน' : `${readInteger(String(satang))}สตางค์`
  return neg ? `ลบ${text}` : text
}

export const fullName = (
  prefix: string | null | undefined,
  first: string | null | undefined,
  last: string | null | undefined,
) => [prefix, first, last].filter(Boolean).join(' ').trim() || '-'
