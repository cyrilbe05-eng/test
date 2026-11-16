import { Link, useParams, useSearchParams } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { ClientMark, Ms, Segmented } from '@/components/ds'
import { NewPage } from '@/components/scripts/NewPage'
import { ScriptPageView } from '@/components/scripts/ScriptPageView'
import { useAuth } from '@/hooks/useAuth'
import { useScriptActions, useScriptPage, useScriptsOverview } from '@/hooks/useScripts'
import type { Script } from '@/types/scripts'

// Admins (managers included): Script Review — what's waiting on you, every
// client's script page, and Approve / Needs changes on each script.

const errMsg = (e: unknown) => (e as Error)?.message ?? 'Something went wrong'
const ago = (iso: string | null) => (iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : '')

function Overview() {
  const { data, isLoading, error } = useScriptsOverview()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'pages' ? 'pages' : 'review'
  const sort = params.get('sort') === 'client' ? 'client' : 'oldest'
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }) }

  const waiting = [...(data?.waiting ?? [])].sort((a, b) =>
    sort === 'client' ? a.clientName.localeCompare(b.clientName) || a.inReviewAt.localeCompare(b.inReviewAt) : a.inReviewAt.localeCompare(b.inReviewAt))
  const pages = [...(data?.pages ?? [])].sort((a, b) =>
    sort === 'client' ? a.clientName.localeCompare(b.clientName)
      // Oldest waiting first; pages with nothing in review after, by name.
      : (a.oldestInReviewAt ?? '~').localeCompare(b.oldestInReviewAt ?? '~') || a.clientName.localeCompare(b.clientName))

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 style={{ fontSize: 24, fontWeight: 650, letterSpacing: '-.02em', color: 'var(--strong)' }}>Script Review</h1>
        {data && <NewPage available={data.available} base="/admin/scripts" />}
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Segmented label="View" width={104} value={view} onChange={(v) => set('view', v === 'review' ? null : v)}
          options={[{ value: 'review', label: `In review${data?.waiting.length ? ` · ${data.waiting.length}` : ''}` }, { value: 'pages', label: 'All pages' }]} />
        <select value={sort} onChange={(e) => set('sort', e.target.value === 'oldest' ? null : e.target.value)} aria-label="Sort" className="ds-tool pr-8">
          <option value="oldest">Oldest in review</option>
          <option value="client">Client</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
      ) : error ? (
        <div className="ds-panel p-6" style={{ fontSize: 13.5 }}>{errMsg(error)}</div>
      ) : view === 'review' ? (
        waiting.length === 0 ? (
          <div className="ds-panel text-center py-14"><p style={{ fontSize: 13.5, color: 'var(--faint)' }}>Nothing waiting for review</p></div>
        ) : (
          <section className="ds-panel" style={{ padding: '6px 14px' }}>
            {waiting.map((w) => (
              <Link key={w.id} to={`/admin/scripts/${w.clientId}?script=${w.id}`} className="ds-hrow" style={{ margin: '0 -4px', minHeight: 60 }}>
                <ClientMark name={w.clientName} size={32} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="truncate" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--strong)' }}>{w.title}</span>
                    <span className="ds-stype">{w.type}</span>
                  </span>
                  <span className="block truncate" style={{ fontSize: 12, color: 'var(--faint)' }}>{w.clientName} · waiting {ago(w.inReviewAt).replace(' ago', '')}</span>
                </span>
                <Ms name="chevron_right" style={{ fontSize: 18, width: 18 }} />
              </Link>
            ))}
          </section>
        )
      ) : pages.length === 0 ? (
        <div className="ds-panel text-center py-14"><p style={{ fontSize: 13.5, color: 'var(--faint)' }}>No script pages yet</p></div>
      ) : (
        <section className="ds-panel" style={{ padding: '6px 14px' }}>
          {pages.map((p) => (
            <Link key={p.clientId} to={`/admin/scripts/${p.clientId}`} className="ds-hrow" style={{ margin: '0 -4px', minHeight: 60 }}>
              <ClientMark name={p.clientName} size={32} />
              <span className="flex-1 min-w-0">
                <span className="block truncate" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--strong)' }}>{p.clientName}</span>
                <span className="block truncate" style={{ fontSize: 12, color: 'var(--faint)' }}>
                  {p.total} script{p.total === 1 ? '' : 's'}
                  {p.inReview ? ` · ${p.inReview} in review` : ''}
                  {p.needsChanges ? ` · ${p.needsChanges} needs changes` : ''}
                  {p.approved ? ` · ${p.approved} approved` : ''}
                  {p.lastEditAt ? ` · edited ${ago(p.lastEditAt)}` : ''}
                </span>
              </span>
              {p.inReview > 0 && <span className="ds-count flex-none" style={{ color: 'var(--car-t)' }}>{p.inReview}</span>}
              <Ms name="chevron_right" style={{ fontSize: 18, width: 18 }} />
            </Link>
          ))}
        </section>
      )}
    </>
  )
}

/** Approve / Needs changes on one script (Push to calendar comes next). */
function ReviewButtons({ script, clientId }: { script: Script; clientId: string }) {
  const { setStatus } = useScriptActions(clientId)
  if (script.status === 'scheduled') return null
  const go = (status: 'approved' | 'needs_changes') => setStatus.mutate({ id: script.id, status }, {
    onSuccess: () => toast.success(status === 'approved' ? 'Approved' : 'Sent back for changes'),
    onError: (e) => toast.error(errMsg(e)),
  })
  return (
    <>
      {script.status !== 'needs_changes' && script.status !== 'draft' && (
        <button type="button" className="ds-ghost-btn" disabled={setStatus.isPending} onClick={() => go('needs_changes')}>Needs changes</button>
      )}
      {script.status !== 'approved' && (
        <button type="button" className="ds-primary" disabled={setStatus.isPending} onClick={() => go('approved')}>
          <Ms name="check" style={{ fontSize: 17, width: 17, color: 'inherit' }} />Approve
        </button>
      )}
    </>
  )
}

function ClientScripts({ clientId }: { clientId: string }) {
  const { data, isLoading, error } = useScriptPage(clientId)
  const { profile } = useAuth()
  const [params] = useSearchParams()
  return (
    <>
      <div className="flex items-center gap-2 mb-5">
        <Link to="/admin/scripts" aria-label="Script Review" className="ds-ibtn -ml-2 flex-none"><Ms name="arrow_back" /></Link>
        {data && <ClientMark name={data.client.name} size={30} />}
        <h1 className="truncate" style={{ fontSize: 24, fontWeight: 650, letterSpacing: '-.02em', color: 'var(--strong)' }}>{data?.client.name ?? 'Scripts'}</h1>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
      ) : error || !data ? (
        <div className="ds-panel p-6" style={{ fontSize: 13.5 }}>{errMsg(error)}</div>
      ) : (
        <ScriptPageView page={data} isAdmin me={profile?.id ?? ''} focusId={params.get('script')}
          renderFooter={(s) => <ReviewButtons script={s} clientId={clientId} />} />
      )}
    </>
  )
}

export default function AdminScriptReview() {
  const { clientId } = useParams()
  return (
    <AdminLayout>
      <main className="px-4 md:px-6 py-5 md:py-6 max-w-5xl">
        {clientId ? <ClientScripts clientId={clientId} /> : <Overview />}
      </main>
    </AdminLayout>
  )
}
