import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useProjects } from '@/hooks/useProjects'
import { KanbanBoard } from '@/components/admin/KanbanBoard'
import { ProjectStatusBadge } from '@/components/project/ProjectStatusBadge'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { useApiFetch } from '@/lib/api'
import { useStorageAdapter } from '@/lib/storage'
import { cn } from '@/lib/utils'
import type { Profile } from '@/types'

function IconLayout() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
    </svg>
  )
}
function IconList() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  )
}

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

const inputCls = 'w-full px-3.5 py-2.5 bg-muted border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all'

function FieldRow({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {error && <p className="text-destructive text-xs">{error}</p>}
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
        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-muted/50'}`}
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
        <p className="text-sm text-muted-foreground">{label} or <span className="text-primary font-medium">browse</span></p>
      </div>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-2 text-sm bg-muted rounded-xl px-3.5 py-2 border border-border/60">
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-muted-foreground text-xs">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
              <button type="button" onClick={() => onRemove(i)} className="text-muted-foreground hover:text-destructive ml-1 text-lg leading-none">×</button>
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

      for (const file of sourceFiles) {
        await storageAdapter.upload({ file, projectId: project!.id, fileType: 'source_video' })
      }
      for (const file of attachments) {
        await storageAdapter.upload({ file, projectId: project!.id, fileType: 'attachment' })
      }

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-heading font-bold text-lg">New Project</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-2xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
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

          <div>
            <p className="text-sm font-medium mb-2">Source Video</p>
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

          <div>
            <p className="text-sm font-medium mb-2">Attachments <span className="text-muted-foreground font-normal">(optional)</span></p>
            <DropZone
              label="Drop logos, scripts, music, etc."
              files={attachments}
              onFiles={(f) => setAttachments((a) => [...a, ...Array.from(f)])}
              onRemove={(i) => setAttachments((a) => a.filter((_, idx) => idx !== i))}
              dragging={dragTarget === 'attachment'}
              onDragChange={(d) => setDragTarget(d ? 'attachment' : null)}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-all">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 bg-primary rounded-xl text-white font-semibold text-sm shadow-clay hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AdminProjects() {
  const [view, setView] = useState<View>('kanban')
  const [showCreate, setShowCreate] = useState(false)
  const { data: projects, isLoading } = useProjects()

  if (isLoading) return <PageLoader />

  return (
    <AdminLayout>
      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} />}
      <main className="px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-heading font-bold">Projects</h2>
            <p className="text-muted-foreground text-sm mt-0.5">{projects?.length ?? 0} total</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold shadow-sm hover:brightness-110 transition-all active:scale-[0.98]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create
            </button>
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 border border-border">
            {(['kanban', 'list'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all capitalize',
                  view === v ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v === 'kanban' ? <IconLayout /> : <IconList />}
                {v}
              </button>
            ))}
          </div>
          </div>
        </div>

        {view === 'kanban' ? (
          <KanbanBoard projects={projects ?? []} />
        ) : (
          <div className="clay-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {['Client', 'Title', 'Status', 'Assigned', 'Created', 'Updated'].map((h) => (
                    <th key={h} className="px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wide text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {(projects ?? []).map((p) => (
                  <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">{(p as any).profiles?.full_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Link to={`/admin/projects/${p.id}`} className="text-primary hover:underline font-medium">{p.title}</Link>
                    </td>
                    <td className="px-4 py-3"><ProjectStatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{(p as any).assigned_team_names ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </AdminLayout>
  )
}

function PageLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  )
}
