import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import pinguExcited from '@/assets/pingu-excited.png'
import { useSignIn } from '@clerk/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
})
type FormData = z.infer<typeof schema>

const codeSchema = z.object({
  code: z.string().min(6, 'Enter the 6-digit code'),
})
type CodeData = z.infer<typeof codeSchema>

export default function Login() {
  const [loading, setLoading] = useState(false)
  const [needsMfa, setNeedsMfa] = useState(false)
  const { signIn, fetchStatus } = useSignIn()
  const { user, profile, loading: authLoading } = useAuth()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const {
    register: registerCode,
    handleSubmit: handleSubmitCode,
    formState: { errors: codeErrors },
  } = useForm<CodeData>({ resolver: zodResolver(codeSchema) })

  // Already logged in
  if (!authLoading && user && profile) {
    if (!profile.password_changed) return <Navigate to="/change-password" replace />
    const roleHome: Record<string, string> = { admin: '/admin', team: '/team', client: '/workspace' }
    return <Navigate to={roleHome[profile.role] ?? '/workspace'} replace />
  }

  const onSubmit = async (data: FormData) => {
    if (fetchStatus === 'fetching') return
    setLoading(true)

    try {
      const { error } = await signIn!.password({
        identifier: data.email,
        password: data.password,
      })

      if (error) {
        toast.error('Invalid email or password')
        return
      }

      if (signIn!.status === 'complete') {
        await signIn!.finalize()
        window.location.href = '/'
      } else if (signIn!.status === 'needs_second_factor') {
        const { error: mfaError } = await signIn!.mfa.sendEmailCode()
        if (mfaError) {
          toast.error('Failed to send verification code')
          return
        }
        setNeedsMfa(true)
      } else {
        toast.error('Sign-in could not be completed. Please try again.')
      }
    } catch {
      toast.error('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  const onSubmitCode = async (data: CodeData) => {
    setLoading(true)
    try {
      const { error } = await signIn!.mfa.verifyEmailCode({ code: data.code })
      if (error) {
        toast.error('Invalid or expired code')
        return
      }
      if (signIn!.status === 'complete') {
        await signIn!.finalize()
        await new Promise(r => setTimeout(r, 500))
        window.location.href = '/login'
      } else {
        toast.error('Could not verify code. Please try again.')
      }
    } catch {
      toast.error('Invalid or expired code')
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
          {needsMfa ? (
            <form onSubmit={handleSubmitCode(onSubmitCode)} className="space-y-5" autoComplete="off">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Check your email</p>
                <p className="text-xs text-muted-foreground">Enter the 6-digit code sent to your email address.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  {...registerCode('code')}
                  className="w-full px-3.5 py-2.5 bg-muted border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 text-sm transition-all tracking-widest"
                  placeholder="123456"
                />
                {codeErrors.code && <p className="text-destructive text-xs">{codeErrors.code.message}</p>}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-primary rounded-xl text-white font-semibold text-sm shadow-clay hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-1"
              >
                {loading ? 'Verifying…' : 'Verify code'}
              </button>
              <button
                type="button"
                onClick={() => setNeedsMfa(false)}
                className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Back to login
              </button>
            </form>
          ) : (
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
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Access is by invitation only.
        </p>
      </div>
    </div>
  )
}
