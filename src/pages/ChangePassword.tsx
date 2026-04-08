import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { useApiFetch } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'
import { getToken } from '@/lib/auth'

const passwordSchema = z
  .string()
  .min(12, 'Minimum 12 characters')
  .regex(/[A-Z]/, 'Must contain uppercase')
  .regex(/[a-z]/, 'Must contain lowercase')
  .regex(/[0-9]/, 'Must contain a number')
  .regex(/[^A-Za-z0-9]/, 'Must contain a symbol')

const schema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: 'Passwords do not match', path: ['confirm'] })

type FormData = z.infer<typeof schema>

export default function ChangePassword() {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { profile } = useAuth()
  const apiFetch = useApiFetch()
  const qc = useQueryClient()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ password: data.password }),
      })
      qc.invalidateQueries({ queryKey: ['profile', getToken()] })
      toast.success('Password updated successfully!')
      const roleHome: Record<string, string> = { admin: '/admin', team: '/team', client: '/workspace' }
      navigate(profile ? roleHome[profile.role] ?? '/workspace' : '/workspace', { replace: true })
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to update password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-[380px] animate-slide-up">
        <div className="flex flex-col items-center mb-10">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center mb-5 shadow-clay">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight">Set your password</h1>
          <p className="text-muted-foreground mt-1.5 text-sm text-center">
            Welcome! Create a secure password to continue.
          </p>
        </div>

        <div className="clay-card p-7">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">New password</label>
              <input
                type="password"
                autoComplete="new-password"
                {...register('password')}
                className="w-full px-3.5 py-2.5 bg-muted border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 text-sm transition-all"
                placeholder="Min 12 chars, mixed case, number, symbol"
              />
              {errors.password && <p className="text-destructive text-xs">{errors.password.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Confirm password</label>
              <input
                type="password"
                autoComplete="new-password"
                {...register('confirm')}
                className="w-full px-3.5 py-2.5 bg-muted border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 text-sm transition-all"
                placeholder="Repeat password"
              />
              {errors.confirm && <p className="text-destructive text-xs">{errors.confirm.message}</p>}
            </div>

            <div className="bg-muted rounded-xl px-4 py-3 space-y-1">
              {['At least 12 characters', 'Uppercase + lowercase', 'At least one number', 'At least one symbol'].map((r) => (
                <p key={r} className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                  {r}
                </p>
              ))}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-primary rounded-xl text-white font-semibold text-sm shadow-clay hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? 'Saving…' : 'Set password & continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
