import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { toThaiError } from '@/lib/errors'
import { useToast } from './Toast'
import { useAuth } from '@/auth/AuthProvider'

type OwnerType = 'payee' | 'clinical_site'

interface Props {
  ownerType: OwnerType
  ownerId: string | null
  ownerName: string
  hasAccount: boolean
  banks: { code: string; name_th: string }[]
  onChanged?: () => void
}

/** เวลาที่เลขบัญชีค้างอยู่บนจอก่อนซ่อนอัตโนมัติ */
const AUTO_HIDE_SECONDS = 45

/**
 * ช่องเลขที่บัญชีธนาคาร
 *
 * กฎที่บังคับไว้ในคอมโพเนนต์นี้
 *   • บทบาทอื่นนอกจากผู้ดูแลระบบและเจ้าหน้าที่งานการเงิน เห็นได้แค่จุดสีเขียว
 *     ว่ามีเลขบัญชีแล้วหรือยัง ไม่มีปุ่มให้กดดู
 *   • การเรียกดูต้องระบุเหตุผล และถูกบันทึกลง audit.sensitive_access_log ทุกครั้ง
 *     (บังคับที่ RPC ในฐานข้อมูล ไม่ใช่ที่นี่ — ที่นี่แค่ทำให้ใช้งานสะดวก)
 *   • ผลลัพธ์ไม่ถูกเก็บใน cache ของ TanStack Query โดยเจตนา และถูกล้างออกจาก
 *     state เมื่อซ่อน เพื่อไม่ให้เลขบัญชีค้างในหน่วยความจำของเบราว์เซอร์
 *     ซึ่งดึงออกมาดูได้ผ่าน React DevTools
 *   • ซ่อนอัตโนมัติหลัง 45 วินาที กันกรณีเปิดค้างแล้วลุกจากโต๊ะ
 */
