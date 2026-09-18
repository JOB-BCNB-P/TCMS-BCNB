import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePermissions } from '@/hooks/usePermissions'
import { useToast } from '@/components/Toast'
import { toThaiError } from '@/lib/errors'
import { ROLE_LABEL, type RoleCode } from '@/lib/types'

interface Role { id: string; code: RoleCode; name_th: string }
interface Menu { key: string; parent_key: string | null; name_th: string; sort_order: number }
interface Perm {
  role_id: string; menu_key: string
  can_view: boolean; can_create: boolean; can_update: boolean; can_delete: boolean
}

type Action = 'can_view' | 'can_create' | 'can_update' | 'can_delete'

const ACTIONS: { key: Action; label: string }[] = [
  { key: 'can_view', label: 'ดู' },
  { key: 'can_create', label: 'เพิ่ม' },
  { key: 'can_update', label: 'แก้' },
  { key: 'can_delete', label: 'ลบ' },
]

const cellKey = (roleId: string, menuKey: string) => `${roleId}|${menuKey}`

/**
 * ตารางสิทธิ์เมนู
 *
 * ย้ำให้ผู้ใช้เห็นชัดว่าตารางนี้ควบคุม "การแสดงเมนู" เท่านั้น
 * การติ๊กเพิ่มที่นี่ไม่ได้เปิดสิทธิ์จริงในฐานข้อมูล และการติ๊กออกก็ไม่ได้ปิดช่องทาง REST
 * ถ้าผู้ใช้ติ๊กให้บทบาทหนึ่งเห็นเมนูที่ RLS ไม่อนุญาต หน้าจอจะขึ้นข้อความปฏิเสธจากฐานข้อมูลแทน
 */
