import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { AppLayout } from '@/components/AppLayout'
import { DashboardPage } from '@/pages/DashboardPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { CoursesPage } from '@/pages/master/CoursesPage'
import { PayeesPage } from '@/pages/master/PayeesPage'
import { CoordinatorsPage } from '@/pages/master/CoordinatorsPage'
import { SitesPage } from '@/pages/master/SitesPage'
import { BudgetPage } from '@/pages/master/BudgetPage'
import { AuditPage } from '@/pages/settings/AuditPage'

export default function App() {
  return (
    <ProtectedRoute>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />

          <Route path="master/courses" element={<CoursesPage />} />
          <Route path="master/lecturers" element={<PayeesPage kind="special_lecturer" />} />
          <Route path="master/preceptors" element={<PayeesPage kind="preceptor" />} />
          <Route path="master/coordinators" element={<CoordinatorsPage />} />
          <Route path="master/sites" element={<SitesPage />} />
          <Route path="master/budget" element={<BudgetPage />} />

          <Route path="docs/vouchers" element={<PlaceholderPage title="สร้างใบเบิก" note="แบบ FM2.2-03 หลักฐานการเบิกจ่ายเงินค่าสอนพิเศษและค่าสอนเกินภาระงานสอน" />} />
          <Route path="docs/cover-sheets" element={<PlaceholderPage title="หน้างบใบสำคัญค่าสอนพิเศษประกอบฎีกา" />} />
          <Route path="docs/checklists" element={<PlaceholderPage title="ใบเช็คลิสต์การเบิกจ่าย" />} />

          <Route path="finance/status" element={<PlaceholderPage title="ปรับสถานะการเบิกจ่าย" />} />

          <Route path="settings/users" element={<PlaceholderPage title="จัดการผู้ใช้งาน" note="ระหว่างนี้เปิดสิทธิ์ผู้ใช้ได้ที่ SQL Editor ของ Supabase ผ่านฟังก์ชัน admin_set_user_role" />} />
          <Route path="settings/permissions" element={<PlaceholderPage title="สิทธิ์การเข้าถึงของแต่ละบทบาท" note="ตารางนี้ควบคุมการแสดงเมนูเท่านั้น สิทธิ์จริงบังคับที่ RLS ของฐานข้อมูล" />} />
          <Route path="settings/reference" element={<PlaceholderPage title="ปีการศึกษา/ภาคการศึกษา/ปีงบประมาณ" />} />
          <Route path="settings/audit" element={<AuditPage />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ProtectedRoute>
  )
}
