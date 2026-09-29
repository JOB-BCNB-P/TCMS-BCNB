import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { usePermissions } from '@/hooks/usePermissions'
import { DataTable } from '@/components/DataTable'
import { FormModal } from '@/components/FormModal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/components/Toast'
import { useLookups } from '@/hooks/useCrud'
import { assertAffected, toThaiError } from '@/lib/errors'
import { formatDateBE, formatTimestampBE } from '@/lib/thaiDate'
import { fullName } from '@/lib/format'
import { ROLE_LABEL, type RoleCode } from '@/lib/types'

interface Row {
  id: string
  email: string
  prefix: string | null
  first_name: string
  last_name: string
  position_title: string | null
  role_id: string
  is_active: boolean
  last_login_at: string | null
  created_at: string
  roles: { code: RoleCode; name_th: string } | null
}

interface Invitation {
  id: string
  email: string
  prefix: string | null
  first_name: string
  last_name: string
  position_title: string | null
  role_code: RoleCode
  department_ids: string[]
  note: string | null
  consumed_at: string | null
  created_at: string
}

/** บทบาทที่ขอบเขตสาขาวิชามีผลจริง — บทบาทอื่นเห็นทุกสาขาอยู่แล้ว */
const SCOPED_ROLES: RoleCode[] = ['secretary', 'instructor']

