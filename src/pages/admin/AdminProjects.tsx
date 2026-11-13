import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useProjects } from '@/hooks/useProjects'
import { KanbanBoard } from '@/components/admin/KanbanBoard'
import { useUploadManager } from '@/lib/uploadManager'
import { AdminLayout, HeaderTools } from '@/components/admin/AdminLayout'
import { useApiFetch } from '@/lib/api'
import { useStorageAdapter } from '@/lib/storage'
import { cn, projectTimeLabel, sortByRecentActivity } from '@/lib/utils'
import { statusLabel } from '@/lib/dsStatus'
import { type BoardProject } from '@/lib/board'
import { ClientMark, StatusDot } from '@/components/ds'
import type { Profile } from '@/types'
import { ProjectSearch } from '@/components/admin/ProjectSearch'

type View = 'kanban' | 'list'

// ─── Create Project Modal ────────────────────────────────────────────────────

const createSchema = z.object({
  title: z.string().min(2, 'Title required'),
  client_id: z.string().min(1, 'Client required'),
  inspiration_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  video_script: z.string().optional(),
  instructions: z.string().optional(),
})
type CreateFormData = z.infer<typeof createSchema>

const inputCls = 'ds-field'

function FieldRow({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12.5, color: 'var(--faint)' }}>{label}</label>
      {children}
      {error && <p style={{ margin: 0, fontSize: 12, color: '#E5584B' }}>{error}</p>}
    </div>
  )
}

