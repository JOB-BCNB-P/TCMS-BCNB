import { useCallback, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { usePermissions } from '@/hooks/usePermissions'
import { useTheme } from '@/hooks/useTheme'
import { LogoutDialog } from './LogoutDialog'
import { useIdleLogout } from '@/hooks/useIdleLogout'
import { useToast } from './Toast'
import { ROLE_LABEL } from '@/lib/types'

export function AppLayout() {
  const { user, signOut } = useAuth()
  const { visibleMenu } = usePermissions()
  const { theme, toggle } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const location = useLocation()
  const toast = useToast()

  // ออกจากระบบอัตโนมัติเมื่อไม่ได้ใช้งาน — ทดแทน Inactivity timeout ที่เป็น Pro-only
  const onIdleTimeout = useCallback(() => {
    void signOut()
    toast.info('ออกจากระบบอัตโนมัติ เนื่องจากไม่มีการใช้งานเป็นเวลา 30 นาที')
  }, [signOut, toast])
  const idle = useIdleLogout(!!user, onIdleTimeout)

  return (
    <div className="min-h-dvh bg-brand-50 dark:bg-slate-950">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2"
      >
        ข้ามไปยังเนื้อหาหลัก
      </a>

      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="flex h-16 items-center gap-3 px-3 sm:px-4">
          <button
            type="button"
            className="btn-secondary !min-h-[40px] !px-3 lg:hidden"
            aria-label={sidebarOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
            aria-expanded={sidebarOpen}
            aria-controls="sidebar"
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <BarsIcon />
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white sm:text-base">
              ระบบบริหารจัดการค่าสอนรายวิชา
            </p>
            <p className="hidden truncate text-xs text-slate-500 dark:text-slate-400 sm:block">
              วิทยาลัยพยาบาลบรมราชชนนี กรุงเทพ
            </p>
          </div>

          <button
            type="button"
            onClick={toggle}
            className="btn-secondary !min-h-[40px] !px-3"
            aria-label={theme === 'dark' ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
          >
            <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
            <span className="hidden sm:inline">{theme === 'dark' ? 'สว่าง' : 'มืด'}</span>
          </button>

          <button type="button" onClick={() => setLogoutOpen(true)} className="btn-secondary !min-h-[40px] !px-3">
            <span className="hidden sm:inline">ออกจากระบบ</span>
            <span className="sm:hidden" aria-hidden="true">⏻</span>
            <span className="sr-only sm:hidden">ออกจากระบบ</span>
          </button>
        </div>
      </header>

      <div className="flex">
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-slate-900/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        <nav
          id="sidebar"
          aria-label="เมนูหลัก"
          className={[
            'no-print fixed inset-y-0 left-0 z-30 w-72 overflow-y-auto border-r border-slate-200 bg-white pt-16',
            'transition-transform dark:border-slate-800 dark:bg-slate-900',
            'lg:sticky lg:top-16 lg:z-0 lg:h-[calc(100dvh-4rem)] lg:translate-x-0 lg:pt-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          ].join(' ')}
        >
          <div className="border-b border-slate-200 p-4 dark:border-slate-800">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
              {[user?.prefix, user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
              {user ? ROLE_LABEL[user.role_code] : ''}
            </p>
          </div>

          <ul className="space-y-1 p-3">
            {visibleMenu.map((node) => (
              <li key={node.key}>
                {node.children ? (
                  <>
                    <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {node.label}
                    </p>
                    <ul className="space-y-1">
                      {node.children.map((child) => (
                        <li key={child.key}>
                          <MenuLink to={child.path} label={child.label} onNavigate={() => setSidebarOpen(false)} />
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <MenuLink to={node.path} label={node.label} onNavigate={() => setSidebarOpen(false)} />
                )}
              </li>
            ))}
            {visibleMenu.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-500">ยังไม่ได้รับสิทธิ์เข้าถึงเมนูใด</li>
            )}
          </ul>
        </nav>

        <main id="main" className="min-w-0 flex-1 p-3 sm:p-5" key={location.pathname}>
          <Outlet />
        </main>
      </div>

      {idle.warning && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="idle-title"
          className="no-print fixed inset-0 z-[58] flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="card w-full max-w-sm p-6">
            <h2 id="idle-title" className="text-base font-semibold text-slate-900 dark:text-white">
              กำลังจะออกจากระบบอัตโนมัติ
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              ไม่มีการใช้งานมาสักพัก ระบบจะออกจากระบบให้ใน{' '}
              <span className="font-semibold tabular-nums">{idle.secondsLeft}</span> วินาที
              เพื่อไม่ให้ข้อมูลค้างบนหน้าจอเมื่อไม่มีคนอยู่ที่เครื่อง
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setLogoutOpen(false); void signOut() }}
              >
                ออกจากระบบเลย
              </button>
              <button type="button" className="btn-primary sm:min-w-[150px]" onClick={idle.reset} autoFocus>
                ยังใช้งานอยู่
              </button>
            </div>
          </div>
        </div>
      )}

      <LogoutDialog
        open={logoutOpen}
        onCancel={() => setLogoutOpen(false)}
        onConfirm={() => {
          setLogoutOpen(false)
          void signOut()
        }}
      />
    </div>
  )
}

function MenuLink({ to, label, onNavigate }: { to: string; label: string; onNavigate: () => void }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        [
          'flex min-h-[44px] items-center rounded-lg px-3 text-sm transition-colors',
          isActive
            ? 'bg-brand-600 font-medium text-white'
            : 'text-slate-700 hover:bg-brand-50 dark:text-slate-300 dark:hover:bg-slate-800',
        ].join(' ')
      }
    >
      {label}
    </NavLink>
  )
}

function BarsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
    </svg>
  )
}
