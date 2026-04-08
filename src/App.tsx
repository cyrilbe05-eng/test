import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'

// ─── Demo mode imports ────────────────────────────────────────────────────────
import { DemoAuthProvider, useDemoAuth } from '@/demo/DemoAuthContext'
import { DemoProtectedRoute } from '@/demo/DemoProtectedRoute'
import DemoLogin from '@/demo/DemoLogin'
import DemoAdminProjects from '@/demo/pages/DemoAdminProjects'
import DemoAdminProjectDetail from '@/demo/pages/DemoAdminProjectDetail'
import DemoAdminUsers from '@/demo/pages/DemoAdminUsers'
import DemoAdminAnalytics from '@/demo/pages/DemoAdminAnalytics'
import DemoAdminPlans from '@/demo/pages/DemoAdminPlans'
import DemoClientWorkspace from '@/demo/pages/DemoClientWorkspace'
import DemoClientNewProject from '@/demo/pages/DemoClientNewProject'
import DemoClientProjectDetail from '@/demo/pages/DemoClientProjectDetail'
import DemoTeamDashboard from '@/demo/pages/DemoTeamDashboard'
import DemoTeamProjectDetail from '@/demo/pages/DemoTeamProjectDetail'
import DemoClientGallery from '@/demo/pages/DemoClientGallery'
import DemoTeamGallery from '@/demo/pages/DemoTeamGallery'
import DemoTeamStats from '@/demo/pages/DemoTeamStats'
import DemoAdminGallery from '@/demo/pages/DemoAdminGallery'
import DemoMessagesPage from '@/demo/pages/DemoMessagesPage'
import DemoAdminCalendar from '@/demo/pages/DemoAdminCalendar'
import DemoTeamCalendar from '@/demo/pages/DemoTeamCalendar'
import DemoClientCalendar from '@/demo/pages/DemoClientCalendar'
import DemoClientAnalytics from '@/demo/pages/DemoClientAnalytics'

// ─── Production imports ───────────────────────────────────────────────────────
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import Login from '@/pages/Login'
import ChangePassword from '@/pages/ChangePassword'
import AdminProjects from '@/pages/admin/AdminProjects'
import AdminProjectDetail from '@/pages/admin/AdminProjectDetail'
import AdminUserManagement from '@/pages/admin/AdminUserManagement'
import AdminAnalytics from '@/pages/admin/AdminAnalytics'
import AdminLibrary from '@/pages/admin/AdminLibrary'
import AdminPlans from '@/pages/admin/AdminPlans'
import ClientWorkspace from '@/pages/workspace/ClientWorkspace'
import ClientNewProject from '@/pages/workspace/ClientNewProject'
import ClientProjectDetail from '@/pages/workspace/ClientProjectDetail'
import TeamDashboard from '@/pages/team/TeamDashboard'
import TeamProjectDetail from '@/pages/team/TeamProjectDetail'
import AdminGallery from '@/pages/admin/AdminGallery'
import AdminMessages from '@/pages/admin/AdminMessages'
import AdminCalendar from '@/pages/admin/AdminCalendar'
import TeamGallery from '@/pages/team/TeamGallery'
import TeamMessages from '@/pages/team/TeamMessages'
import TeamCalendar from '@/pages/team/TeamCalendar'
import TeamStats from '@/pages/team/TeamStats'
import ClientGallery from '@/pages/workspace/ClientGallery'
import ClientMessages from '@/pages/workspace/ClientMessages'
import ClientCalendar from '@/pages/workspace/ClientCalendar'
import ClientAnalytics from '@/pages/workspace/ClientAnalytics'

