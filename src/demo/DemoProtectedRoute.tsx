import { Navigate, useLocation } from 'react-router-dom'
import { useDemoAuth } from './DemoAuthContext'
import type { UserRole } from '@/types'

interface Props {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}

const ROLE_HOME: Record<UserRole, string> = {
  admin: '/admin',
  team: '/team',
  client: '/workspace',
}

export function DemoProtectedRoute({ children, allowedRoles }: Props) {
  const { profile } = useDemoAuth()
  const location = useLocation()

  if (!profile) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to={ROLE_HOME[profile.role]} replace />
  }

  return <>{children}</>
}