function DropZone({ label, files, onFiles, onRemove, accept, dragging, onDragChange }: {
  label: string; files: File[]; onFiles: (f: FileList) => void; onRemove: (i: number) => void
  accept?: string; dragging: boolean; onDragChange: (d: boolean) => void
}) {
  return (
    <div>
      <div
        className="ds-slot"
        style={{ height: 72, cursor: 'pointer', ...(dragging ? { borderColor: 'var(--focus)', color: 'var(--ds-accent)' } : {}) }}
        onDragOver={(e) => { e.preventDefault(); onDragChange(true) }}
        onDragLeave={() => onDragChange(false)}
        onDrop={(e) => { e.preventDefault(); onDragChange(false); onFiles(e.dataTransfer.files) }}
        onClick={() => {
          const input = document.createElement('input')
          input.type = 'file'; input.multiple = true; if (accept) input.accept = accept
          input.onchange = (e) => onFiles((e.target as HTMLInputElement).files!)
          input.click()
        }}
      >
        <p style={{ margin: 0, fontSize: 12.5 }}>
          {dragging ? 'Release to upload here' : <>{label} or <span style={{ color: 'var(--ds-accent)', fontWeight: 500 }}>browse</span></>}
        </p>
      </div>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-2" style={{ fontSize: 13, padding: '8px 12px', borderRadius: 10, background: 'var(--panel)', boxShadow: 'inset 0 0 0 1px var(--panel-ring)' }}>
              <span className="flex-1 truncate">{f.name}</span>
              <span style={{ fontSize: 12, color: 'var(--faint)' }}>{(f.size / 1024 / 1024).toFixed(1)} MB</span>
              <button type="button" onClick={() => onRemove(i)} aria-label={`Remove ${f.name}`} className="ds-ibtn" style={{ width: 28, height: 28, fontSize: 18 }}>×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const apiFetch = useApiFetch()
  const storageAdapter = useStorageAdapter()
  const queryClient = useQueryClient()
  const [sourceFiles, setSourceFiles] = useState<File[]>([])
  const [attachments, setAttachments] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [dragTarget, setDragTarget] = useState<'source' | 'attachment' | null>(null)
  const { enqueue } = useUploadManager()

  const { data: users = [] } = useQuery<Profile[]>({
    queryKey: ['users'],
    queryFn: () => apiFetch<Profile[]>('/api/users'),
  })
  const clients = users.filter((u) => u.role === 'client')

  const { register, handleSubmit, formState: { errors } } = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
  })

  const onSubmit = async (data: CreateFormData) => {
    setSubmitting(true)
    try {
      const project = await apiFetch<{ id: string }>('/api/projects/create', {
        method: 'POST',
        body: JSON.stringify({
          title: data.title,
          client_id: data.client_id,
          inspiration_url: data.inspiration_url || null,
          video_script: data.video_script || null,
          instructions: data.instructions || null,
        }),
      })

      // Background queue — the modal closes immediately and the dock carries
      // the transfers (see UploadManagerProvider).
      const projectId = project!.id
      enqueue([
        ...sourceFiles.map((file) => ({ file, fileType: 'source_video' as const })),
        ...attachments.map((file) => ({ file, fileType: 'attachment' as const })),
      ].map(({ file, fileType }) => ({
        file,
        label: `${fileType === 'source_video' ? 'Source video' : 'Supporting file'} · ${data.title}`,
        invalidate: [['project_files', projectId], ['projects']],
        run: ({ onProgress, onConnectionState }) =>
          storageAdapter.upload({ file, projectId, fileType, onProgress, onConnectionState }).then(() => undefined),
      })))

      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success('Project created.')
      navigate(`/admin/projects/${project!.id}`)
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to create project')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="ds-veil" onClick={onClose} />
      <section className="ds-sheet" role="dialog" aria-modal="true" aria-label="New project">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '26px 28px 0' }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 28, fontWeight: 650, letterSpacing: '-.03em', color: 'var(--strong)' }}>New project</h2>
          <button type="button" className="ds-ibtn" aria-label="Close" onClick={onClose} style={{ width: 32, height: 32 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="ds-sheet-in" style={{ padding: '22px 28px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FieldRow label="Project Title" error={errors.title?.message}>
            <input {...register('title')} className={inputCls} placeholder="e.g. Q1 Brand Video" />
          </FieldRow>

          <FieldRow label="Client" error={errors.client_id?.message}>
            <select {...register('client_id')} className={inputCls}>
              <option value="">— select client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.full_name}{c.client_id_label ? ` (${c.client_id_label})` : ''}</option>
              ))}
            </select>
          </FieldRow>

          <FieldRow label="Link to Inspiration Video (optional)" error={errors.inspiration_url?.message}>
            <input type="url" {...register('inspiration_url')} className={inputCls} placeholder="https://youtube.com/watch?v=…" />
          </FieldRow>

          <FieldRow label="Video Script (optional)">
            <textarea {...register('video_script')} rows={3} className={inputCls + ' resize-none'} placeholder="Paste or write the script…" />
          </FieldRow>

          <FieldRow label="Instructions for Editor">
            <textarea {...register('instructions')} rows={3} className={inputCls + ' resize-none'} placeholder="Style, music, references, etc." />
          </FieldRow>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--faint)' }}>Source video</p>
            <DropZone
              label="Drop raw footage here"
              files={sourceFiles}
              onFiles={(f) => setSourceFiles((s) => [...s, ...Array.from(f)])}
              onRemove={(i) => setSourceFiles((s) => s.filter((_, idx) => idx !== i))}
              accept="video/*"
              dragging={dragTarget === 'source'}
              onDragChange={(d) => setDragTarget(d ? 'source' : null)}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--faint)' }}>Attachments (optional)</p>
            <DropZone
              label="Drop logos, scripts, music, etc."
              files={attachments}
              onFiles={(f) => setAttachments((a) => [...a, ...Array.from(f)])}
              onRemove={(i) => setAttachments((a) => a.filter((_, idx) => idx !== i))}
              dragging={dragTarget === 'attachment'}
              onDragChange={(d) => setDragTarget(d ? 'attachment' : null)}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" onClick={onClose} className="ds-ghost-btn">Cancel</button>
            <button type="submit" disabled={submitting} className="ds-primary" style={submitting ? { opacity: 0.6 } : undefined}>
              {submitting ? 'Creating…' : 'Create project'}
            </button>
          </div>
        </form>
      </section>
    </>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AdminProjects() {
  const [view, setView] = useState<View>('kanban')
  const [create, setCreate] = useState(false)
  const { data: projects, isLoading } = useProjects()

  if (isLoading) return <PageLoader />

  return (
    <AdminLayout bare>
      {create && <CreateProjectModal onClose={() => setCreate(false)} />}
      <main className="flex flex-col min-w-0">
        <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '22px 28px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginRight: 8 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 650, letterSpacing: '-.025em', color: 'var(--strong)' }}>Projects</h1>
            <span style={{ fontSize: 14, color: 'var(--faint)' }}>{projects?.length ?? 0}</span>
          </div>
          <div className="ds-seg" role="group" aria-label="View">
            <div className="ds-seg-ind" style={{ transform: `translateX(${view === 'kanban' ? 0 : 76}px)` }} />
            <button type="button" className={cn(view === 'kanban' && 'on')} aria-pressed={view === 'kanban'} onClick={() => setView('kanban')}>Board</button>
            <button type="button" className={cn(view === 'list' && 'on')} aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
          </div>
          <div style={{ flex: 1 }} />
          {/* Find a project by name, client or editor (phones: an icon) */}
          <ProjectSearch />
          <div className="hidden md:block"><HeaderTools /></div>
          <button type="button" className="ds-primary" onClick={() => setCreate(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            New project
          </button>
        </header>

        {view === 'kanban' ? (
          <KanbanBoard projects={(projects ?? []) as BoardProject[]} />
        ) : (
          <ProjectList projects={sortByRecentActivity(projects ?? []) as BoardProject[]} />
        )}
      </main>
    </AdminLayout>
  )
}

/** List view: 52px rows; a row opens the project. */
function ProjectList({ projects }: { projects: BoardProject[] }) {
  const cols = 'minmax(220px,2.4fr) minmax(150px,1.4fr) minmax(150px,1.3fr) minmax(150px,1.3fr) 150px'
  return (
    <div style={{ padding: '4px 16px 40px', overflowX: 'auto' }}>
      <div style={{ minWidth: 760, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 16, padding: '0 20px 10px', fontSize: 12.5, color: 'var(--faint)' }}>
          <span>Project</span><span>Client</span><span>Status</span><span>Editor</span><span style={{ textAlign: 'right' }}>Updated</span>
        </div>
        {projects.map((p, i) => {
          const client = p.profiles?.full_name ?? '—'
          return (
            <Link key={p.id} to={`/admin/projects/${p.id}`} className="ds-lrow" style={{ gridTemplateColumns: cols, animationDelay: `${Math.min(i, 20) * 35}ms` }}>
              <span className="truncate" style={{ fontWeight: 600, color: 'var(--strong)' }}>{p.title}</span>
              <span className="flex items-center gap-2 min-w-0" style={{ color: 'var(--ds-muted)' }}><ClientMark name={client} size={18} /><span className="truncate">{client}</span></span>
              <span className="flex items-center gap-2" style={{ color: 'var(--soft-text)' }}><StatusDot status={p.status} size={7} />{statusLabel(p.status)}</span>
              <span className="truncate" style={{ color: p.assigned_team_names ? 'var(--soft-text)' : 'var(--faint)' }}>{p.assigned_team_names || 'Unassigned'}</span>
              <span className="truncate" style={{ textAlign: 'right', fontSize: 12.5, color: 'var(--faint)' }}>{projectTimeLabel(p)}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function PageLoader() {
  return (
    <div className="ds min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--ds-accent)', borderTopColor: 'transparent' }} />
    </div>
  )
}
