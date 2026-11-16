import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Ms } from '@/components/ds'
import { useApiFetch } from '@/lib/api'
import type { ScriptPage } from '@/types/scripts'

/** "New page for…" a client, then open it at `${base}/${clientId}`. */
export function NewPage({ available, base }: { available: { id: string; name: string }[]; base: string }) {
  const apiFetch = useApiFetch()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [clientId, setClientId] = useState('')
  const create = useMutation({
    mutationFn: (id: string) => apiFetch<ScriptPage>('/api/scripts/pages', { method: 'POST', body: JSON.stringify({ clientId: id }) }),
    onSuccess: (p) => { qc.setQueryData(['scripts', 'page', p.client.id], p); qc.invalidateQueries({ queryKey: ['scripts'], exact: true }); navigate(`${base}/${p.client.id}`) },
    onError: (e) => toast.error((e as Error)?.message ?? 'Something went wrong'),
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
