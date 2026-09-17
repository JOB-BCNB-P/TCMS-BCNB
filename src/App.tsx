import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { AppLayout } from '@/components/AppLayout'
import { DashboardPage } from '@/pages/DashboardPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'

export default function App() {
  return (
    <ProtectedRoute>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />

          <Route path="master/courses" element={<PlaceholderPage title="รายวิชา" />} />
          <Route path="master/lecturers" element={<PlaceholderPage title="อาจารย์พิเศษ" note="เลขที่บัญชีธนาคารจะเรียกดูได้เฉพาะผู้ดูแลระบบและเจ้าหน้าที่งานการเงิน บทบาทอื่นเห็นเป็นจุดสีเขียวเมื่อมีข้อมูลแล้ว" />} />
          <Route path="master/preceptors" element={<PlaceholderPage title="อาจารย์แหล่งฝึก" />} />
          <Route path="master/coordinators" element={<PlaceholderPage title="ผู้ประสานงานรายวิชา" />} />
          <Route path="master/sites" element={<PlaceholderPage title="แหล่งฝึกปฏิบัติการ" />} />
          <Route path="master/budget" element={<PlaceholderPage title="หมวดเงินและวงเงินรายวิชา" />} />

          <Route path="docs/vouchers" element={<PlaceholderPage title="สร้างใบเบิก" note="แบบ FM2.2-03 หลักฐานการเบิกจ่ายเงินค่าสอนพิเศษและค่าสอนเกินภาระงานสอน" />} />
          <Route path="docs/cover-sheets" element={<PlaceholderPage title="หน้างบใบสำคัญค่าสอนพิเศษประกอบฎีกา" />} />
          <Route path="docs/checklists" element={<PlaceholderPage title="ใบเช็คลิสต์การเบิกจ่าย" />} />

          <Route path="finance/status" element={<PlaceholderPage title="ปรับสถานะการเบิกจ่าย" />} />

          <Route path="settings/users" element={<PlaceholderPage title="จัดการผู้ใช้งาน" />} />
          <Route path="settings/permissions" element={<PlaceholderPage title="สิทธิ์การเข้าถึงของแต่ละบทบาท" note="ตารางนี้ควบคุมการแสดงเมนูเท่านั้น สิทธิ์จริงบังคับที่ RLS ของฐานข้อมูล" />} />
          <Route path="settings/reference" element={<PlaceholderPage title="ปีการศึกษา/ภาคการศึกษา/ปีงบประมาณ" />} />
          <Route path="settings/audit" element={<PlaceholderPage title="ร่องรอยการใช้งาน" />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ProtectedRoute>
  )
}
