import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { APP_SETTINGS_KEY, settingObject, settingText, useAppSettings } from '@/hooks/useAppSettings'
import { useAuth } from '@/auth/AuthProvider'
import { usePermissions } from '@/hooks/usePermissions'
import { useToast } from '@/components/Toast'
import { toThaiError } from '@/lib/errors'

interface Draft {
  orgName: string
  program: string
  directorPrefix: string
  directorName: string
  directorPosition: string
  deputyPrefix: string
  deputyName: string
  deputyPosition: string
}

const EMPTY: Draft = {
  orgName: '', program: '',
  directorPrefix: '', directorName: '', directorPosition: '',
  deputyPrefix: '', deputyName: '', deputyPosition: '',
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/**
 * ผู้ลงนามและข้อความที่ถูกพิมพ์ลงเอกสารทุกใบ
 *
 * ช่อง (16) ผู้รับรอง = รองผู้อำนวยการด้านวิชาการ
 * ช่อง (17) ผู้อนุมัติ = ผู้อำนวยการ
 * เก็บไว้ที่นี่เพื่อให้เปลี่ยนผู้บริหารได้โดยไม่ต้องแก้โค้ด
 * และไม่กระทบเอกสารเก่าที่บันทึกชื่อไว้ในตัวเอกสารแล้ว
 */
export function OrgSettingsCard() {
  const qc = useQueryClient()
  const toast = useToast()
  const { user } = useAuth()
  const { can } = usePermissions()
  const canEdit = can('settings.ref', 'update')
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [dirty, setDirty] = useState(false)

  const q = useAppSettings()

  // เติมฟอร์มจากฐานข้อมูลเฉพาะตอนที่ยังไม่มีการแก้ค้างอยู่
  // ไม่งั้นการ refetch ตอนสลับกลับมาที่แท็บเบราว์เซอร์จะกลืนสิ่งที่พิมพ์ไว้แล้วโดยไม่บอก
  useEffect(() => {
    if (!q.data || dirty) return
    const dir = settingObject(q.data, 'org.director')
    const dep = settingObject(q.data, 'org.deputy_academic')
    setDraft({
      orgName: settingText(q.data, 'org.name'),
      program: settingText(q.data, 'org.program'),
      directorPrefix: str(dir.prefix),
      directorName: str(dir.name),
      directorPosition: str(dir.position),
      deputyPrefix: str(dep.prefix),
      deputyName: str(dep.name),
      deputyPosition: str(dep.position) || 'รองผู้อำนวยการด้านวิชาการ',
    })
    // dirty เป็นค่าที่อ่านเพื่อ "ข้าม" การเติม ไม่ได้ใช้เป็นตัวกระตุ้น
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data])

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const now = new Date().toISOString()
      const rows = [
        { key: 'org.name', value: d.orgName.trim(), name_th: 'ชื่อส่วนราชการ' },
        { key: 'org.program', value: d.program.trim(), name_th: 'ชื่อหลักสูตร' },
        {
          key: 'org.director',
          value: {
            prefix: d.directorPrefix.trim(),
            name: d.directorName.trim(),
            position: d.directorPosition.trim(),
          },
          name_th: 'ผู้อนุมัติ (ผู้อำนวยการ)',
        },
        {
          key: 'org.deputy_academic',
          value: {
            prefix: d.deputyPrefix.trim(),
            name: d.deputyName.trim(),
            position: d.deputyPosition.trim(),
          },
          name_th: 'ผู้รับรอง (รองผู้อำนวยการด้านวิชาการ)',
        },
      ].map((r) => ({ ...r, updated_at: now, updated_by: user?.id ?? null }))

      const { error } = await supabase.from('app_settings').upsert(rows, { onConflict: 'key' })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('บันทึกค่าคงที่องค์กรเรียบร้อย')
      setDirty(false)
      void qc.invalidateQueries({ queryKey: APP_SETTINGS_KEY })
    },
    onError: (e) => toast.error(toThaiError(e)),
  })

  const field = (
    label: string, name: keyof Draft, help?: string, wide = false,
  ) => (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <label htmlFor={`org-${name}`} className="field-label">{label}</label>
      <input
        id={`org-${name}`}
        className="field-input"
        value={draft[name]}
        disabled={!canEdit}
        onChange={(e) => { setDirty(true); setDraft((p) => ({ ...p, [name]: e.target.value })) }}
      />
      {help && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{help}</p>}
    </div>
  )

  return (
    <div className="card p-4 sm:p-5">
      <h2 className="text-base font-semibold text-slate-900 dark:text-white">ตั้งค่าแบบฟอร์ม</h2>
      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
        ชื่อผู้ลงนามที่นี่จะขึ้นเป็นตัวเลือกในช่องผู้รับรองและผู้อนุมัติของทุกเอกสาร
        เอกสารที่จ่ายเงินแล้วจะยังคงชื่อเดิมที่บันทึกไว้ในตัวเอกสาร ไม่เปลี่ยนตามที่แก้ที่นี่
      </p>

      {q.error && (
        <div role="alert" className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
          <span aria-hidden="true">⚠ </span>{toThaiError(q.error)}
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {field('ชื่อส่วนราชการ', 'orgName', undefined, true)}
        {field('ชื่อหลักสูตร', 'program', undefined, true)}
      </div>

      <h3 className="mt-6 text-sm font-semibold text-slate-800 dark:text-slate-200">
        ผู้อนุมัติ — ช่อง (17) ของใบหลักฐาน และช่องอนุมัติของหน้างบฯ
      </h3>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        {field('คำนำหน้า', 'directorPrefix', 'เช่น ผู้ช่วยศาสตราจารย์ / ดร.')}
        {field('ชื่อ-สกุล', 'directorName')}
        {field('ตำแหน่ง', 'directorPosition', 'ข้อความใต้ลายเซ็น', true)}
      </div>

      <h3 className="mt-6 text-sm font-semibold text-slate-800 dark:text-slate-200">
        ผู้รับรอง — ช่อง (16) ของใบหลักฐาน
      </h3>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        {field('คำนำหน้า', 'deputyPrefix')}
        {field('ชื่อ-สกุล', 'deputyName')}
        {field('ตำแหน่ง', 'deputyPosition', 'ข้อความใต้ลายเซ็น', true)}
      </div>

      {canEdit && (
        <div className="mt-5 flex justify-end">
          {dirty && (
            <span className="mr-3 self-center text-sm text-amber-700 dark:text-amber-400">
              มีการแก้ไขที่ยังไม่ได้บันทึก
            </span>
          )}
          <button
            type="button"
            className="btn-primary sm:min-w-[140px]"
            disabled={save.isPending || q.isLoading}
            onClick={() => save.mutate(draft)}
          >
            {save.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      )}
    </div>
  )
}
