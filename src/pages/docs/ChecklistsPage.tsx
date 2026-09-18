import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { usePrintPage } from '@/hooks/usePrintPage'
import { FormModal } from '@/components/FormModal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/components/Toast'
import { toThaiError } from '@/lib/errors'
import { formatBaht } from '@/lib/format'
import { formatDateBE } from '@/lib/thaiDate'
import { STATUS_LABEL, type VoucherStatus } from '@/lib/types'

interface Item { key: string; name_th: string; sort_order: number; is_active: boolean }
interface VoucherLite {
  id: string
  voucher_no: string | null
  subject_text: string | null
  semester_text: string | null
  doc_date: string
  total_amount: number
  status: VoucherStatus
  departments: { name_th: string } | null
}

/**
 * ใบเช็คลิสต์การเบิกจ่าย
 *
 * สองส่วนในหน้าเดียว: พิมพ์ใบเช็คลิสต์แนบเอกสารของใบสำคัญที่เลือก
 * และจัดการรายการเช็คลิสต์ต้นแบบ (เฉพาะผู้ดูแลระบบ)
 */
export function ChecklistsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const { user } = useAuth()
  const isAdmin = user?.role_code === 'admin'
  usePrintPage('portrait')

  const [voucherId, setVoucherId] = useState('')
  const [editing, setEditing] = useState<Item | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<Item | null>(null)

  const itemsQ = useQuery({
    queryKey: ['checklist_items'],
    queryFn: async () => {
      const { data, error } = await supabase.from('checklist_items')
        .select('key, name_th, sort_order, is_active').order('sort_order')
      if (error) throw error
      return (data ?? []) as Item[]
    },
  })

  const vouchersQ = useQuery({
    queryKey: ['checklist-vouchers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('payment_vouchers')
        .select('id, voucher_no, subject_text, semester_text, doc_date, total_amount, status, departments(name_th)')
        .order('created_at', { ascending: false }).limit(200)
      if (error) throw error
      return (data ?? []) as unknown as VoucherLite[]
    },
  })

  // คีย์ต้องไม่ใช่ ['voucher-checklist', id] เพราะหน้าจัดการใบเบิกใช้คีย์นั้น
  // กับข้อมูลรูปอื่น (array) ถ้าใช้คีย์เดียวกัน หน้าที่ mount ทีหลังจะได้รูปข้อมูลผิด
  const marksQ = useQuery({
    enabled: !!voucherId,
    queryKey: ['voucher-checklist-marks', voucherId],
    queryFn: async () => {
      const { data, error } = await supabase.from('voucher_checklists')
        .select('item_key, is_checked').eq('voucher_id', voucherId)
      if (error) throw error
      return new Map((data ?? []).map((r) => [r.item_key as string, r.is_checked as boolean]))
    },
  })

  const saveItem = useMutation({
    mutationFn: async (v: Record<string, unknown>) => {
      if (editing) {
        const { error } = await supabase.from('checklist_items')
          .update({ name_th: v.name_th, sort_order: v.sort_order, is_active: v.is_active })
          .eq('key', editing.key)
        if (error) throw error
      } else {
        const { error } = await supabase.from('checklist_items').insert(v)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success('บันทึกรายการเช็คลิสต์เรียบร้อย')
      void qc.invalidateQueries({ queryKey: ['checklist_items'] })
      setEditing(undefined)
    },
    onError: (e) => toast.error(toThaiError(e)),
  })

  const removeItem = useMutation({
    mutationFn: async (key: string) => {
      const { error } = await supabase.from('checklist_items').delete().eq('key', key)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('ลบรายการเรียบร้อย')
      void qc.invalidateQueries({ queryKey: ['checklist_items'] })
      setDeleting(null)
    },
    onError: (e) => toast.error(toThaiError(e)),
  })

  const items = itemsQ.data ?? []
  const activeItems = items.filter((i) => i.is_active)
  const v = (vouchersQ.data ?? []).find((x) => x.id === voucherId)

  return (
    <div className="space-y-4">
      <div className="no-print">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">
          ใบเช็คลิสต์การเบิกจ่าย
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          พิมพ์แนบไปกับเอกสารการเบิกจ่าย — สถานะการติ๊กดึงจากใบสำคัญที่เลือก
        </p>
      </div>

      <div className="no-print card p-4">
        <label htmlFor="cl-v" className="field-label">เลือกใบสำคัญ</label>
        <select id="cl-v" className="field-input" value={voucherId}
          onChange={(e) => setVoucherId(e.target.value)}>
          <option value="">— เลือกใบสำคัญ —</option>
          {(vouchersQ.data ?? []).map((x) => (
            <option key={x.id} value={x.id}>
              {(x.voucher_no ?? '(ยังไม่มีเลขที่)')} · {x.subject_text ?? '-'} · {STATUS_LABEL[x.status]}
            </option>
          ))}
        </select>
        {v && (
          <button type="button" className="btn-secondary mt-3 !min-h-[40px] !px-3"
            onClick={() => window.print()}>
            พิมพ์ใบเช็คลิสต์
          </button>
        )}
      </div>

      {v && (
        <div className="card p-4 print-doc">
          <h2 className="text-center text-base font-semibold">
            ใบเช็คลิสต์เอกสารประกอบการเบิกจ่ายเงินค่าสอนพิเศษ
          </h2>
          <dl className="mx-auto mt-3 grid max-w-2xl gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div><dt className="inline text-slate-500">เลขที่ใบสำคัญ: </dt><dd className="inline">{v.voucher_no ?? '-'}</dd></div>
            <div><dt className="inline text-slate-500">ลงวันที่: </dt><dd className="inline">{formatDateBE(v.doc_date)}</dd></div>
            <div><dt className="inline text-slate-500">วิชา: </dt><dd className="inline">{v.subject_text ?? '-'}</dd></div>
            <div><dt className="inline text-slate-500">ภาคการศึกษา: </dt><dd className="inline">{v.semester_text ?? '-'}</dd></div>
            <div><dt className="inline text-slate-500">สาขาวิชา: </dt><dd className="inline">{v.departments?.name_th ?? '-'}</dd></div>
            <div><dt className="inline text-slate-500">จำนวนเงิน: </dt><dd className="inline">{formatBaht(v.total_amount)} บาท</dd></div>
          </dl>

          <table className="form-table mx-auto mt-4 max-w-2xl">
            <thead>
              <tr>
                <th style={{ width: '8%' }}>ลำดับ</th>
                <th>รายการเอกสารที่ต้องแนบ</th>
                <th style={{ width: '12%' }}>แนบแล้ว</th>
              </tr>
            </thead>
            <tbody>
              {activeItems.map((it, idx) => (
                <tr key={it.key}>
                  <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                  <td>{it.name_th}</td>
                  <td style={{ textAlign: 'center' }}>
                    {marksQ.data?.get(it.key) ? '☑' : '☐'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mx-auto mt-8 max-w-2xl text-center text-sm">
            <p>(ลงชื่อ) .............................................. ผู้ตรวจสอบเอกสาร</p>
            <p className="mt-1">วันที่ ...................................................</p>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="no-print card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                รายการเช็คลิสต์ต้นแบบ
              </h2>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                ใบเบิกที่สร้างใหม่จะได้รายการที่เปิดใช้งานทั้งหมด และต้องติ๊กครบจึงจะส่งเอกสารได้
                — การแก้ที่นี่ไม่กระทบใบเบิกที่สร้างไปแล้ว
              </p>
            </div>
            <button type="button" className="btn-primary !min-h-[36px] !px-3 !text-xs"
              onClick={() => setEditing(null)}>
              + เพิ่มรายการ
            </button>
          </div>

          <ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
            {items.map((it) => (
              <li key={it.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <span className={it.is_active ? '' : 'text-slate-400 line-through'}>{it.name_th}</span>
                  <span className="block text-xs text-slate-500">
                    รหัส {it.key} · ลำดับ {it.sort_order}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => setEditing(it)}
                    className="btn-link-brand">
                    แก้ไข
                  </button>
                  <button type="button" onClick={() => setDeleting(it)}
                    className="btn-link-danger">
                    ลบ
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <FormModal
        open={editing !== undefined}
        title={editing ? 'แก้ไขรายการเช็คลิสต์' : 'เพิ่มรายการเช็คลิสต์'}
        saving={saveItem.isPending}
        onCancel={() => setEditing(undefined)}
        fields={[
          ...(editing ? [] : [{
            name: 'key', label: 'รหัสรายการ (ภาษาอังกฤษ)', type: 'text' as const, required: true,
            placeholder: 'invitation_letter',
            help: 'ใช้อ้างอิงในฐานข้อมูล ตั้งแล้วเปลี่ยนไม่ได้',
            validate: (val: unknown) => (/^[a-z0-9_]+$/.test(String(val ?? ''))
              ? null : 'ใช้ได้เฉพาะ a-z 0-9 และ _'),
          }]),
          { name: 'name_th', label: 'ชื่อรายการ', type: 'text', required: true, wide: true },
          { name: 'sort_order', label: 'ลำดับการแสดง', type: 'number', required: true },
          { name: 'is_active', label: 'สถานะ', type: 'checkbox', placeholder: 'เปิดใช้งาน' },
        ]}
        initial={{
          key: '', name_th: editing?.name_th ?? '',
          sort_order: editing?.sort_order ?? items.length + 1,
          is_active: editing?.is_active ?? true,
        }}
        onSubmit={(vals) => saveItem.mutate(vals)}
      />

      <ConfirmDialog
        open={!!deleting}
        danger
        title="ยืนยันการลบรายการเช็คลิสต์"
        message={'ถ้ารายการนี้เคยถูกใช้ในใบเบิกใด ฐานข้อมูลจะปฏิเสธการลบ — ให้ปิดการใช้งานแทน'}
        confirmLabel="ยืนยันลบ"
        busy={removeItem.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => { if (deleting) removeItem.mutate(deleting.key) }}
      />
    </div>
  )
}