export function UsersPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const { user } = useAuth()
  const { can } = usePermissions()
  const canEdit = can('settings.users', 'update')
  const lookups = useLookups()
  const [editing, setEditing] = useState<Row | null>(null)
  const [search, setSearch] = useState('')
  const [editInvite, setEditInvite] = useState<Invitation | null | undefined>(undefined)
  const [deleteInvite, setDeleteInvite] = useState<Invitation | null>(null)
  const isAdmin = user?.role_code === 'admin'

  const users = useQuery({
    queryKey: ['user_profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, prefix, first_name, last_name, position_title, role_id, is_active, last_login_at, created_at, roles(code, name_th)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Row[]
    },
  })

  const scopes = useQuery({
    queryKey: ['user_department_scopes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_department_scopes').select('user_id, department_id')
      if (error) throw error
      return (data ?? []) as { user_id: string; department_id: string }[]
    },
  })

  const invites = useQuery({
    enabled: isAdmin,
    queryKey: ['user_invitations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_invitations')
        .select('id, email, prefix, first_name, last_name, position_title, role_code, department_ids, note, consumed_at, created_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Invitation[]
    },
  })

  const saveInvite = useMutation({
    mutationFn: async (v: Record<string, unknown>) => {
      const row = {
        email: String(v.email ?? '').trim().toLowerCase(),
        prefix: v.prefix === '' ? null : v.prefix,
        first_name: v.first_name ?? '',
        last_name: v.last_name ?? '',
        position_title: v.position_title === '' ? null : v.position_title,
        role_code: v.role_code,
        department_ids: (v.department_ids as string[] | undefined) ?? [],
        note: v.note === '' ? null : v.note,
      }
      if (editInvite) {
        const { data, error } = await supabase.from('user_invitations')
          .update(row).eq('id', editInvite.id).select('id')
        if (error) throw error
        assertAffected(data)
      } else {
        const { error } = await supabase.from('user_invitations').insert(row)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success('บันทึกการลงทะเบียนล่วงหน้าเรียบร้อย')
      void qc.invalidateQueries({ queryKey: ['user_invitations'] })
      setEditInvite(undefined)
    },
    onError: (e) => toast.error(toThaiError(e)),
  })

  const removeInvite = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('user_invitations')
        .delete().eq('id', id).select('id')
      if (error) throw error
      assertAffected(data)
    },
    onSuccess: () => {
      toast.success('ลบรายการลงทะเบียนล่วงหน้าแล้ว')
      void qc.invalidateQueries({ queryKey: ['user_invitations'] })
      setDeleteInvite(null)
    },
    onError: (e) => toast.error(toThaiError(e)),
  })

  const deptOptions = (lookups.data?.departments ?? []).map((d) => ({
    value: d.id as string, label: d.name_th as string,
  }))
  const deptName = (id: string) => deptOptions.find((o) => o.value === id)?.label ?? id

  const scopeOf = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const s of scopes.data ?? []) {
      m.set(s.user_id, [...(m.get(s.user_id) ?? []), s.department_id])
    }
    return m
  }, [scopes.data])

  const save = useMutation({
    mutationFn: async (v: { id: string; role_code: RoleCode; is_active: boolean; department_ids: string[] }) => {
      const { error } = await supabase.rpc('admin_set_user_role', {
        p_user_id: v.id,
        p_role_code: v.role_code,
        p_is_active: v.is_active,
        p_department_ids: v.department_ids,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('บันทึกสิทธิ์ผู้ใช้เรียบร้อย')
      void qc.invalidateQueries({ queryKey: ['user_profiles'] })
      void qc.invalidateQueries({ queryKey: ['user_department_scopes'] })
      setEditing(null)
    },
    onError: (e) => toast.error(toThaiError(e)),
  })

  const rows = useMemo(() => {
    const all = users.data ?? []
    const q = search.trim().toLowerCase()
    if (!q) return all
    return all.filter((r) =>
      `${r.email} ${r.first_name} ${r.last_name} ${r.position_title ?? ''}`.toLowerCase().includes(q))
  }, [users.data, search])

  const pending = (users.data ?? []).filter((r) => !r.is_active).length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">จัดการผู้ใช้งาน</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          ผู้ที่เข้าสู่ระบบด้วยอีเมล @bcn.ac.th ครั้งแรกจะถูกสร้างบัญชีไว้ในสถานะ “รออนุมัติ”
          และยังไม่เห็นข้อมูลใดเลยจนกว่าจะถูกเปิดใช้งานที่หน้านี้
        </p>
      </div>

      {isAdmin && (
        <div className="card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                ลงทะเบียนผู้ใช้ล่วงหน้า
              </h2>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                กรอกอีเมล ชื่อ บทบาท และสาขาไว้ก่อนได้ — พอเจ้าตัวเข้าสู่ระบบด้วย Google ครั้งแรก
                ระบบจะเติมให้และเปิดใช้งานทันที ไม่ต้องมากดอนุมัติซ้ำ
              </p>
            </div>
            <button type="button" className="btn-primary !min-h-[40px] !px-3"
              onClick={() => setEditInvite(null)}>
              + ลงทะเบียนล่วงหน้า
            </button>
          </div>

          {invites.error && (
            <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-400">
              <span aria-hidden="true">⚠ </span>{toThaiError(invites.error)}
            </p>
          )}

          <ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
            {(invites.data ?? []).length === 0 && !invites.isLoading && (
              <li className="py-3 text-sm text-slate-500">ยังไม่มีรายการลงทะเบียนล่วงหน้า</li>
            )}
            {(invites.data ?? []).map((iv) => (
              <li key={iv.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">
                    {fullName(iv.prefix, iv.first_name, iv.last_name)}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {iv.email} · {ROLE_LABEL[iv.role_code] ?? iv.role_code}
                    {iv.department_ids.length > 0
                      ? ` · ${iv.department_ids.map(deptName).join(', ')}`
                      : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {iv.consumed_at ? (
                    <span className="mr-2 text-xs text-emerald-700 dark:text-emerald-400">
                      ✔ เข้าใช้แล้ว {formatDateBE(iv.consumed_at.slice(0, 10))}
                    </span>
                  ) : (
                    <span className="mr-2 text-xs text-amber-700 dark:text-amber-400">
                      ⏳ ยังไม่ได้เข้าใช้
                    </span>
                  )}
                  {!iv.consumed_at && (
                    <button type="button" className="btn-link-brand"
                      onClick={() => setEditInvite(iv)}>
                      แก้ไข
                    </button>
                  )}
                  <button type="button" className="btn-link-danger"
                    onClick={() => setDeleteInvite(iv)}>
                    ลบ
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            อีเมลต้องเป็น @bcn.ac.th และต้องตรงกับบัญชี Google ที่เจ้าตัวใช้เข้าระบบ
            — ถ้าพิมพ์ผิด รายการนี้จะค้างเป็น “ยังไม่ได้เข้าใช้” ไปเฉย ๆ ไม่มีผลกับใคร
            · ระบบไม่ได้สร้างบัญชีให้ เจ้าตัวยังต้องกดเข้าสู่ระบบด้วย Google เอง
            · การแก้ไขทุกครั้งถูกบันทึกในประวัติการใช้งาน
          </p>

          <button type="button" className="btn-secondary mt-3 !min-h-[40px] !px-3"
            onClick={() => nav('/settings/permissions')}>
            ดูตัวอย่างเมนูของแต่ละบทบาท
          </button>
        </div>
      )}

      {pending > 0 && (
        <div className="card border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          มีผู้ใช้รออนุมัติ {pending} คน
        </div>
      )}

      {(users.error || scopes.error) && (
        <div role="alert" className="card border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
          <span aria-hidden="true">⚠ </span>{toThaiError(users.error ?? scopes.error)}
        </div>
      )}

      <div className="card p-3">
        <label htmlFor="user-search" className="sr-only">ค้นหาผู้ใช้</label>
        <input id="user-search" className="field-input" placeholder="ค้นหาจากอีเมลหรือชื่อ…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <DataTable
        title="ผู้ใช้งานระบบ"
        rows={rows}
        rowKey={(r) => r.id}
        loading={users.isLoading || scopes.isLoading || lookups.isLoading}
        refreshing={users.isFetching || scopes.isFetching}
        emptyText="ไม่พบผู้ใช้"
        columns={[
          {
            key: 'name', header: 'ผู้ใช้',
            render: (r) => (
              <div>
                <span className="font-medium">
                  {fullName(r.prefix, r.first_name, r.last_name) === '-'
                    ? r.email.split('@')[0]
                    : fullName(r.prefix, r.first_name, r.last_name)}
                </span>
                <span className="block text-xs text-slate-500">{r.email}</span>
              </div>
            ),
          },
          {
            key: 'role', header: 'บทบาท',
            render: (r) => r.roles ? ROLE_LABEL[r.roles.code] ?? r.roles.name_th : '-',
          },
          {
            key: 'scope', header: 'สาขาที่เห็น', hideOnMobile: true,
            render: (r) => {
              if (r.roles && !SCOPED_ROLES.includes(r.roles.code)) {
                return <span className="text-slate-500">ทุกสาขา</span>
              }
              const ids = scopeOf.get(r.id) ?? []
              return ids.length === 0
                ? <span className="text-rose-600 dark:text-rose-400">ยังไม่กำหนด</span>
                : ids.map(deptName).join(', ')
            },
          },
          {
            key: 'login', header: 'เข้าใช้ล่าสุด', hideOnMobile: true,
            render: (r) => formatTimestampBE(r.last_login_at),
          },
          {
            key: 'active', header: 'สถานะ',
            render: (r) => r.is_active
              ? <span className="text-emerald-700 dark:text-emerald-400">✔ ใช้งาน</span>
              : <span className="text-amber-700 dark:text-amber-400">⏳ รออนุมัติ</span>,
          },
          ...(canEdit ? [{
            key: '__a', header: 'จัดการ', align: 'right' as const,
            render: (r: Row) => (
              <button type="button" onClick={() => setEditing(r)}
                className="btn-link-brand">
                กำหนดสิทธิ์
              </button>
            ),
          }] : []),
        ]}
      />

      <FormModal
        open={!!editing}
        title={`กำหนดสิทธิ์ · ${editing?.email ?? ''}`}
        saving={save.isPending}
        onCancel={() => setEditing(null)}
        fields={[
          {
            name: 'role_code', label: 'บทบาท', type: 'select', required: true, wide: true,
            options: (Object.keys(ROLE_LABEL) as RoleCode[]).map((c) => ({ value: c, label: ROLE_LABEL[c] })),
            help: editing?.id === user?.id
              ? 'นี่คือบัญชีของคุณเอง — ระบบจะไม่ยอมให้ลดสิทธิ์ตนเอง เพื่อกันการล็อกตัวเองออกจากระบบ'
              : undefined,
          },
          {
            name: 'is_active', label: 'เปิดใช้งานบัญชี', type: 'checkbox', placeholder: 'เปิดใช้งาน',
            help: 'ปิดแล้วจะไม่เห็นข้อมูลใดทันทีในคำขอถัดไป โดยไม่ต้องรอ token หมดอายุ',
          },
          {
            name: 'department_ids', label: 'สาขาวิชาที่เห็นข้อมูล', type: 'multiselect',
            options: deptOptions, wide: true,
            help: 'มีผลกับบทบาทเลขานุการสาขาและอาจารย์ผู้สอนเท่านั้น บทบาทอื่นเห็นทุกสาขาตามหน้าที่',
          },
        ]}
        initial={{
          role_code: editing?.roles?.code ?? 'instructor',
          is_active: editing?.is_active ?? false,
          department_ids: editing ? (scopeOf.get(editing.id) ?? []) : [],
        }}
        onSubmit={(v) => {
          if (!editing) return
          save.mutate({
            id: editing.id,
            role_code: v.role_code as RoleCode,
            is_active: !!v.is_active,
            department_ids: (v.department_ids as string[] | undefined) ?? [],
          })
        }}
      />

      <FormModal
        open={editInvite !== undefined}
        title={editInvite ? 'แก้ไขการลงทะเบียนล่วงหน้า' : 'ลงทะเบียนผู้ใช้ล่วงหน้า'}
        saving={saveInvite.isPending}
        onCancel={() => setEditInvite(undefined)}
        fields={[
          {
            name: 'email', label: 'อีเมล (@bcn.ac.th)', type: 'text', required: true, wide: true,
            placeholder: 'somchai.j@bcn.ac.th',
            help: 'ต้องตรงกับบัญชี Google ที่เจ้าตัวใช้เข้าระบบ',
            validate: (val) => (/^[^\s@]+@bcn\.ac\.th$/i.test(String(val ?? '').trim())
              ? null : 'ต้องเป็นอีเมล @bcn.ac.th เท่านั้น'),
          },
          { name: 'prefix', label: 'คำนำหน้า', type: 'text', placeholder: 'นาง / นางสาว / ดร.' },
          { name: 'position_title', label: 'ตำแหน่ง', type: 'text' },
          { name: 'first_name', label: 'ชื่อ', type: 'text', required: true },
          { name: 'last_name', label: 'นามสกุล', type: 'text', required: true },
          {
            name: 'role_code', label: 'บทบาทที่จะได้รับ', type: 'select', required: true, wide: true,
            options: (Object.keys(ROLE_LABEL) as RoleCode[]).map((c) => ({ value: c, label: ROLE_LABEL[c] })),
            help: 'บัญชีจะถูกเปิดใช้งานด้วยบทบาทนี้ทันทีที่เจ้าตัวเข้าระบบครั้งแรก',
          },
          {
            name: 'department_ids', label: 'สาขาวิชาที่เห็นข้อมูล', type: 'multiselect',
            options: deptOptions, wide: true,
            help: 'มีผลกับบทบาทเลขานุการสาขาและอาจารย์ผู้สอนเท่านั้น',
          },
          { name: 'note', label: 'หมายเหตุ', type: 'text', wide: true },
        ]}
        initial={{
          email: editInvite?.email ?? '',
          prefix: editInvite?.prefix ?? '',
          position_title: editInvite?.position_title ?? '',
          first_name: editInvite?.first_name ?? '',
          last_name: editInvite?.last_name ?? '',
          role_code: editInvite?.role_code ?? 'instructor',
          department_ids: editInvite?.department_ids ?? [],
          note: editInvite?.note ?? '',
        }}
        onSubmit={(v) => saveInvite.mutate(v)}
      />

      <ConfirmDialog
        open={!!deleteInvite}
        danger
        title="ลบรายการลงทะเบียนล่วงหน้า"
        message={
          'ถ้าเจ้าตัวยังไม่เคยเข้าระบบ เมื่อเข้ามาจะกลายเป็นผู้ใช้รออนุมัติตามปกติ\n' +
          'ถ้าเข้าระบบไปแล้ว บัญชีและสิทธิ์ที่ได้รับไปจะไม่ถูกแตะต้อง'
        }
        confirmLabel="ยืนยันลบ"
        busy={removeInvite.isPending}
        onCancel={() => setDeleteInvite(null)}
        onConfirm={() => { if (deleteInvite) removeInvite.mutate(deleteInvite.id) }}
      />
    </div>
  )
}
