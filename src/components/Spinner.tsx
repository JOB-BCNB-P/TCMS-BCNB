/**
 * วงกลมหมุนบอกว่ากำลังทำงาน
 *
 * ใช้ currentColor เพื่อให้กลืนกับสีข้อความของปุ่มที่ครอบอยู่
 * โดยไม่ต้องส่งสีเข้ามา และไม่ต้องมีสีเวอร์ชันโหมดมืดแยก
 *
 * aria-hidden เพราะสถานะ "กำลังทำงาน" สื่อด้วยข้อความบนปุ่มอยู่แล้ว
 * (เช่น "กำลังบันทึก…") ถ้าประกาศซ้ำ โปรแกรมอ่านหน้าจอจะพูดสองรอบ
 */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`spinner shrink-0 ${className}`}
      width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor" strokeWidth="3" strokeLinecap="round"
      />
    </svg>
  )
}
