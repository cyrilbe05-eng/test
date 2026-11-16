import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { TeamLayout } from '@/components/workspace/TeamLayout'
import { ClientMark, Ms } from '@/components/ds'
import { ScriptPageView } from '@/components/scripts/ScriptPageView'
import { useScriptPage, useScriptsOverview } from '@/hooks/useScripts'
import { useApiFetch } from '@/lib/api'
import type { ScriptPage } from '@/types/scripts'

// Copywriters: Scripts — a page per client (their assigned clients), with
// groups and script toggles.

const errMsg = (e: unknown) => (e as Error)?.message ?? 'Something went wrong'

function NewPage({ available }: { available: { id: string; name: string }[] }) {
  const apiFetch = useApiFetch()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [clientId, setClientId] = useState('')
  const create = useMutation({
    mutationFn: (id: string) => apiFetch<ScriptPage>('/api/scripts/pages', { method: 'POST', body: JSON.stringify({ clientId: id }) }),
    onSuccess: (p) => { qc.setQueryData(['scripts', 'page', p.client.id], p); qc.invalidateQueries({ queryKey: ['scripts'], exact: true }); navigate(`/team/scripts/${p.client.id}`) },
    onError: (e) => toast.error(errMsg(e)),
  })
  if (!available.length) return null
  return (
    <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (clientId) create.mutate(clientId) }}>
      <select value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client" className="ds-tool pr-8" style={{ maxWidth: 220 }}>
        <option value="">New page for…</option>
        {available.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <button type="submit" className="ds-primary" disabled={!clientId || create.isPending}><Ms name="add" style={{ fontSize: 18, width: 18, color: 'inherit' }} />Create</button>
    </form>
  )
}

function PagesList() {
  const { data, isLoading, error } = useScriptsOverview()
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 style={{ fontSize: 24, fontWeight: 650, letterSpacing: '-.02em', color: 'var(--strong)' }}>Scripts</h1>
        {data && <NewPage available={data.available} />}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
      ) : error ? (
        <div className="ds-panel p-6" style={{ fontSize: 13.5 }}>{errMsg(error)}</div>
      ) : !data?.pages.length ? (
        <div className="ds-panel text-center py-14"><p style={{ fontSize: 13.5, color: 'var(--faint)' }}>No script pages yet</p></div>
      ) : (
        <section className="ds-panel" style={{ padding: '6px 14px' }}>
          {data.pages.map((p) => (
            <Link key={p.clientId} to={`/team/scripts/${p.clientId}`} className="ds-hrow" style={{ margin: '0 -4px', minHeight: 60 }}>
              <ClientMark name={p.clientName} size={32} />
              <span className="flex-1 min-w-0">
                <span className="block truncate" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--strong)' }}>{p.clientName}</span>
                <span className="block truncate" style={{ fontSize: 12, color: 'var(--faint)' }}>
                  {p.total} script{p.total === 1 ? '' : 's'}
                  {p.needsChanges ? ` · ${p.needsChanges} needs changes` : ''}
                  {p.inReview ? ` · ${p.inReview} in review` : ''}
                  {p.lastEditAt ? ` · edited ${formatDistanceToNow(new Date(p.lastEditAt), { addSuffix: true })}` : ''}
                </span>
              </span>
              <Ms name="chevron_right" style={{ fontSize: 18, width: 18 }} />
            </Link>
          ))}
        </section>
      )}
    </>
  )
}

function ClientPage({ clientId }: { clientId: string }) {
  const { data, isLoading, error } = useScriptPage(clientId)
  return (
    <>
      <div className="flex items-center gap-2 mb-5">
        <Link to="/team/scripts" aria-label="All script pages" className="ds-ibtn -ml-2 flex-none"><Ms name="arrow_back" /></Link>
        {data && <ClientMark name={data.client.name} size={30} />}
        <h1 className="truncate" style={{ fontSize: 24, fontWeight: 650, letterSpacing: '-.02em', color: 'var(--strong)' }}>{data?.client.name ?? 'Scripts'}</h1>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
      ) : error || !data ? (
        <div className="ds-panel p-6" style={{ fontSize: 13.5 }}>{errMsg(error)}</div>
      ) : (
        <ScriptPageView page={data} isAdmin={false} />
      )}
    </>
  )
}

export default function TeamScripts() {
  const { clientId } = useParams()
  return (
    <TeamLayout>
      <main className="px-4 md:px-6 py-5 md:py-6 max-w-4xl">
        {clientId ? <ClientPage clientId={clientId} /> : <PagesList />}
      </main>
    </TeamLayout>
  )
}
