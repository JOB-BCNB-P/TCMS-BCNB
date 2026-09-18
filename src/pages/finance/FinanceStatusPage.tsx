import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { useLookups } from '@/hooks/useCrud'
import { DataTable } from '@/components/DataTable'
import { FormModal } from '@/components/FormModal'
import { StatusBadge } from '@/components/StatusBadge'
import { BankAccountField } from '@/components/BankAccountField'
import { useToast } from '@/components/Toast'
import { toThaiError } from '@/lib/errors'
import { formatBaht, fullName } from '@/lib/format'
import { formatDateBE, todayBangkok } from '@/lib/thaiDate'
import type { VoucherStatus } from '@/lib/types'

interface Row {
  id: string
  voucher_no: string | null
  subject_text: string | null
  total_amount: number
  status: VoucherStatus
  doc_date: string
  payment_date: string | null
  created_by: string | null
  submitted_by: string | null
  departments: { name_th: string } | null
  voucher_lines: {
    payee_id: string | null
    clinical_site_id: string | null
    payees: { prefix: string | null; first_name: string; last_name: string; has_bank_account: boolean } | null
    clinical_sites: { name_th: string; has_bank_account: boolean } | null
  }[]
}

/**
 * หน้างานการเงิน
 *
 * รวมเอกสารที่รอมือฝั่งการเงินไว้ที่เดียว และเปิดเลขบัญชีผู้รับเงินได้จากที่นี่
 * โดยยังผ่าน RPC ที่บันทึก audit เหมือนเดิม — ไม่มีทางลัดใด ๆ ให้เลขบัญชี
 */
