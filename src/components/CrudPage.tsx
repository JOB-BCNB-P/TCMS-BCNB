import { useMemo, useState, type ReactNode } from 'react'
import { DataTable, type Column } from './DataTable'
import { FormModal, type FieldSpec } from './FormModal'
import { ConfirmDialog } from './ConfirmDialog'
import { CsvImport, type CsvColumn } from './CsvImport'
import { useCrud } from '@/hooks/useCrud'
import { usePermissions } from '@/hooks/usePermissions'
import { downloadCsv, toCsv } from '@/lib/csv'
import { toThaiError } from '@/lib/errors'

interface Props<T extends { id: string }> {
  title: string
  description?: string
  /** คีย์เมนูใน role_menu_permissions — ใช้ซ่อนปุ่มเท่านั้น สิทธิ์จริงอยู่ที่ RLS */
  menuKey: string
  table: string
  select: string
  orderBy?: string
  label: string
  /** ตัวกรองแบบ eq เช่น payee_kind — ใช้แยกอาจารย์พิเศษกับอาจารย์แหล่งฝึกที่อยู่ตารางเดียวกัน */
  filters?: Record<string, string>
  /** ค่าที่เติมให้อัตโนมัติตอนสร้างใหม่ */
  defaults?: Record<string, unknown>
  /** งานที่ต้องทำต่อหลังบันทึกสำเร็จ เช่น ซิงก์ตารางเชื่อมโยง */
  afterSave?: (row: { id: string }, values: Record<string, unknown>) => Promise<void>
  columns: Column<T>[]
  fields: FieldSpec[] | ((row: T | null) => FieldSpec[])
  /** แปลงแถวจากฐานข้อมูลเป็นค่าเริ่มต้นของฟอร์ม */
  toForm: (row: T | null) => Record<string, unknown>
  /** แปลงค่าจากฟอร์มเป็นแถวที่ส่งเข้าฐานข้อมูล */
  fromForm?: (values: Record<string, unknown>) => Record<string, unknown>
  csv?: { columns: CsvColumn[]; templateName: string }
  /** ส่วนเพิ่มท้ายฟอร์ม เช่น ช่องเลขบัญชี — ได้รับแถวที่กำลังแก้ (null ถ้าเพิ่มใหม่) */
  renderExtra?: (row: T | null) => ReactNode
  /** ค้นหาจากข้อความ */
  searchFields?: (row: T) => string
  /** คอลัมน์สำหรับส่งออก CSV */
  exportColumns?: { key: string; header: string; value: (row: T) => unknown }[]
  loadingExtra?: boolean
}

