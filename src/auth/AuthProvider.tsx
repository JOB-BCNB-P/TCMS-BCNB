import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, isCollegeEmail } from '@/lib/supabase'
import type { MenuPermission, RoleCode, SessionUser } from '@/lib/types'

interface AuthState {
  session: Session | null
  user: SessionUser | null
  permissions: Map<string, MenuPermission>
  loading: boolean
  /** ล็อกอินสำเร็จแต่ผู้ดูแลระบบยังไม่เปิดใช้งานบัญชี */
  pendingApproval: boolean
  error: string | null
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [permissions, setPermissions] = useState<Map<string, MenuPermission>>(new Map())
  const [loading, setLoading] = useState(true)
  const [pendingApproval, setPendingApproval] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setUser(null)
      setPermissions(new Map())
      setPendingApproval(false)
      return
    }

    // ด่านที่หนึ่งฝั่งหน้าเว็บ — ด่านจริงคือ trigger บน auth.users และ RLS
    if (!isCollegeEmail(s.user.email)) {
      setError('อนุญาตเฉพาะบัญชีอีเมลของวิทยาลัย (@bcn.ac.th) เท่านั้น')
      await supabase.auth.signOut({ scope: 'local' })
      setUser(null)
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, email, prefix, first_name, last_name, position_title, role_id, is_active, roles(code)')
      .eq('id', s.user.id)
      .maybeSingle()

    if (profileError) {
      setError(profileError.message)
      setUser(null)
      return
    }

    // โปรไฟล์ยังไม่ถูกเปิดใช้งาน RLS จะคืน 0 แถว จึงได้ null
    if (!profile || !profile.is_active) {
      setPendingApproval(true)
      setUser(null)
      setPermissions(new Map())
      return
    }

    const roleCode = (profile as unknown as { roles: { code: RoleCode } }).roles.code

    const [{ data: scopes }, { data: perms }] = await Promise.all([
      supabase.from('user_department_scopes').select('department_id').eq('user_id', s.user.id),
      supabase
        .from('role_menu_permissions')
        .select('menu_key, can_view, can_create, can_update, can_delete')
        .eq('role_id', profile.role_id),
    ])

    setPendingApproval(false)
    setUser({
      id: profile.id,
      email: profile.email,
      prefix: profile.prefix,
      first_name: profile.first_name,
      last_name: profile.last_name,
      position_title: profile.position_title,
      role_id: profile.role_id,
      is_active: profile.is_active,
      role_code: roleCode,
      department_ids: (scopes ?? []).map((r) => r.department_id as string),
    })
    setPermissions(new Map((perms ?? []).map((p) => [p.menu_key as string, p as MenuPermission])))
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      await loadProfile(data.session)
      if (active) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      void loadProfile(s)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signInWithGoogle = useCallback(async () => {
    setError(null)
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // ต้องตรงกับค่าใน Supabase > Authentication > URL Configuration
        // BASE_URL มาจาก vite.config (/TCMS-BCNB/) จึงใช้ได้ทั้งตอนพัฒนาและตอนขึ้นจริง
        redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
        // hd เป็นคำใบ้ให้หน้าเลือกบัญชีของ Google เท่านั้น ไม่ใช่การบังคับ
        // การบังคับจริงอยู่ที่ trigger enforce_bcn_domain ในฐานข้อมูล
        queryParams: { hd: 'bcn.ac.th', prompt: 'select_account' },
      },
    })
    if (e) setError(e.message)
  }, [])

  const signOut = useCallback(async () => {
    // scope 'local' — ออกจากระบบนี้เท่านั้น ไม่แตะบัญชี Google อื่นในเบราว์เซอร์
    await supabase.auth.signOut({ scope: 'local' })
    // ล้าง cache ทั้งหมด มิฉะนั้นข้อมูลผู้รับเงินของผู้ใช้คนก่อนจะค้างอยู่ในหน่วยความจำ
    queryClient.clear()
    setUser(null)
    setPermissions(new Map())
    setPendingApproval(false)
  }, [queryClient])

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await loadProfile(data.session)
  }, [loadProfile])

  const value = useMemo<AuthState>(
    () => ({
      session, user, permissions, loading, pendingApproval, error,
      signInWithGoogle, signOut, refresh,
    }),
    [session, user, permissions, loading, pendingApproval, error, signInWithGoogle, signOut, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth ต้องอยู่ภายใต้ AuthProvider')
  return ctx
}
