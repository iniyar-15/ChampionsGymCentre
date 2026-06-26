import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/context/AuthContext'

import StaffLoginPage from '@/pages/auth/StaffLoginPage'
import StudentLoginPage from '@/pages/auth/StudentLoginPage'
import AppLayout from '@/components/layout/AppLayout'

// Admin pages
import AdminDashboard from '@/pages/admin/AdminDashboard'
import UsersPage from '@/pages/admin/users/UsersPage'
import StudentsPage from '@/pages/admin/students/StudentsPage'
import BatchesPage from '@/pages/admin/batches/BatchesPage'
import LevelsPage from '@/pages/admin/levels/LevelsPage'
import ApparatusPage from '@/pages/admin/apparatus/ApparatusPage'
import SkillsPage from '@/pages/admin/skills/SkillsPage'
import CompetitionsPage from '@/pages/admin/competitions/CompetitionsPage'
import FeeStructuresPage from '@/pages/admin/fees/FeeStructuresPage'
import FeeCollectionPage from '@/pages/admin/fees/FeeCollectionPage'
import ReportsPage from '@/pages/admin/reports/ReportsPage'

// Coach pages
import CoachDashboard from '@/pages/coach/CoachDashboard'
import AttendancePage from '@/pages/coach/AttendancePage'
import CurriculumPage from '@/pages/coach/CurriculumPage'
import FeedbackPage from '@/pages/coach/FeedbackPage'

// Manager pages
import ManagerDashboard from '@/pages/manager/ManagerDashboard'
import ManagerReportsPage from '@/pages/manager/ManagerReportsPage'

// Student pages
import StudentProfilePage from '@/pages/student/StudentProfilePage'
import StudentCompetitionsPage from '@/pages/student/StudentCompetitionsPage'
import StudentFeesPage from '@/pages/student/StudentFeesPage'
import StudentClassesPage from '@/pages/student/StudentClassesPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
})

function ProtectedRoute({ children, allowedTypes }: { children: React.ReactNode; allowedTypes: string[] }) {
  const { appUser, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="text-gray-400">Loading…</div></div>
  if (!appUser) return <Navigate to="/login" replace />
  const userType = appUser.type === 'staff' ? appUser.role : 'student'
  if (!allowedTypes.includes(userType) && !allowedTypes.includes(appUser.type)) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { loading } = useAuth()

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen bg-slate-900"><div className="text-white text-lg">Loading…</div></div>
  }

  return (
    <Routes>
      {/* Auth */}
      <Route path="/login" element={<StaffLoginPage />} />
      <Route path="/login/student" element={<StudentLoginPage />} />

      {/* Admin */}
      <Route path="/admin" element={<ProtectedRoute allowedTypes={['admin', 'manager']}><AppLayout /></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="batches" element={<BatchesPage />} />
        <Route path="levels" element={<LevelsPage />} />
        <Route path="apparatus" element={<ApparatusPage />} />
        <Route path="skills" element={<SkillsPage />} />
        <Route path="competitions" element={<CompetitionsPage />} />
        <Route path="fee-structures" element={<FeeStructuresPage />} />
        <Route path="fee-collection" element={<FeeCollectionPage />} />
        <Route path="reports" element={<ReportsPage />} />
      </Route>

      {/* Coach */}
      <Route path="/coach" element={<ProtectedRoute allowedTypes={['coach']}><AppLayout /></ProtectedRoute>}>
        <Route index element={<CoachDashboard />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="curriculum" element={<CurriculumPage />} />
        <Route path="feedback" element={<FeedbackPage />} />
      </Route>

      {/* Manager */}
      <Route path="/manager" element={<ProtectedRoute allowedTypes={['manager']}><AppLayout /></ProtectedRoute>}>
        <Route index element={<ManagerDashboard />} />
        <Route path="reports" element={<ManagerReportsPage />} />
      </Route>

      {/* Student */}
      <Route path="/student" element={<ProtectedRoute allowedTypes={['student']}><AppLayout /></ProtectedRoute>}>
        <Route index element={<StudentProfilePage />} />
        <Route path="competitions" element={<StudentCompetitionsPage />} />
        <Route path="fees" element={<StudentFeesPage />} />
        <Route path="classes" element={<StudentClassesPage />} />
      </Route>

      {/* Root redirect */}
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function RootRedirect() {
  const { appUser, loading } = useAuth()
  if (loading) return null
  if (!appUser) return <Navigate to="/login" replace />
  if (appUser.type === 'student') return <Navigate to="/student" replace />
  const role = appUser.role
  if (role === 'admin') return <Navigate to="/admin" replace />
  if (role === 'manager') return <Navigate to="/manager" replace />
  if (role === 'coach') return <Navigate to="/coach" replace />
  return <Navigate to="/login" replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}