import type { ReactNode } from 'react'
import { useAuth } from './AuthProvider'
import { LoginPage } from './LoginPage'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-brand-50 dark:bg-slate-950">
        <p className="text-sm text-slate-500" role="status">กำลังตรวจสอบสิทธิ์…</p>
      </div>
    )
  }
  if (!user) return <LoginPage />
  return <>{children}</>
}
