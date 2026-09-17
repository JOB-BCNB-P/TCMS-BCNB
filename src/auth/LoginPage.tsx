import { useAuth } from './AuthProvider'

export function LoginPage() {
  const { signInWithGoogle, error, pendingApproval, signOut } = useAuth()

  if (pendingApproval) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
          บัญชีของท่านยังไม่ถูกเปิดใช้งาน
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          ท่านเข้าสู่ระบบด้วยบัญชีของวิทยาลัยเรียบร้อยแล้ว
          แต่ผู้ดูแลระบบยังไม่ได้กำหนดบทบาทและเปิดสิทธิ์การใช้งาน
          กรุณาติดต่อผู้รับผิดชอบการเบิกจ่ายค่าสอนเพื่อขอเปิดสิทธิ์
        </p>
        <button type="button" onClick={() => void signOut()} className="btn-secondary mt-6 w-full">
          ออกจากระบบ
        </button>
      </Shell>
    )
  }

  return (
    <Shell>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
        ระบบบริหารจัดการค่าสอนรายวิชา
      </h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        วิทยาลัยพยาบาลบรมราชชนนี กรุงเทพ
      </p>

      {error && (
        <div
          role="alert"
          className="mt-5 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200"
        >
          <span aria-hidden="true">⚠ </span>
          {error}
        </div>
      )}

      <button type="button" onClick={() => void signInWithGoogle()} className="btn-primary mt-6 w-full">
        <GoogleMark />
        เข้าสู่ระบบด้วยบัญชี @bcn.ac.th
      </button>

      <p className="mt-4 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        ระบบอนุญาตเฉพาะบัญชี Google Workspace ของวิทยาลัยเท่านั้น
        ผู้ใช้ใหม่ต้องได้รับการกำหนดบทบาทจากผู้ดูแลระบบก่อนจึงจะเข้าใช้งานได้
      </p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-brand-50 p-4 dark:bg-slate-950">
      <div className="card w-full max-w-sm p-6 sm:p-8">
        <div
          className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white"
          aria-hidden="true"
        >
          TC
        </div>
        {children}
      </div>
    </main>
  )
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.2 5.2C37 40.2 44 35 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  )
}
