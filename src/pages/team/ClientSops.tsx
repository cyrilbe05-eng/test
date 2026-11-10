import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useClientBrief } from '@/hooks/useOnboarding'
import { ClientBrief } from '@/components/onboarding/ClientBrief'
import { TeamLayout } from '@/components/workspace/TeamLayout'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { cn } from '@/lib/utils'
import type { Profile } from '@/types'

// SOPs tab (team + admins): every client, and one client's Miro board, SOPs
// and style. Desktop: list beside the brief. Phone: list, then the brief.

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

  return (
    <Layout>
      <main className="px-4 md:px-6 py-5 md:py-6 max-w-6xl">
        <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] items-start">
          <section className={cn('clay-card p-3 min-w-0', clientId && 'hidden lg:block')}>
            <h1 className="text-xl font-heading font-semibold tracking-tight px-1 mb-2">SOPs</h1>
            {(clients?.length ?? 0) > 8 && (
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search clients"
                className="w-full h-11 px-3 mb-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            )}
            <ul className="space-y-0.5">
              {shown.map((c) => (
                <li key={c.id}>
                  <Link to={`${base}/${c.id}`}
                    className={cn('flex items-center min-h-[44px] px-3 rounded-lg text-sm hover:bg-muted', c.id === clientId && 'bg-primary/10 text-primary font-medium')}>
                    <span className="truncate">{c.full_name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {clientId ? (
            <div className="space-y-4 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <Link to={base} aria-label="All clients" className="lg:hidden w-11 h-11 -ml-2 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </Link>
                <h2 className="text-xl font-heading font-semibold tracking-tight truncate">{client?.full_name ?? ''}</h2>
              </div>
              {isLoading ? (
                <div className="flex justify-center py-16"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
              ) : brief ? (
                <ClientBrief brief={brief} wide />
              ) : null}
            </div>
          ) : null}
        </div>
      </main>
    </Layout>
  )
}
