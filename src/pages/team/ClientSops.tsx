import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useClientBrief } from '@/hooks/useOnboarding'
import { Answer } from '@/components/onboarding/OnboardingAnswers'
import { TeamLayout } from '@/components/workspace/TeamLayout'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { ClientMark, Ms } from '@/components/ds'
import { cn } from '@/lib/utils'
import type { Profile } from '@/types'
import type { Brief } from '@/types/onboarding'

// SOPs tab (team + admins): every client, and one client's Miro board, SOPs
// and style. No client picked: a grid of clients. A client picked: the list on
// the left (desktop), the client on the right. Phone: list, then the client.

function Search({ q, setQ }: { q: string; setQ: (v: string) => void }) {
  return (
    <label className="ds-find" style={{ width: '100%', maxWidth: 260 }}>
      <Ms name="search" style={{ fontSize: 18, width: 18 }} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search clients" type="search" />
    </label>
  )
}

function ClientView({ client, brief, back }: { client?: Profile; brief: Brief; back: string }) {
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex items-center gap-3 min-w-0" style={{ animation: 'ds-fade .5s cubic-bezier(.16,1,.3,1) backwards' }}>
        <span className="lg:hidden -ml-2 flex-none"><Link to={back} aria-label="All clients" className="ds-ibtn" style={{ width: 44, height: 44 }}><Ms name="chevron_left" /></Link></span>
        <ClientMark name={client?.full_name ?? '?'} size={36} />
        <h2 className="truncate flex-1" style={{ fontSize: 20, fontWeight: 650, letterSpacing: '-.02em', color: 'var(--strong)' }}>{client?.full_name ?? ''}</h2>
        {brief.miro_url ? (
          <a href={brief.miro_url} target="_blank" rel="noreferrer" aria-label="Miro board" className="ds-ghost-btn ds-tap inline-flex items-center gap-2 flex-none" style={{ textDecoration: 'none' }}>
            <Ms name="dashboard" style={{ fontSize: 18, width: 18, color: 'inherit' }} /><span className="hidden sm:inline">Miro board</span><Ms name="north_east" className="hidden sm:inline-block" style={{ fontSize: 15, width: 15, color: 'var(--faint)' }} />
          </a>
        ) : (
          <span className="flex-none" style={{ fontSize: 13, color: 'var(--faint)' }}>Miro board —</span>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-start">
        <section className="ds-panel" style={{ padding: '18px 20px 10px', animationDelay: '60ms' }}>
          <div className="ds-panel-head">
            <h2>SOPs</h2>
            {brief.sops.length > 0 && <span className="ds-count">{brief.sops.length}</span>}
          </div>
          {brief.sops.length ? (
            <ol>
              {brief.sops.map((s, i) => (
                <li key={s} className="flex gap-4 py-3" style={{ borderTop: i ? '1px solid var(--line)' : 0 }}>
                  <span className="tabular-nums flex-none" style={{ width: 20, fontSize: 12, fontWeight: 600, color: 'var(--faint)', paddingTop: 2 }}>{String(i + 1).padStart(2, '0')}</span>
                  <span className="break-words min-w-0" style={{ fontSize: 14, lineHeight: 1.5 }}>{s}</span>
                </li>
              ))}
            </ol>
          ) : <p className="ds-empty">—</p>}
        </section>

        <section className="ds-panel" style={{ padding: '18px 20px 10px', animationDelay: '120ms' }}>
          <div className="ds-panel-head"><h2>Style</h2></div>
          {brief.style.length ? (
            <dl>
              {brief.style.map((s, i) => (
                <div key={s.question} className="py-3" style={{ borderTop: i ? '1px solid var(--line)' : 0 }}>
                  <dt className="break-words mb-1" style={{ fontSize: 12, color: 'var(--faint)' }}>{s.question}</dt>
                  <dd><Answer q={s} /></dd>
                </div>
              ))}
            </dl>
          ) : <p className="ds-empty">—</p>}
        </section>
      </div>
    </div>
  )
}

export default function ClientSops() {
  const { clientId } = useParams()
  const { profile } = useAuth()
  const apiFetch = useApiFetch()
  const base = profile?.role === 'admin' ? '/admin/sops' : '/team/sops'
  const Layout = profile?.role === 'admin' ? AdminLayout : TeamLayout
  const [q, setQ] = useState('')
  const { data: clients } = useQuery({ queryKey: ['clients'], queryFn: () => apiFetch<Profile[]>('/api/users/clients') })
  const { data: brief, isLoading } = useClientBrief(clientId)
  const client = clients?.find((c) => c.id === clientId)
  const shown = (clients ?? []).filter((c) => c.full_name.toLowerCase().includes(q.trim().toLowerCase()))
  const searchable = (clients?.length ?? 0) > 8

  return (
    <Layout>
      <main className="px-4 md:px-7 pb-10" style={{ maxWidth: 1240 }}>
        <header className={cn('flex items-center gap-3 pt-5 pb-5', clientId && 'hidden lg:flex')}>
          <h1>SOPs</h1>
          <span className="flex-1" />
          {searchable && <Search q={q} setQ={setQ} />}
        </header>

        {!clientId ? (
          <ul className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((c) => (
              <li key={c.id} className="clay-card">
                <Link to={`${base}/${c.id}`} className="flex items-center gap-3 p-4 min-h-[64px] rounded-[inherit]">
                  <ClientMark name={c.full_name} size={32} />
                  <span className="flex-1 truncate" style={{ fontSize: 14, fontWeight: 600, color: 'var(--strong)' }}>{c.full_name}</span>
                  <Ms name="chevron_right" style={{ fontSize: 18, width: 18 }} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] items-start pt-5 lg:pt-0">
            <nav className="hidden lg:block sticky top-5" aria-label="Clients">
              <ul className="space-y-0.5">
                {shown.map((c) => {
                  const on = c.id === clientId
                  return (
                    <li key={c.id}>
                      <Link to={`${base}/${c.id}`} aria-current={on ? 'page' : undefined}
                        className="flex items-center gap-2.5 h-10 px-2.5 rounded-[10px] transition-colors"
                        style={{ background: on ? 'var(--active)' : undefined, color: on ? 'var(--strong)' : 'var(--nav)', fontSize: 13.5, fontWeight: on ? 500 : 400 }}>
                        <ClientMark name={c.full_name} size={20} />
                        <span className="truncate">{c.full_name}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>
            {isLoading ? (
              <div className="flex justify-center py-16"><div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--ds-accent)', borderTopColor: 'transparent' }} /></div>
            ) : brief ? (
              <ClientView key={clientId} client={client} brief={brief} back={base} />
            ) : null}
          </div>
        )}
      </main>
    </Layout>
  )
}
