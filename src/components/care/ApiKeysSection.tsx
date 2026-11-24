import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { useApiFetch } from '@/lib/api'
import { Block } from '@/components/care/Block'

// Upload API keys for one client (full admins). A key lets the client's own
// tools upload videos into this account — nothing else. The full key is shown
// once, right after it's made.

interface ApiKeyRow { id: string; name: string; key_prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null; created_by_name: string | null }
interface ApiKeyEvent { id: string; key_name: string | null; action: string; status: number; detail: string | null; project_id: string | null; created_at: string }

const ACTIONS: Record<string, string> = {
  key_created: 'Key created', key_revoked: 'Key turned off', me: 'Checked key', list: 'Listed uploads',
  upload_start: 'Started upload', upload_parts: 'Asked for more upload addresses', upload_complete: 'Finished upload',
  upload_cancel: 'Cancelled upload', import_start: 'Sent a link', import_folder: 'Sent a Drive folder', check: 'Checked a folder fits', import_done: 'Link downloaded', import_failed: 'Link failed', status: 'Checked status',
}

const ago = (iso: string | null) => (iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : 'never')

export function ApiKeysSection({ clientId }: { clientId: string }) {
  const apiFetch = useApiFetch()
  const qc = useQueryClient()
  const queryKey = ['api_keys', clientId]
  const { data } = useQuery({
    queryKey,
    queryFn: () => apiFetch<{ keys: ApiKeyRow[]; events: ApiKeyEvent[] }>(`/api/api-keys?clientId=${encodeURIComponent(clientId)}`),
  })
  const [name, setName] = useState('')
  const [fresh, setFresh] = useState<{ name: string; key: string } | null>(null)
  const [showLog, setShowLog] = useState(false)

  const create = useMutation({
    mutationFn: () => apiFetch<{ key: string; name: string }>('/api/api-keys', { method: 'POST', body: JSON.stringify({ clientId, name: name.trim() }) }),
    onSuccess: (r) => { setFresh({ name: r!.name, key: r!.key }); setName(''); qc.invalidateQueries({ queryKey }) },
    onError: (e) => toast.error((e as Error).message),
  })
  const revoke = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/api-keys/${id}/revoke`, { method: 'POST' }),
    onSuccess: () => { toast.success('Key turned off'); qc.invalidateQueries({ queryKey }) },
    onError: (e) => toast.error((e as Error).message),
  })

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success('Copied') } catch { toast.error('Could not copy — select the key and copy it') }
  }

  const active = (data?.keys ?? []).filter((k) => !k.revoked_at)
  const off = (data?.keys ?? []).filter((k) => k.revoked_at)

  return (
    <Block title="API keys">
      {fresh && (
        <div className="mb-3 rounded-lg p-3 text-sm" style={{ background: 'var(--panel)', boxShadow: 'inset 0 0 0 1px var(--panel-ring)' }}>
          <p className="font-semibold">Copy “{fresh.name}” now — it won’t be shown again</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 min-w-0 break-all text-xs p-2 rounded-md bg-muted select-all">{fresh.key}</code>
            <button type="button" className="ds-ghost-btn ds-tap flex-shrink-0" onClick={() => copy(fresh.key)}>Copy</button>
          </div>
          <button type="button" className="mt-2 text-xs text-muted-foreground underline" onClick={() => setFresh(null)}>I’ve saved it</button>
        </div>
      )}

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate() }}>
        <input className="ds-field flex-1 min-w-0" placeholder="Key name, e.g. Upload agent" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <button type="submit" className="ds-primary ds-tap flex-shrink-0" disabled={!name.trim() || create.isPending}>{create.isPending ? 'Creating…' : 'Create key'}</button>
      </form>

      {active.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {active.map((k) => (
            <li key={k.id} className="flex items-center gap-2 text-sm">
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">{k.name} <span className="font-mono text-xs text-muted-foreground">{k.key_prefix}…</span></p>
                <p className="text-xs text-muted-foreground">Made {ago(k.created_at)}{k.created_by_name ? ` by ${k.created_by_name}` : ''} · used {ago(k.last_used_at)}</p>
              </div>
              <button type="button" className="ds-ghost-btn ds-tap flex-shrink-0" disabled={revoke.isPending}
                onClick={() => { if (confirm(`Turn off “${k.name}”? Anything using it stops working immediately. This can’t be undone — you can make a new key.`)) revoke.mutate(k.id) }}>
                Turn off
              </button>
            </li>
          ))}
        </ul>
      )}
      {off.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{off.length} turned-off key{off.length > 1 ? 's' : ''}: {off.map((k) => k.name).join(', ')}</p>}

      {(data?.events.length ?? 0) > 0 && (
        <div className="mt-3">
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setShowLog((s) => !s)}>{showLog ? 'Hide activity' : 'Show activity'}</button>
          {showLog && (
            <ul className="mt-2 space-y-1 text-xs">
              {data!.events.map((e) => (
                <li key={e.id} className="flex gap-2">
                  <span className="text-muted-foreground whitespace-nowrap">{ago(e.created_at)}</span>
                  <span className={e.status >= 400 ? 'text-destructive' : ''}>{ACTIONS[e.action] ?? e.action}{e.status >= 400 ? ` (refused ${e.status})` : ''}</span>
                  <span className="truncate text-muted-foreground">{e.key_name ?? ''}{e.detail ? ` · ${e.detail}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Block>
  )
}