export function FinanceStatusPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const { user } = useAuth()
  const lookups = useLookups()
  const [tab, setTab] = useState<'submitted' | 'verified' | 'paid'>('submitted')
  const [paying, setPaying] = useState<Row | null>(null)
  const [openBank, setOpenBank] = useState<string | null>(null)

  const canAct = user?.role_code === 'finance' || user?.role_code === 'admin'

  const list = useQuery({
    queryKey: ['finance-vouchers', tab],
    queryFn: async () => {
      const { data, error } = await supabase.from('payment_vouchers')
        .select('id, voucher_no, subject_text, total_amount, status, doc_date, payment_date, created_by, submitted_by, departments(name_th), voucher_lines(payee_id, clinical_site_id, payees(prefix, first_name, last_name, has_bank_account), clinical_sites(name_th, has_bank_account))')
        .eq('status', tab)
        .order('submitted_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as Row[]
    },
  })

  const changeStatus = useMutation({
    mutationFn: async (p: { id: string; status: VoucherStatus; payment_date?: string; bank?: string }) => {
      const { error } = await supabase.rpc('set_voucher_status', {
        p_voucher_id: p.id,
        p_new_status: p.status,
        p_payment_date: p.payment_date ?? null,
        p_bank_code: p.bank ?? null,
        p_reason: null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('เปลี่ยนสถานะเรียบร้อย')
      void qc.invalidateQueries({ queryKey: ['finance-vouchers'] })
      void qc.invalidateQueries({ queryKey: ['vouchers'] })
      setPaying(null)
    },
    onError: (e) => toast.error(toThaiError(e)),
  })

  /**
   * แถวที่กำลังเปิดดูเลขบัญชี
   *
   * เก็บเป็น id ไม่ใช่ทั้งแถว เพราะข้อมูลอาจถูกโหลดใหม่ระหว่างเปิดอยู่
   * และต้องยอมให้เป็น undefined ได้ เพราะการสลับแท็บเปลี่ยนชุดข้อมูลทั้งชุด
   */
  const bankRow = (list.data ?? []).find((r) => r.id === openBank)

  const total = useMemo(
    () => (list.data ?? []).reduce((s, r) => s + Number(r.total_amount), 0),
    [list.data],
  )

  const banks = (lookups.data?.banks ?? []).map((b) => ({
    code: b.code as string, name_th: b.name_th as string,
  }))

  /** ผู้รับเงินที่ไม่ซ้ำกันในเอกสารฉบับหนึ่ง */
  const payeesOf = (r: Row) => {
    const seen = new Map<string, { type: 'payee' | 'clinical_site'; id: string; name: string; has: boolean }>()
    for (const l of r.voucher_lines ?? []) {
      if (l.payee_id && l.payees) {
        seen.set(`p${l.payee_id}`, {
          type: 'payee', id: l.payee_id,
          name: fullName(l.payees.prefix, l.payees.first_name, l.payees.last_name),
          has: l.payees.has_bank_account,
        })
      } else if (l.clinical_site_id && l.clinical_sites) {
        seen.set(`s${l.clinical_site_id}`, {
          type: 'clinical_site', id: l.clinical_site_id,
          name: l.clinical_sites.name_th, has: l.clinical_sites.has_bank_account,
        })
      }
    }
    return [...seen.values()]
  }

  const TABS = [
    { key: 'submitted' as const, label: 'รอตรวจสอบ' },
    { key: 'verified' as const, label: 'ตรวจสอบแล้ว รอจ่าย' },
    { key: 'paid' as const, label: 'จ่ายเงินแล้ว' },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">ปรับสถานะการเบิกจ่าย</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          การเปลี่ยนสถานะทุกครั้งทำผ่านฟังก์ชันของฐานข้อมูล ไม่ได้แก้ตารางตรง ๆ
          และผู้ตรวจสอบต้องไม่ใช่ผู้จัดทำเอกสารฉบับเดียวกัน
        </p>
      </div>

      <div className="card overflow-x-auto p-1">
        <div role="tablist" aria-label="สถานะเอกสาร" className="flex gap-1">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
              onClick={() => { setTab(t.key); setOpenBank(null) }}
              className={tab === t.key ? 'tab-btn-on' : 'tab-btn-off'}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {list.error && (
        <div role="alert" className="card border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
          <span aria-hidden="true">⚠ </span>{toThaiError(list.error)}
        </div>
      )}

      <div className="card p-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {TABS.find((t) => t.key === tab)?.label} · {(list.data ?? []).length} ฉบับ ·
          รวม <span className="font-semibold">{formatBaht(total)}</span> บาท
        </p>
      </div>

      <DataTable
        title="เอกสารการเบิกจ่าย"
        rows={list.data ?? []}
        rowKey={(r) => r.id}
        loading={list.isLoading}
        emptyText="ไม่มีเอกสารในสถานะนี้"
        columns={[
          {
            key: 'no', header: 'เลขที่ / วิชา',
            render: (r) => (
              <div>
                <span className="font-medium">{r.voucher_no ?? '(ยังไม่มีเลขที่)'}</span>
                <span className="block text-xs text-slate-500">
                  {r.subject_text ?? '-'} · {r.departments?.name_th ?? '-'}
                </span>
              </div>
            ),
          },
          {
            key: 'date', header: 'ลงวันที่', hideOnMobile: true,
            render: (r) => formatDateBE(r.payment_date ?? r.doc_date),
          },
          { key: 'total', header: 'จำนวนเงิน', align: 'right', render: (r) => formatBaht(r.total_amount) },
          { key: 'st', header: 'สถานะ', render: (r) => <StatusBadge status={r.status} /> },
          {
            key: '__a', header: 'จัดการ', align: 'right',
            render: (r) => {
              const isMaker = !!user && (r.created_by === user.id || r.submitted_by === user.id)
              return (
                <div className="flex flex-wrap justify-end gap-1">
                  <button type="button" onClick={() => nav(`/docs/vouchers/${r.id}`)}
                    className="btn-link-muted">
                    เปิด
                  </button>
                  <button type="button" onClick={() => setOpenBank(openBank === r.id ? null : r.id)}
                    className="btn-link-muted">
                    เลขบัญชี
                  </button>
                  {canAct && tab === 'submitted' && (
                    <button type="button" disabled={isMaker || changeStatus.isPending}
                      title={isMaker ? 'คุณเป็นผู้จัดทำเอกสารฉบับนี้ ตรวจสอบเองไม่ได้' : undefined}
                      onClick={() => changeStatus.mutate({ id: r.id, status: 'verified' })}
                      className="btn-link-brand disabled:opacity-40">
                      ตรวจสอบแล้ว
                    </button>
                  )}
                  {canAct && tab === 'verified' && (
                    <button type="button" onClick={() => setPaying(r)}
                      className="btn-link text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-slate-800">
                      บันทึกการจ่าย
                    </button>
                  )}
                </div>
              )
            },
          },
        ]}
      />

      {bankRow && (
        <div className="card space-y-3 p-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            เลขบัญชีผู้รับเงิน · {bankRow.voucher_no ?? '(ยังไม่มีเลขที่)'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            การเปิดดูต้องระบุวัตถุประสงค์ และถูกบันทึกไว้ทุกครั้ง
          </p>
          {payeesOf(bankRow).map((p) => (
            <BankAccountField
              key={`${p.type}-${p.id}`}
              ownerType={p.type}
              ownerId={p.id}
              ownerName={p.name}
              hasAccount={p.has}
              banks={banks}
            />
          ))}
          <button type="button" className="btn-secondary !min-h-[36px] !px-3 !text-xs"
            onClick={() => setOpenBank(null)}>
            ปิด
          </button>
        </div>
      )}

      <FormModal
        open={!!paying}
        title={`บันทึกการจ่ายเงิน · ${paying?.voucher_no ?? ''}`}
        saving={changeStatus.isPending}
        onCancel={() => setPaying(null)}
        fields={[
          { name: 'payment_date', label: 'วันที่จ่ายเงินจริง', type: 'date', required: true },
          {
            name: 'bank', label: 'ธนาคารที่โอน', type: 'select', required: true,
            options: banks.map((b) => ({ value: b.code, label: b.name_th })),
          },
        ]}
        initial={{ payment_date: todayBangkok(), bank: '' }}
        onSubmit={(v) => {
          if (!paying) return
          changeStatus.mutate({
            id: paying.id, status: 'paid',
            payment_date: String(v.payment_date), bank: String(v.bank),
          })
        }}
      />
    </div>
  )
}