export function PermissionsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const { can } = usePermissions()
  const canEdit = can('settings.perms', 'update')
  const [draft, setDraft] = useState<Map<string, Perm>>(new Map())
  const [dirty, setDirty] = useState(false)
  const [previewRole, setPreviewRole] = useState('')

  const q = useQuery({
    queryKey: ['permission-matrix'],
    queryFn: async () => {
      const [roles, menus, perms] = await Promise.all([
        supabase.from('roles').select('id, code, name_th'),
        supabase.from('menus').select('key, parent_key, name_th, sort_order'),
        supabase.from('role_menu_permissions')
          .select('role_id, menu_key, can_view, can_create, can_update, can_delete'),
      ])
      const bad = [roles, menus, perms].find((r) => r.error)
      if (bad?.error) throw bad.error
      return {
        roles: (roles.data ?? []) as Role[],
        menus: (menus.data ?? []) as Menu[],
        perms: (perms.data ?? []) as Perm[],
      }
    },
  })

  // เติมตารางจากฐานข้อมูลเฉพาะตอนที่ยังไม่มีการติ๊กค้างอยู่
  // การ refetch ตอนสลับกลับมาที่แท็บเบราว์เซอร์ไม่ควรกลืนสิ่งที่ติ๊กไว้แล้วโดยไม่บอก
  useEffect(() => {
    if (!q.data || dirty) return
    setDraft(new Map(q.data.perms.map((p) => [cellKey(p.role_id, p.menu_key), p])))
    // dirty ใช้เพื่อ "ข้าม" การเติม ไม่ได้ใช้เป็นตัวกระตุ้น
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data])

  /** เมนูเรียงแบบต้นไม้: หัวข้อหลักแล้วตามด้วยลูก */
  const orderedMenus = useMemo(() => {
    const all = q.data?.menus ?? []
    const roots = all.filter((m) => !m.parent_key).sort((a, b) => a.sort_order - b.sort_order)
    return roots.flatMap((r) => [
      r,
      ...all.filter((m) => m.parent_key === r.key).sort((a, b) => a.sort_order - b.sort_order),
    ])
  }, [q.data])

  const roles = q.data?.roles ?? []

  const get = (roleId: string, menuKey: string, a: Action) =>
    !!draft.get(cellKey(roleId, menuKey))?.[a]

  const toggle = (roleId: string, menuKey: string, a: Action) => {
    setDraft((prev) => {
      const next = new Map(prev)
      const k = cellKey(roleId, menuKey)
      const cur = next.get(k) ?? {
        role_id: roleId, menu_key: menuKey,
        can_view: false, can_create: false, can_update: false, can_delete: false,
      }
      const updated = { ...cur, [a]: !cur[a] }
      // ไม่ให้เพิ่ม/แก้/ลบ โดยที่มองไม่เห็นเมนู เพราะผู้ใช้จะกดอะไรไม่ได้อยู่ดี
      if (a !== 'can_view' && updated[a]) updated.can_view = true
      if (a === 'can_view' && !updated.can_view) {
        updated.can_create = false; updated.can_update = false; updated.can_delete = false
      }
      next.set(k, updated)
      return next
    })
    setDirty(true)
  }

  const save = useMutation({
    mutationFn: async () => {
      const rows = [...draft.values()]
      const { error } = await supabase
        .from('role_menu_permissions').upsert(rows, { onConflict: 'role_id,menu_key' })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('บันทึกสิทธิ์เมนูเรียบร้อย — ผู้ใช้จะเห็นผลเมื่อเข้าสู่ระบบครั้งถัดไปหรือรีเฟรชหน้า')
      void qc.invalidateQueries({ queryKey: ['permission-matrix'] })
      setDirty(false)
    },
    onError: (e) => toast.error(toThaiError(e)),
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">
          สิทธิ์การเข้าถึงของแต่ละบทบาท
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          ตารางนี้ควบคุม <strong>การแสดงเมนูและปุ่ม</strong> เท่านั้น
          สิทธิ์จริงบังคับที่ RLS ของฐานข้อมูล — ติ๊กเพิ่มที่นี่ไม่ได้เปิดสิทธิ์ให้ฐานข้อมูล
          และติ๊กออกก็ไม่ได้ปิดช่องทางเรียก API โดยตรง
        </p>
      </div>

      {q.error && (
        <div role="alert" className="card border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
          <span aria-hidden="true">⚠ </span>{toThaiError(q.error)}
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left dark:bg-slate-800/60">
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-slate-50 px-3 py-2 font-medium dark:bg-slate-800">
                เมนู
              </th>
              {roles.map((r) => (
                <th key={r.id} scope="col" className="px-3 py-2 text-center font-medium">
                  {ROLE_LABEL[r.code] ?? r.name_th}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {orderedMenus.map((m) => (
              <tr key={m.key} className={m.parent_key ? '' : 'bg-slate-50/60 dark:bg-slate-800/30'}>
                <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-normal dark:bg-slate-900">
                  <span className={m.parent_key ? 'pl-4 text-slate-700 dark:text-slate-300' : 'font-medium'}>
                    {m.name_th}
                  </span>
                </th>
                {roles.map((r) => (
                  <td key={r.id} className="px-2 py-2">
                    <div className="flex flex-wrap justify-center gap-x-2 gap-y-1">
                      {ACTIONS.map((a) => (
                        <label key={a.key} className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            disabled={!canEdit}
                            checked={get(r.id, m.key, a.key)}
                            onChange={() => toggle(r.id, m.key, a.key)}
                            aria-label={`${ROLE_LABEL[r.code] ?? r.name_th} ${a.label} ${m.name_th}`}
                          />
                          {a.label}
                        </label>
                      ))}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------- ดูตัวอย่างเมนูของบทบาทอื่น ---------- */}
      <div className="card p-4">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          ดูตัวอย่างเมนูของแต่ละบทบาท
        </h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          แสดงว่าบทบาทที่เลือกจะเห็นเมนูอะไรและกดปุ่มอะไรได้บ้าง โดยไม่ต้องเข้าสู่ระบบด้วยบัญชีนั้น
          — <strong>เป็นการดูหน้าตาเมนูเท่านั้น ไม่ใช่การทดสอบสิทธิ์จริง</strong>
          เพราะสิทธิ์เข้าถึงข้อมูลบังคับที่ฐานข้อมูลตามบัญชีที่ล็อกอินอยู่จริง
        </p>

        <div className="mt-3 max-w-sm">
          <label htmlFor="prev-role" className="field-label">บทบาท</label>
          <select id="prev-role" className="field-input" value={previewRole}
            onChange={(e) => setPreviewRole(e.target.value)}>
            <option value="">— เลือกบทบาท —</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{ROLE_LABEL[r.code] ?? r.name_th}</option>
            ))}
          </select>
        </div>

        {previewRole && (
          <div className="anim-pop mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            {(() => {
              const visible = orderedMenus.filter((m) => get(previewRole, m.key, 'can_view'))
              const roots = visible.filter((m) => !m.parent_key)
              if (visible.length === 0) {
                return <p className="text-sm text-slate-500">บทบาทนี้ยังไม่เห็นเมนูใดเลย</p>
              }
              return (
                <ul className="space-y-2 text-sm">
                  {roots.map((root) => {
                    const kids = visible.filter((m) => m.parent_key === root.key)
                    return (
                      <li key={root.key}>
                        <span className="font-medium text-slate-800 dark:text-slate-100">
                          {root.name_th}
                        </span>
                        {kids.length > 0 && (
                          <ul className="mt-1 space-y-1 pl-4">
                            {kids.map((k) => (
                              <li key={k.key} className="flex flex-wrap items-center gap-2">
                                <span className="text-slate-700 dark:text-slate-300">{k.name_th}</span>
                                <span className="text-xs text-slate-500">
                                  {ACTIONS.filter((a) => get(previewRole, k.key, a.key))
                                    .map((a) => a.label).join(' · ') || 'ดูอย่างเดียว'}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    )
                  })}
                  {/* เมนูที่ไม่มีลูก เช่น หน้าหลัก */}
                  {visible
                    .filter((m) => !m.parent_key && !visible.some((x) => x.parent_key === m.key))
                    .length === 0 && null}
                </ul>
              )
            })()}
            {dirty && (
              <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
                กำลังแสดงตามที่ติ๊กไว้บนหน้าจอ ซึ่งยังไม่ได้บันทึก
              </p>
            )}
          </div>
        )}
      </div>

      {canEdit && (
        <div className="flex items-center justify-end gap-3">
          {dirty && (
            <span className="text-sm text-amber-700 dark:text-amber-400">มีการแก้ไขที่ยังไม่ได้บันทึก</span>
          )}
          <button type="button" className="btn-primary sm:min-w-[140px]"
            disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'กำลังบันทึก…' : 'บันทึกสิทธิ์เมนู'}
          </button>
        </div>
      )}
    </div>
  )
}
