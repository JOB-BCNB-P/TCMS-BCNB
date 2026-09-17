interface Props {
  title: string
  note?: string
}

/** หน้าที่ยังไม่ได้พัฒนาในรอบนี้ — แสดงให้ชัดว่ายังไม่พร้อมใช้งาน ไม่ปล่อยหน้าว่าง */
export function PlaceholderPage({ title, note }: Props) {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">{title}</h1>
      <section className="card p-6">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          เมนูนี้ยังอยู่ระหว่างการพัฒนา (รอบที่ 2)
        </p>
        {note && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{note}</p>}
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          โครงสร้างฐานข้อมูลและสิทธิ์การเข้าถึงของเมนูนี้พร้อมใช้งานแล้ว
          เหลือเพียงส่วนติดต่อผู้ใช้
        </p>
      </section>
    </div>
  )
}