export function CrudPage<T extends { id: string }>({
  title, description, menuKey, table, select, orderBy, label,
  filters, defaults, afterSave,
  columns, fields, toForm, fromForm, csv, renderExtra, searchFields,
  exportColumns, loadingExtra,
}: Props<T>) {
  const { can } = usePermissions()
  const crud = useCrud<T>({ table, select, orderBy, label, filters })
  const [savingExtra, setSavingExtra] = useState(false)
  const [editing, setEditing] = useState<T | null | undefined>(undefined) // undefined = ปิด, null = เพิ่มใหม่
  const [deleting, setDeleting] = useState<T | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    const all = crud.list.data ?? []
    if (!search.trim() || !searchFields) return all
    const q = search.trim().toLowerCase()
    return all.filter((r) => searchFields(r).toLowerCase().includes(q))
  }, [crud.list.data, search, searchFields])

  const canCreate = can(menuKey, 'create')
  const canUpdate = can(menuKey, 'update')
  const canDelete = can(menuKey, 'delete')

  const actionColumn: Column<T> = {
    key: '__actions',
    header: 'จัดการ',
    align: 'right',
    render: (row) => (
      <div className="flex justify-end gap-1">
        {canUpdate && (
          <button type="button" onClick={() => setEditing(row)}
            className="rounded px-2 py-1 text-xs text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-slate-800">
            แก้ไข
          </button>
        )}
        {canDelete && (
          <button type="button" onClick={() => setDeleting(row)}
            className="rounded px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-slate-800">
            ลบ
          </button>
        )}
      </div>
    ),
  }

  const allColumns = canUpdate || canDelete ? [...columns, actionColumn] : columns
  const formFields = typeof fields === 'function' ? fields(editing ?? null) : fields

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
      </div>

      {crud.list.error && (
        <div role="alert" className="card border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
          <span aria-hidden="true">⚠ </span>{toThaiError(crud.list.error)}
        </div>
      )}

      {searchFields && (
        <div className="card p-3">
          <label htmlFor="search" className="sr-only">ค้นหา</label>
          <input id="search" className="field-input" placeholder="ค้นหา…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}

      <DataTable
        title={title}
        rows={rows}
        columns={allColumns}
        rowKey={(r) => r.id}
        loading={crud.list.isLoading || loadingExtra}
        emptyText={search ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีข้อมูล — กดปุ่มเพิ่มเพื่อเริ่มบันทึก'}
        toolbar={
          <>
            {exportColumns && (
              <button type="button" className="btn-secondary !min-h-[40px] !px-3" disabled={rows.length === 0}
                onClick={() => downloadCsv(
                  title,
                  toCsv(
                    rows.map((r) => Object.fromEntries(exportColumns.map((c) => [c.key, c.value(r)]))),
                    exportColumns.map((c) => ({ key: c.key, header: c.header })),
                  ),
                )}>
                ส่งออก CSV
              </button>
            )}
            {csv && canCreate && (
              <button type="button" className="btn-secondary !min-h-[40px] !px-3" onClick={() => setImportOpen(true)}>
                นำเข้า CSV
              </button>
            )}
            {canCreate && (
              <button type="button" className="btn-primary !min-h-[40px] !px-3" onClick={() => setEditing(null)}>
                + เพิ่ม{label}
              </button>
            )}
          </>
        }
      />

      <FormModal
        open={editing !== undefined}
        title={editing ? `แก้ไข${label}` : `เพิ่ม${label}`}
        fields={formFields}
        initial={toForm(editing ?? null)}
        saving={crud.create.isPending || crud.update.isPending || savingExtra}
        extra={renderExtra?.(editing ?? null)}
        onCancel={() => setEditing(undefined)}
        onSubmit={(values) => {
          const payload = { ...(defaults ?? {}), ...(fromForm ? fromForm(values) : values) }
          const done = async (row: { id: string }) => {
            if (afterSave) {
              setSavingExtra(true)
              try { await afterSave(row, values) } finally { setSavingExtra(false) }
              crud.invalidate()
            }
            setEditing(undefined)
          }
          if (editing) {
            crud.update.mutate({ ...payload, id: editing.id },
              { onSuccess: (r) => void done(r as { id: string }) })
          } else {
            crud.create.mutate(payload, { onSuccess: (r) => void done(r as { id: string }) })
          }
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        danger
        title={`ยืนยันการลบ${label}`}
        message={
          'เมื่อลบแล้วจะกู้คืนไม่ได้\n' +
          'ถ้ารายการนี้เคยถูกใช้ในเอกสารการเบิกจ่าย ระบบจะปฏิเสธการลบ — ให้ปิดการใช้งานแทน'
        }
        confirmLabel="ยืนยันลบ"
        busy={crud.remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) crud.remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
        }}
      />

      {csv && (
        <CsvImport
          open={importOpen}
          title={label}
          columns={csv.columns}
          templateName={csv.templateName}
          importing={crud.bulkInsert.isPending}
          onCancel={() => setImportOpen(false)}
          onImport={(r) => crud.bulkInsert.mutate(r, { onSuccess: () => setImportOpen(false) })}
        />
      )}
    </div>
  )
}
