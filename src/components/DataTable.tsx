import { useMemo, useState, type ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: string
  align?: 'left' | 'right' | 'center'
  render: (row: T) => ReactNode
  /** ซ่อนบนจอเล็กเพื่อไม่ให้ตารางล้น */
  hideOnMobile?: boolean
}

interface Props<T> {
  title: string
  description?: string
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  pageSize?: number
  loading?: boolean
  /** กำลังโหลดใหม่เบื้องหลัง — แสดงแถบบาง ไม่ล้างตารางทิ้ง */
  refreshing?: boolean
  emptyText?: string
  toolbar?: ReactNode
  /** คลาสเพิ่มรายแถว เช่น row-busy ตอนกำลังลบ หรือ row-flash ตอนเพิ่งบันทึก */
  rowClassName?: (row: T) => string | undefined
}

/**
 * ตารางแบ่งหน้า 10 แถว พร้อมปุ่ม ก่อนหน้า / ถัดไป / สุดท้าย ตามข้อกำหนด
 * รับข้อมูลทั้งชุดแล้วแบ่งหน้าฝั่งผู้ใช้ เหมาะกับชุดข้อมูลระดับร้อยแถว
 * ถ้าข้อมูลโตถึงระดับหมื่นแถว ให้เปลี่ยนไปใช้ .range() ของ Supabase แทน
 */
export function DataTable<T>({
  title, description, rows, columns, rowKey,
  pageSize = 10, loading, refreshing, emptyText = 'ไม่พบข้อมูล', toolbar,
  rowClassName,
}: Props<T>) {
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const slice = useMemo(
    () => rows.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [rows, safePage, pageSize],
  )

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
        {toolbar && <div className="no-print flex gap-2">{toolbar}</div>}
      </header>

      {/* โหลดใหม่เบื้องหลัง: บอกให้รู้ว่ากำลังทำงาน โดยไม่ล้างข้อมูลที่อ่านอยู่ทิ้ง */}
      {refreshing && !loading && (
        <div className="no-print progress-bar" role="status" aria-label="กำลังโหลดข้อมูลใหม่" />
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-full border-collapse text-sm">
          <caption className="sr-only">{title}</caption>
          <thead className="table-head">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={[
                    'whitespace-nowrap px-3 py-2.5 font-semibold',
                    c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                    c.hideOnMobile ? 'hidden md:table-cell' : '',
                  ].join(' ')}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {/* โครงร่างที่มีจำนวนคอลัมน์และความสูงเท่าแถวจริง
                เพื่อไม่ให้หน้ากระโดดตอนข้อมูลมาถึง */}
            {loading && Array.from({ length: 5 }, (_, i) => (
              <tr key={`sk-${i}`} aria-hidden="true">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={[
                      'px-3 py-2.5',
                      c.hideOnMobile ? 'hidden md:table-cell' : '',
                    ].join(' ')}
                  >
                    <div
                      className="skeleton h-4"
                      style={{ width: `${[85, 60, 70, 45, 55][i % 5]}%` }}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {loading && (
              <tr className="sr-only">
                <td colSpan={columns.length} aria-live="polite">กำลังโหลดข้อมูล…</td>
              </tr>
            )}
            {!loading && slice.length === 0 && (
              <tr className="anim-pop">
                <td colSpan={columns.length} className="px-3 py-10 text-center text-slate-500">
                  {emptyText}
                </td>
              </tr>
            )}
            {!loading &&
              slice.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={[
                    'transition-colors duration-150',
                    'hover:bg-brand-50/60 dark:hover:bg-slate-800/60',
                    rowClassName?.(row) ?? '',
                  ].join(' ')}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={[
                        'px-3 py-2.5 align-top text-slate-700 dark:text-slate-200',
                        c.align === 'right' ? 'text-right tabular-nums' : c.align === 'center' ? 'text-center' : '',
                        c.hideOnMobile ? 'hidden md:table-cell' : '',
                      ].join(' ')}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <nav
        aria-label={`การแบ่งหน้าของ${title}`}
        className="no-print flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 p-3 dark:border-slate-800"
      >
        <p className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
          หน้า {safePage + 1} จาก {pageCount} · ทั้งหมด {rows.length.toLocaleString('th-TH')} รายการ
        </p>
        <div className="flex gap-2">
          <button
            type="button" className="btn-secondary !min-h-[40px] !px-3"
            onClick={() => setPage(0)} disabled={safePage === 0}
          >
            หน้าแรก
          </button>
          <button
            type="button" className="btn-secondary !min-h-[40px] !px-3"
            onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}
          >
            ก่อนหน้า
          </button>
          <button
            type="button" className="btn-secondary !min-h-[40px] !px-3"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1}
          >
            ถัดไป
          </button>
          <button
            type="button" className="btn-secondary !min-h-[40px] !px-3"
            onClick={() => setPage(pageCount - 1)} disabled={safePage >= pageCount - 1}
          >
            สุดท้าย
          </button>
        </div>
      </nav>
    </section>
  )
}
