import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { AppLayout } from '@/components/AppLayout'
import { DashboardPage } from '@/pages/DashboardPage'
import { CoursesPage } from '@/pages/master/CoursesPage'
import { OfferingsPage } from '@/pages/master/OfferingsPage'
import { PayeesPage } from '@/pages/master/PayeesPage'
import { CoordinatorsPage } from '@/pages/master/CoordinatorsPage'
import { SitesPage } from '@/pages/master/SitesPage'
import { BudgetPage } from '@/pages/master/BudgetPage'
import { VouchersPage } from '@/pages/docs/VouchersPage'
import { VoucherEditorPage } from '@/pages/docs/VoucherEditorPage'
import { CoverSheetsPage } from '@/pages/docs/CoverSheetsPage'
import { CoverSheetEditorPage } from '@/pages/docs/CoverSheetEditorPage'
import { ChecklistsPage } from '@/pages/docs/ChecklistsPage'
import { FinanceStatusPage } from '@/pages/finance/FinanceStatusPage'
import { AuditPage } from '@/pages/settings/AuditPage'
import { ReferencePage } from '@/pages/settings/ReferencePage'
import { UsersPage } from '@/pages/settings/UsersPage'
import { PermissionsPage } from '@/pages/settings/PermissionsPage'

export default function App() {
  return (
    <ProtectedRoute>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />

          <Route path="master/courses" element={<CoursesPage />} />
          <Route path="master/offerings" element={<OfferingsPage />} />
          <Route path="master/lecturers" element={<PayeesPage kind="special_lecturer" />} />
          <Route path="master/preceptors" element={<PayeesPage kind="preceptor" />} />
          <Route path="master/coordinators" element={<CoordinatorsPage />} />
          <Route path="master/sites" element={<SitesPage />} />
          <Route path="master/budget" element={<BudgetPage />} />

          <Route path="docs/vouchers" element={<VouchersPage />} />
          <Route path="docs/vouchers/:id" element={<VoucherEditorPage />} />
          <Route path="docs/cover-sheets" element={<CoverSheetsPage />} />
          <Route path="docs/cover-sheets/:id" element={<CoverSheetEditorPage />} />
          <Route path="docs/checklists" element={<ChecklistsPage />} />

          <Route path="finance/status" element={<FinanceStatusPage />} />

          <Route path="settings/users" element={<UsersPage />} />
          <Route path="settings/permissions" element={<PermissionsPage />} />
          <Route path="settings/reference" element={<ReferencePage />} />
          <Route path="settings/audit" element={<AuditPage />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ProtectedRoute>
  )
}