// ─── Impersonation Banner ─────────────────────────────────────────────────────
function ImpersonationBanner() {
  const { profile, impersonating, stopImpersonating } = useDemoAuth()
  const navigate = useNavigate()
  if (!impersonating) return null
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-amber-500 text-white px-5 py-2.5 rounded-2xl shadow-2xl text-sm font-medium animate-slide-up">
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
      <span>Viewing as <strong>{profile?.full_name}</strong></span>
      <button
        onClick={() => { stopImpersonating(); navigate('/admin/users') }}
        className="ml-2 flex items-center gap-1.5 bg-white/20 hover:bg-white/30 transition-colors px-3 py-1 rounded-lg text-xs font-semibold"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
        </svg>
        Back to Admin
      </button>
    </div>
  )
}

// ─── Demo App ─────────────────────────────────────────────────────────────────
function DemoApp() {
  return (
    <DemoAuthProvider>
      <BrowserRouter>
        <ImpersonationBanner />
        <Routes>
          <Route path="/login" element={<DemoLogin />} />

          <Route path="/admin" element={<DemoProtectedRoute allowedRoles={['admin']}><DemoAdminProjects /></DemoProtectedRoute>} />
          <Route path="/admin/projects/:id" element={<DemoProtectedRoute allowedRoles={['admin']}><DemoAdminProjectDetail /></DemoProtectedRoute>} />
          <Route path="/admin/users" element={<DemoProtectedRoute allowedRoles={['admin']}><DemoAdminUsers /></DemoProtectedRoute>} />
          <Route path="/admin/analytics" element={<DemoProtectedRoute allowedRoles={['admin']}><DemoAdminAnalytics /></DemoProtectedRoute>} />
          <Route path="/admin/library" element={<DemoProtectedRoute allowedRoles={['admin']}><DemoAdminGallery /></DemoProtectedRoute>} />
          <Route path="/admin/plans" element={<DemoProtectedRoute allowedRoles={['admin']}><DemoAdminPlans /></DemoProtectedRoute>} />
          <Route path="/admin/messages" element={<DemoProtectedRoute allowedRoles={['admin']}><DemoMessagesPage /></DemoProtectedRoute>} />
          <Route path="/admin/calendar" element={<DemoProtectedRoute allowedRoles={['admin']}><DemoAdminCalendar /></DemoProtectedRoute>} />
          <Route path="/admin/gallery" element={<DemoProtectedRoute allowedRoles={['admin']}><DemoAdminGallery /></DemoProtectedRoute>} />

          <Route path="/workspace" element={<DemoProtectedRoute allowedRoles={['client']}><DemoClientWorkspace /></DemoProtectedRoute>} />
          <Route path="/workspace/new" element={<DemoProtectedRoute allowedRoles={['client']}><DemoClientNewProject /></DemoProtectedRoute>} />
          <Route path="/workspace/gallery" element={<DemoProtectedRoute allowedRoles={['client']}><DemoClientGallery /></DemoProtectedRoute>} />
          <Route path="/workspace/projects/:id" element={<DemoProtectedRoute allowedRoles={['client']}><DemoClientProjectDetail /></DemoProtectedRoute>} />
          <Route path="/workspace/messages" element={<DemoProtectedRoute allowedRoles={['client']}><DemoMessagesPage /></DemoProtectedRoute>} />
          <Route path="/workspace/calendar" element={<DemoProtectedRoute allowedRoles={['client']}><DemoClientCalendar /></DemoProtectedRoute>} />
          <Route path="/workspace/analytics" element={<DemoProtectedRoute allowedRoles={['client']}><DemoClientAnalytics /></DemoProtectedRoute>} />

          <Route path="/team" element={<DemoProtectedRoute allowedRoles={['team']}><DemoTeamDashboard /></DemoProtectedRoute>} />
          <Route path="/team/stats" element={<DemoProtectedRoute allowedRoles={['team']}><DemoTeamStats /></DemoProtectedRoute>} />
          <Route path="/team/projects/:id" element={<DemoProtectedRoute allowedRoles={['team']}><DemoTeamProjectDetail /></DemoProtectedRoute>} />
          <Route path="/team/messages" element={<DemoProtectedRoute allowedRoles={['team']}><DemoMessagesPage /></DemoProtectedRoute>} />
          <Route path="/team/calendar" element={<DemoProtectedRoute allowedRoles={['team']}><DemoTeamCalendar /></DemoProtectedRoute>} />
          <Route path="/team/gallery" element={<DemoProtectedRoute allowedRoles={['team']}><DemoTeamGallery /></DemoProtectedRoute>} />

          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </DemoAuthProvider>
  )
}

