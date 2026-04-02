import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import type { UserRole } from '@/types'

interface Props {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}

export function ProtectedRoute({ children, allowedRoles }: Props) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!user || !profile) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Force password change on first login
  if (!profile.password_changed && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  // Role guard
  if (allowedRoles && !allowedRoles.includes(profile.role as UserRole)) {
    const roleHome: Record<UserRole, string> = {
      admin: '/admin',
      team: '/team',
      client: '/workspace',
    }
    return <Navigate to={roleHome[profile.role as UserRole]} replace />
  }

  return <>{children}</>
}