export function BankAccountField({
  ownerType, ownerId, ownerName, hasAccount, banks, onChanged,
}: Props) {
  const { user } = useAuth()
  const toast = useToast()
  const canSee = user?.role_code === 'admin' || user?.role_code === 'finance'

  const [mode, setMode] = useState<'idle' | 'asking' | 'shown' | 'editing'>('idle')
  const [purpose, setPurpose] = useState('')
  const [busy, setBusy] = useState(false)
  const [left, setLeft] = useState(AUTO_HIDE_SECONDS)
  const [acct, setAcct] = useState<{ bank_code: string; account_no: string; account_name: string } | null>(null)
  const tick = useRef<number>()

  const clearSecret = useCallback(() => {
    setAcct(null)
    setPurpose('')
    if (tick.current) window.clearInterval(tick.current)
  }, [])

  // ล้างเสมอเมื่อคอมโพเนนต์ถูกถอด (ปิดฟอร์ม เปลี่ยนหน้า ออกจากระบบ)
  useEffect(() => clearSecret, [clearSecret])

  useEffect(() => {
    if (mode !== 'shown') return
    setLeft(AUTO_HIDE_SECONDS)
    tick.current = window.setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          window.clearInterval(tick.current)
          setMode('idle')
          setAcct(null)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => { if (tick.current) window.clearInterval(tick.current) }
  }, [mode])

  if (!ownerId) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        บันทึกข้อมูลหลักก่อน จึงจะกรอกเลขที่บัญชีได้
      </p>
    )
  }

  if (!canSee) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="field-label mb-0">เลขที่บัญชีธนาคาร:</span>
        {hasAccount ? (
          <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
            มีข้อมูลแล้ว
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-slate-500">
            <span className="h-2.5 w-2.5 rounded-full border border-slate-400" aria-hidden="true" />
            ยังไม่มีข้อมูล
          </span>
        )}
        <span className="text-xs text-slate-400">
          (ดูเลขบัญชีได้เฉพาะผู้ดูแลระบบและเจ้าหน้าที่งานการเงิน)
        </span>
      </div>
    )
  }

  const reveal = async () => {
    if (purpose.trim().length < 5) {
      toast.error('ต้องระบุเหตุผลในการเรียกดูอย่างน้อย 5 ตัวอักษร — ข้อความนี้จะถูกบันทึกไว้ให้ผู้ตรวจสอบเห็น')
      return
    }
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('get_bank_account', {
        p_owner_type: ownerType, p_owner_id: ownerId, p_purpose: purpose.trim(),
      })
      if (error) throw error
      const row = (data as { bank_code: string; account_no: string; account_name: string }[])?.[0]
      if (!row) {
        toast.info('ยังไม่มีเลขที่บัญชีของรายการนี้ในระบบ')
        setMode('editing')
        setAcct({ bank_code: '', account_no: '', account_name: ownerName })
      } else {
        setAcct(row)
        setMode('shown')
      }
    } catch (e) {
      toast.error(toThaiError(e))
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!acct) return
    if (!/^[0-9]{8,20}$/.test(acct.account_no)) {
      toast.error('เลขที่บัญชีต้องเป็นตัวเลข 8–20 หลัก ไม่ใส่ขีดหรือเว้นวรรค')
      return
    }
    if (!acct.bank_code) { toast.error('เลือกธนาคารก่อน'); return }
    setBusy(true)
    try {
      const { error } = await supabase.rpc('upsert_bank_account', {
        p_owner_type: ownerType, p_owner_id: ownerId,
        p_bank_code: acct.bank_code, p_account_no: acct.account_no,
        p_account_name: acct.account_name || ownerName,
      })
      if (error) throw error
      toast.success('บันทึกเลขที่บัญชีเรียบร้อย')
      clearSecret()
      setMode('idle')
      onChanged?.()
    } catch (e) {
      toast.error(toThaiError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-900 dark:text-white">เลขที่บัญชีธนาคาร</span>
        {hasAccount ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />มีข้อมูลแล้ว
          </span>
        ) : (
          <span className="text-xs text-slate-500">ยังไม่มีข้อมูล</span>
        )}
      </div>

      <p className="mt-1 text-xs text-amber-900 dark:text-amber-200">
        การเรียกดูถูกบันทึกไว้ทุกครั้งพร้อมเหตุผล ชื่อผู้ดู และเวลา
      </p>

      {mode === 'idle' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary !min-h-[40px] !px-3" onClick={() => setMode('asking')}>
            {hasAccount ? 'เรียกดู / แก้ไขเลขบัญชี' : 'บันทึกเลขบัญชี'}
          </button>
        </div>
      )}

      {mode === 'asking' && (
        <div className="mt-3 space-y-2">
          <label htmlFor="bank-purpose" className="field-label">
            เหตุผลในการเรียกดู <span className="text-rose-600" aria-hidden="true">*</span>
          </label>
          <input
            id="bank-purpose" className="field-input" value={purpose} autoFocus
            placeholder="เช่น ตรวจสอบก่อนโอนเงินเดือนกันยายน"
            onChange={(e) => setPurpose(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void reveal() } }}
          />
          <div className="flex gap-2">
            <button type="button" className="btn-primary !min-h-[40px] !px-3" disabled={busy} onClick={() => void reveal()}>
              {busy ? 'กำลังตรวจสิทธิ์…' : 'ยืนยันและเรียกดู'}
            </button>
            <button type="button" className="btn-secondary !min-h-[40px] !px-3"
              onClick={() => { setMode('idle'); setPurpose('') }}>
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {mode === 'shown' && acct && (
        <div className="mt-3 space-y-2">
          <dl className="grid gap-1 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-slate-500">ธนาคาร</dt>
              <dd>{banks.find((b) => b.code === acct.bank_code)?.name_th ?? acct.bank_code}</dd></div>
            <div><dt className="text-xs text-slate-500">เลขที่บัญชี</dt>
              <dd className="font-mono tabular-nums">{acct.account_no}</dd></div>
            <div><dt className="text-xs text-slate-500">ชื่อบัญชี</dt><dd>{acct.account_name}</dd></div>
          </dl>
          <p className="text-xs text-amber-900 dark:text-amber-200" aria-live="polite">
            ซ่อนอัตโนมัติใน {left} วินาที
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary !min-h-[40px] !px-3" onClick={() => setMode('editing')}>
              แก้ไข
            </button>
            <button type="button" className="btn-secondary !min-h-[40px] !px-3"
              onClick={() => { clearSecret(); setMode('idle') }}>
              ซ่อนเดี๋ยวนี้
            </button>
          </div>
        </div>
      )}

      {mode === 'editing' && acct && (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="bk-bank" className="field-label">ธนาคาร</label>
            <select id="bk-bank" className="field-input" value={acct.bank_code}
              onChange={(e) => setAcct({ ...acct, bank_code: e.target.value })}>
              <option value="">— เลือก —</option>
              {banks.map((b) => <option key={b.code} value={b.code}>{b.name_th}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="bk-no" className="field-label">เลขที่บัญชี</label>
            <input id="bk-no" className="field-input font-mono" inputMode="numeric" value={acct.account_no}
              placeholder="ตัวเลข 8–20 หลัก"
              onChange={(e) => setAcct({ ...acct, account_no: e.target.value.replace(/\D/g, '') })} />
          </div>
          <div>
            <label htmlFor="bk-name" className="field-label">ชื่อบัญชี</label>
            <input id="bk-name" className="field-input" value={acct.account_name}
              onChange={(e) => setAcct({ ...acct, account_name: e.target.value })} />
          </div>
          <div className="flex gap-2 sm:col-span-3">
            <button type="button" className="btn-primary !min-h-[40px] !px-3" disabled={busy} onClick={() => void save()}>
              {busy ? 'กำลังบันทึก…' : 'บันทึกเลขบัญชี'}
            </button>
            <button type="button" className="btn-secondary !min-h-[40px] !px-3"
              onClick={() => { clearSecret(); setMode('idle') }}>
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
