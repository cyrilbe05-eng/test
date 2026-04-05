import { createContext, useContext, useState, type ReactNode } from 'react'
import { MOCK_PROFILES } from './mockData'
import type { Profile, UserRole } from '@/types'

// Demo credentials — any password works
const DEMO_ACCOUNTS: Record<string, UserRole> = {
  'admin@demo.com': 'admin',
  'client@demo.com': 'client',
  'lucas@demo.com': 'team',
  'sofia@demo.com': 'team',
  'thomas@demo.com': 'client',
}

interface DemoAuthState {
  profile: Profile | null
  loading: boolean
  impersonating: Profile | null   // the real admin profile when impersonating
  signIn: (email: string, password: string) => { error: string | null }
  signOut: () => void
  impersonate: (target: Profile) => void
  stopImpersonating: () => void
}

const DemoAuthContext = createContext<DemoAuthState | null>(null)

export function DemoAuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [impersonating, setImpersonating] = useState<Profile | null>(null)

  const signIn = (email: string, _password: string) => {
    const role = DEMO_ACCOUNTS[email.toLowerCase()]
    if (!role) {
      return { error: 'No demo account found for that email. Try admin@demo.com, client@demo.com, or lucas@demo.com.' }
    }
    const found = MOCK_PROFILES.find((p) => p.email === email.toLowerCase())
    if (!found) return { error: 'Demo profile not found.' }
    setProfile(found)
    setImpersonating(null)
    return { error: null }
  }

  const signOut = () => { setProfile(null); setImpersonating(null) }

  const impersonate = (target: Profile) => {
    setImpersonating(profile)  // save real admin
    setProfile(target)
  }

  const stopImpersonating = () => {
    if (impersonating) {
      setProfile(impersonating)
      setImpersonating(null)
    }
  }

  return (
    <DemoAuthContext.Provider value={{ profile, loading: false, impersonating, signIn, signOut, impersonate, stopImpersonating }}>
      {children}
    </DemoAuthContext.Provider>
  )
}

export function useDemoAuth() {
  const ctx = useContext(DemoAuthContext)
  if (!ctx) throw new Error('useDemoAuth must be used within DemoAuthProvider')
  return ctx
}
