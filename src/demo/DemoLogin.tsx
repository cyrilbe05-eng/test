import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDemoAuth } from './DemoAuthContext'
import pinguExcited from '@/assets/pingu-excited.png'
import pinguWave from '@/assets/pingu-wave.png'
import pinguFace from '@/assets/pingu-face.png'

const DEMO_ACCOUNTS = [
  {
    email: 'admin@demo.com',
    role: 'Admin',
    desc: 'Full access — manage projects, team, analytics',
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-700',
  },
  {
    email: 'client@demo.com',
    role: 'Client',
    desc: 'Workspace — submit projects, review & approve videos',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-700',
  },
  {
    email: 'lucas@demo.com',
    role: 'Team',
    desc: 'Editor view — assigned projects, upload deliverables',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-700',
  },
]

export default function DemoLogin() {
  const { signIn } = useDemoAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const result = signIn(email, 'demo')
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    if (email.includes('admin')) navigate('/admin')
    else if (email.includes('client') || email.includes('amelie') || email.includes('thomas')) navigate('/workspace')
    else navigate('/team')
  }

  const quickLogin = (acc: typeof DEMO_ACCOUNTS[0]) => {
    setEmail(acc.email)
    setError('')
    const result = signIn(acc.email, 'demo')
    if (!result.error) {
      if (acc.role === 'Admin') navigate('/admin')
      else if (acc.role === 'Client') navigate('/workspace')
      else navigate('/team')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/40 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative orbs */}
      <div className="absolute top-0 right-0 w-[480px] h-[480px] rounded-full bg-primary/5 blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/3" />
      <div className="absolute bottom-0 left-0 w-[360px] h-[360px] rounded-full bg-secondary/6 blur-3xl pointer-events-none translate-y-1/2 -translate-x-1/3" />

      <div className="w-full max-w-[400px] relative animate-slide-up">

        {/* Demo banner */}
        <div className="mb-6 px-4 py-3 bg-primary/8 border border-primary/20 rounded-2xl text-center">
          <p className="text-primary text-sm font-semibold">✦ Demo Mode</p>
          <p className="text-muted-foreground text-xs mt-0.5">No backend needed — all data is simulated</p>
        </div>

        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <img src={pinguExcited} alt="Pingu Studio" className="w-28 h-28 object-contain mb-2 drop-shadow-xl" />
          <h1 className="text-2xl font-heading font-bold tracking-tight">Pingu Studio</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">Sign in to your account</p>
        </div>

        {/* Quick login buttons */}
        <div className="space-y-2.5 mb-6">
          <p className="text-xs text-muted-foreground text-center font-semibold uppercase tracking-widest mb-3">Quick access</p>
          {DEMO_ACCOUNTS.map((acc, i) => (
            <button
              key={acc.email}
              onClick={() => quickLogin(acc)}
              style={{ animationDelay: `${i * 0.07}s` }}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 clay-card hover:shadow-lg hover:-translate-y-0.5 transition-all text-left group animate-spring-pop"
            >
              <img
                src={i === 0 ? pinguWave : pinguFace}
                alt={acc.role}
                className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{acc.role}</p>
                <p className="text-xs text-muted-foreground truncate">{acc.desc}</p>
              </div>
              <svg
                className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground font-medium">or sign in manually</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Manual form */}
        <div className="clay-card p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError('') }}
                className="w-full px-3.5 py-2.5 bg-muted border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                placeholder="admin@demo.com"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Password</label>
              <input
                type="password"
                defaultValue="demo"
                className="w-full px-3.5 py-2.5 bg-muted border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                placeholder="anything works in demo"
              />
            </div>
            {error && <p className="text-destructive text-xs">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 btn-gradient shadow-clay disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Try: <span className="text-primary font-medium">admin@demo.com</span> · <span className="text-primary font-medium">client@demo.com</span> · <span className="text-primary font-medium">lucas@demo.com</span>
        </p>
      </div>
    </div>
  )
}
