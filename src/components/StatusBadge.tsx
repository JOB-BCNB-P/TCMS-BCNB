import { STATUS_LABEL, type VoucherStatus } from '@/lib/types'

/**
 * สถานะต้องมีข้อความและไอคอนกำกับเสมอ ห้ามสื่อด้วยสีอย่างเดียว
 * ตามข้อกำหนดการเข้าถึงของระบบ
 */
const STYLE: Record<VoucherStatus, { cls: string; icon: string }> = {
  draft:     { cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200', icon: '✎' },
  submitted: { cls: 'bg-brand-100 text-brand-900 dark:bg-brand-950 dark:text-brand-200', icon: '↗' },
  verified:  { cls: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200', icon: '✓' },
  paid:      { cls: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200', icon: '✔✔' },
  cancelled: { cls: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200', icon: '✕' },
}

export function StatusBadge({ status }: { status: VoucherStatus }) {
  const s = STYLE[status] ?? STYLE.draft
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${s.cls}`}>
      <span aria-hidden="true">{s.icon}</span>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}
