import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import pinguExcited from '@/assets/pingu-excited.png'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { setToken } from '@/lib/auth'
import { useQueryClient } from '@tanstack/react-query'
import type { Profile } from '@/types'

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
})
type FormData = z.infer<typeof schema>

export default function Login() {
  const [loading, setLoading] = useState(false)
  const { user, profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  // Already logged in
  if (!authLoading && user && profile) {
    if (!profile.password_changed) return <Navigate to="/change-password" replace />
    const roleHome: Record<string, string> = { admin: '/admin', team: '/team', client: '/workspace' }
    return <Navigate to={roleHome[profile.role] ?? '/workspace'} replace />
  }

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email, password: data.password }),
      })

      const json = await res.json()

      if (!res.ok) {
        toast.error(json.error ?? 'Invalid email or password')
        return
      }

      setToken(json.token)
      qc.setQueryData(['profile', json.token], json.profile as Profile)

      const roleHome: Record<string, string> = { admin: '/admin', team: '/team', client: '/workspace' }
      const dest = !json.profile.password_changed
        ? '/change-password'
        : roleHome[json.profile.role] ?? '/workspace'
      navigate(dest, { replace: true })
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-[380px] animate-slide-up">
        <div className="flex flex-col items-center mb-10">
          <img src={pinguExcited} alt="Pingu Studio" className="w-24 h-24 object-contain mb-1 drop-shadow-xl" />
          <h1 className="text-2xl font-heading font-semibold text-foreground tracking-tight">Pingu Studio</h1>
          <p className="text-muted-foreground text-sm mt-1.5">Sign in to continue</p>
        </div>

        <div className="clay-card p-7">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Email</label>
              <input
                type="email"
                autoComplete="email"
                {...register('email')}
                className="w-full px-3.5 py-2.5 bg-muted border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 text-sm transition-all"
                placeholder="you@example.com"
              />
              {errors.email && <p className="text-destructive text-xs">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Password</label>
              <input
                type="password"
                autoComplete="current-password"
                {...register('password')}
                className="w-full px-3.5 py-2.5 bg-muted border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 text-sm transition-all"
                placeholder="••••••••••••"
              />
              {errors.password && <p className="text-destructive text-xs">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-primary rounded-xl text-white font-semibold text-sm shadow-clay hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-1"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Access is by invitation only.
        </p>
      </div>
    </div>
  )
}
