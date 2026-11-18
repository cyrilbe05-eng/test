import { useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ClientLayout } from '@/components/workspace/ClientLayout'
import { useAppSettings } from '@/hooks/useAppSettings'
import { useAuth } from '@/hooks/useAuth'
import { useIsFullPackage } from '@/hooks/useCanCreateVideo'
import { useProjects } from '@/hooks/useProjects'
import { useApiFetch } from '@/lib/api'
import { useUploadManager } from '@/lib/uploadManager'
import { isVideo } from '@/lib/autoTitle'
import { addFiles, applyToAll, clearBatch, editRow, removeRow, retryRow, startAll, useBatch, type BatchRow } from '@/lib/batchUpload'
import { cn } from '@/lib/utils'
import type { Plan, Project } from '@/types'

// Batch upload: many videos at once, one project each (only while the admin
// switch is on). Same look as "New video".

const input = 'w-full min-h-[44px] px-3 bg-muted border border-border rounded-xl text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30'
const clear = 'absolute right-0 w-11 h-11 flex items-center justify-center rounded-xl text-lg leading-none text-muted-foreground hover:text-destructive'
const small = 'min-h-[36px] px-3 inline-flex items-center justify-center rounded-lg border border-border text-xs font-medium hover:bg-muted'

function Row({ r, many, onRetry }: { r: BatchRow; many: boolean; onRetry: () => void }) {
  const [openLink, setOpenLink] = useState(false)
  const [openScript, setOpenScript] = useState(false)
  // Shown when opened, or when it has text (e.g. after "Apply to all").
  const showLink = openLink || !!r.link
  const showScript = openScript || !!r.script
  const editable = r.status === 'ready' || r.status === 'over' || (r.status === 'failed' && !r.key)
  const sending = r.status === 'queued' || r.status === 'uploading' || r.status === 'creating'
  return (
    <li className="clay-card p-3 space-y-2.5" data-row={r.file.name}>
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 rounded-xl overflow-hidden bg-muted">
          {r.thumb && <img src={r.thumb} alt="" className="w-full h-full object-cover" />}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <input aria-label="Title" className={input} value={r.title} disabled={!editable} onChange={(e) => editRow(r.id, { title: e.target.value })} />
          <p className="text-xs text-muted-foreground truncate">{r.file.name} · {(r.file.size / 1048576).toFixed(1)} MB</p>
        </div>
        {!sending && r.status !== 'created' && (
          <button type="button" aria-label={`Remove ${r.file.name}`} onClick={() => removeRow(r.id)}
            className="w-11 h-11 -mr-1 -mt-1 flex-shrink-0 rounded-lg text-lg leading-none text-muted-foreground hover:text-destructive hover:bg-muted">×</button>
        )}
      </div>

      {editable && (
        <>
          <textarea aria-label="Notes" rows={2} placeholder="Notes" className={cn(input, 'py-2.5 resize-y')} value={r.notes} onChange={(e) => editRow(r.id, { notes: e.target.value })} />
          {showLink && (
            <div className="relative">
              <input aria-label="Link" type="text" inputMode="url" placeholder="https://" className={cn(input, 'pr-12')} value={r.link} onChange={(e) => editRow(r.id, { link: e.target.value })} />
              <button type="button" aria-label="Remove link" onClick={() => { editRow(r.id, { link: '' }); setOpenLink(false) }} className={clear} style={{ top: 0 }}>×</button>
            </div>
          )}
          {showScript && (
            <div className="relative">
              <textarea aria-label="Script" rows={3} placeholder="Script" className={cn(input, 'py-2.5 pr-12 resize-y')} value={r.script} onChange={(e) => editRow(r.id, { script: e.target.value })} />
              <button type="button" aria-label="Remove script" onClick={() => { editRow(r.id, { script: '' }); setOpenScript(false) }} className={clear} style={{ top: 0 }}>×</button>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {!showLink && <button type="button" className={small} onClick={() => setOpenLink(true)}>+ Link</button>}
            {!showScript && <button type="button" className={small} onClick={() => setOpenScript(true)}>+ Script</button>}
            {many && <button type="button" className={cn(small, 'ml-auto')} onClick={() => applyToAll(r.id)}>Apply to all</button>}
          </div>
        </>
      )}

      {r.status !== 'ready' && (
        <div className="flex items-center gap-3 min-h-[36px]" role="status">
          {(r.status === 'queued' || r.status === 'uploading' || r.status === 'creating') && (
            <>
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(r.progress)}>
                <div className="h-full bg-primary transition-all duration-300" style={{ width: `${r.status === 'queued' ? 0 : r.status === 'creating' ? 100 : r.progress}%` }} />
              </div>
              <span className="text-xs tabular-nums text-muted-foreground w-16 text-right">
                {r.status === 'queued' ? 'Waiting' : r.status === 'creating' ? '100%' : `${Math.round(r.progress)}%`}
              </span>
            </>
          )}
          {r.status === 'created' && (
            <>
              <span className="flex-1 text-sm font-medium text-emerald-700 dark:text-emerald-300">Created</span>
              <Link to={`/workspace/projects/${r.projectId}`} className={small}>Open</Link>
            </>
          )}
          {r.status === 'failed' && (
            <>
              <span className="flex-1 text-sm text-destructive truncate">{r.error}</span>
              <button type="button" className={small} onClick={onRetry}>Retry</button>
            </>
          )}
          {r.status === 'over' && <span className="flex-1 text-sm text-muted-foreground">Video limit reached</span>}
        </div>
      )}
    </li>
  )
}

export default function ClientBatchUpload() {
  const { data: settings, isLoading } = useAppSettings()
  const fullPackage = useIsFullPackage()
  const { profile } = useAuth()
  const apiFetch = useApiFetch()
  const qc = useQueryClient()
  const { data: projects = [] } = useProjects()
  const { data: plan } = useQuery<Plan>({
    queryKey: ['plan', profile?.plan_id],
    queryFn: () => apiFetch<Plan>('/api/plans/' + profile!.plan_id),
    enabled: !!profile?.plan_id,
  })
  const batch = useBatch(profile?.id)
  const { enqueue, tasks, retry } = useUploadManager()
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  if (!isLoading && !settings?.batchUpload) return <Navigate to="/workspace/new" replace />
  if (fullPackage) return <Navigate to="/workspace" replace />

  const rows = batch.owner === profile?.id ? batch.rows : []
  const ready = rows.filter((r) => r.status === 'ready' || r.status === 'over')
  const running = rows.some((r) => r.status === 'queued' || r.status === 'uploading' || r.status === 'creating')
  const finished = rows.length > 0 && !running && !ready.length

  const add = (list: FileList | null) => {
    if (!list?.length || !profile) return
    const all = Array.from(list)
    const videos = all.filter((f) => isVideo(f))
    if (videos.length < all.length) toast.error('Only videos here')
    if (videos.length) addFiles(profile.id, videos)
  }

  const onCreated = () => {
    qc.invalidateQueries({ queryKey: ['projects'] })
    qc.invalidateQueries({ queryKey: ['client', 'dashboard'] })
  }
  const uploadAll = () => {
    if (ready.some((r) => r.title.trim().length < 2)) { toast.error('Title required'); return }
    if (ready.some((r) => r.link.trim() && !/^https?:\/\/\S+$/i.test(r.link.trim()))) { toast.error('Link must start with https://'); return }
    const active = (projects as Project[]).filter((p) => p.status !== 'client_approved').length
    const slots = !plan || plan.max_active_projects === -1 ? Infinity : Math.max(0, plan.max_active_projects - active)
    startAll(enqueue, apiFetch, slots, onCreated)
  }

  return (
    <ClientLayout>
      <main className="max-w-2xl px-4 md:px-6 pt-5 pb-40 md:py-8 space-y-4">
        <h1 className="text-xl md:text-2xl font-heading font-semibold tracking-tight">Batch upload</h1>

        <div
          role="button" tabIndex={0}
          onClick={() => fileInput.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.current?.click() } }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files) }}
          className={cn('rounded-2xl border-2 border-dashed px-4 py-8 md:py-10 text-center cursor-pointer select-none',
            dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-muted/50')}
        >
          <p className={cn('text-sm font-medium', dragging ? 'text-primary' : 'text-muted-foreground')}>
            {dragging ? 'Drop' : <>Drop videos or <span className="text-primary">browse</span></>}
          </p>
        </div>
        <input ref={fileInput} type="file" multiple accept="video/*" hidden aria-label="Videos" onChange={(e) => { add(e.target.files); e.target.value = '' }} />

        {rows.length > 0 && (
          <ul className="space-y-2.5">
            {rows.map((r) => <Row key={r.id} r={r} many={rows.length > 1} onRetry={() => retryRow(r.id, tasks, retry, enqueue, apiFetch, onCreated)} />)}
          </ul>
        )}

        {finished ? (
          <div className="flex gap-2">
            <Link to="/workspace/videos" className="flex-1 min-h-[48px] inline-flex items-center justify-center rounded-xl bg-primary text-white text-sm font-semibold hover:brightness-110">Videos</Link>
            <button type="button" onClick={clearBatch} className="min-h-[48px] px-4 rounded-xl border border-border text-sm font-medium hover:bg-muted">New batch</button>
          </div>
        ) : rows.length > 0 && (
          <button type="button" onClick={uploadAll} disabled={!ready.length}
            className="w-full min-h-[48px] rounded-xl bg-primary text-white text-sm font-semibold hover:brightness-110 disabled:opacity-50">
            {running && !ready.length ? 'Uploading…' : ready.length > 1 ? `Upload all ${ready.length}` : 'Upload'}
          </button>
        )}
      </main>
    </ClientLayout>
  )
}
