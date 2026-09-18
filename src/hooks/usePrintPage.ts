import { useEffect } from 'react'

/**
 * กำหนดขนาดและแนวกระดาษของหน้าที่กำลังเปิดอยู่
 *
 * กฎ @page เป็นกฎระดับเอกสาร ใส่ใน CSS รวมไม่ได้เพราะแต่ละแบบฟอร์มคนละแนวกระดาษ
 * จึงแทรก <style> เฉพาะตอนอยู่บนหน้านั้น แล้วถอดออกเมื่อออกจากหน้า
 */
export function usePrintPage(orientation: 'portrait' | 'landscape', marginMm = 10) {
  useEffect(() => {
    const el = document.createElement('style')
    el.setAttribute('data-print-page', orientation)
    el.textContent = `@media print { @page { size: A4 ${orientation}; margin: ${marginMm}mm; } }`
    document.head.appendChild(el)
    return () => { el.remove() }
  }, [orientation, marginMm])
}