// ─── Production App ───────────────────────────────────────────────────────────
function ProductionApp() {
  return (
    <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />

          <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><AdminProjects /></ProtectedRoute>} />
          <Route path="/admin/projects/:id" element={<ProtectedRoute allowedRoles={['admin']}><AdminProjectDetail /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute allowedRoles={['admin']}><AdminUserManagement /></ProtectedRoute>} />
          <Route path="/admin/analytics" element={<ProtectedRoute allowedRoles={['admin']}><AdminAnalytics /></ProtectedRoute>} />
          <Route path="/admin/library" element={<ProtectedRoute allowedRoles={['admin']}><AdminLibrary /></ProtectedRoute>} />
          <Route path="/admin/plans" element={<ProtectedRoute allowedRoles={['admin']}><AdminPlans /></ProtectedRoute>} />
          <Route path="/admin/gallery" element={<ProtectedRoute allowedRoles={['admin']}><AdminGallery /></ProtectedRoute>} />
          <Route path="/admin/messages" element={<ProtectedRoute allowedRoles={['admin']}><AdminMessages /></ProtectedRoute>} />
          <Route path="/admin/calendar" element={<ProtectedRoute allowedRoles={['admin']}><AdminCalendar /></ProtectedRoute>} />

          <Route path="/workspace" element={<ProtectedRoute allowedRoles={['client']}><ClientWorkspace /></ProtectedRoute>} />
          <Route path="/workspace/new" element={<ProtectedRoute allowedRoles={['client']}><ClientNewProject /></ProtectedRoute>} />
          <Route path="/workspace/projects/:id" element={<ProtectedRoute allowedRoles={['client']}><ClientProjectDetail /></ProtectedRoute>} />
          <Route path="/workspace/gallery" element={<ProtectedRoute allowedRoles={['client']}><ClientGallery /></ProtectedRoute>} />
          <Route path="/workspace/messages" element={<ProtectedRoute allowedRoles={['client']}><ClientMessages /></ProtectedRoute>} />
          <Route path="/workspace/calendar" element={<ProtectedRoute allowedRoles={['client']}><ClientCalendar /></ProtectedRoute>} />
          <Route path="/workspace/analytics" element={<ProtectedRoute allowedRoles={['client']}><ClientAnalytics /></ProtectedRoute>} />

          <Route path="/team" element={<ProtectedRoute allowedRoles={['team']}><TeamDashboard /></ProtectedRoute>} />
          <Route path="/team/projects/:id" element={<ProtectedRoute allowedRoles={['team']}><TeamProjectDetail /></ProtectedRoute>} />
          <Route path="/team/gallery" element={<ProtectedRoute allowedRoles={['team']}><TeamGallery /></ProtectedRoute>} />
          <Route path="/team/messages" element={<ProtectedRoute allowedRoles={['team']}><TeamMessages /></ProtectedRoute>} />
          <Route path="/team/calendar" element={<ProtectedRoute allowedRoles={['team']}><TeamCalendar /></ProtectedRoute>} />
          <Route path="/team/stats" element={<ProtectedRoute allowedRoles={['team']}><TeamStats /></ProtectedRoute>} />

          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    </BrowserRouter>
  )
}

function RootRedirect() {
  return (
    <ProtectedRoute>
      <Navigate to="/workspace" replace />
    </ProtectedRoute>
  )
}

export default function App() {
  return DEMO_MODE ? <DemoApp /> : <ProductionApp />
}
