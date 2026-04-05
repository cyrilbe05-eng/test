import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { useApiFetch } from '@/lib/api'
import { useStorageAdapter } from '@/lib/storage'

const schema = z.object({
  title: z.string().min(2, 'Title required'),
  inspiration_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  video_script: z.string().optional(),
  instructions: z.string().optional(),
})
type FormData = z.infer<typeof schema>

export default function ClientNewProject() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const apiFetch = useApiFetch()
  const storageAdapter = useStorageAdapter()
  const [sourceFiles, setSourceFiles] = useState<File[]>([])
  const [attachments, setAttachments] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [dragTarget, setDragTarget] = useState<'source' | 'attachment' | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    if (!profile) return
    setSubmitting(true)
    try {
      // 1. Create project
      const project = await apiFetch<{ id: string }>('/api/projects/create', {
        method: 'POST',
        body: JSON.stringify({
          title: data.title,
          inspiration_url: data.inspiration_url || null,
          video_script: data.video_script || null,
          instructions: data.instructions,
        }),
      })

      // 2. Upload source files
      for (const file of sourceFiles) {
        await storageAdapter.upload({ file, projectId: project!.id, fileType: 'source_video' })
      }

      // 3. Upload attachments
      for (const file of attachments) {
        await storageAdapter.upload({ file, projectId: project!.id, fileType: 'attachment' })
      }

      toast.success('Project created! We\'ll assign a team member shortly.')
      navigate(`/workspace/projects/${project!.id}`)
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to create project')
    } finally {
      setSubmitting(false)
    }
  }

  const addFiles = (type: 'source' | 'attachment', files: FileList | null) => {
    if (!files) return
    const arr = Array.from(files)
    if (type === 'source') setSourceFiles((s) => [...s, ...arr])
    else setAttachments((a) => [...a, ...arr])
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-6 flex items-center gap-3" style={{ height: '52px' }}>
          <Link to="/workspace" className="text-muted-foreground hover:text-foreground text-sm transition-colors">← My Workspace</Link>
          <span className="text-border">/</span>
          <span className="text-sm font-medium text-foreground">New Project</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 animate-slide-up">
        <h1 className="text-2xl font-heading font-semibold tracking-tight mb-1.5">New Project</h1>
        <p className="text-muted-foreground mb-8 text-sm">Tell us what you need and upload your source material.</p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="clay-card p-6 space-y-4">
            <h2 className="font-semibold text-sm">Project Details</h2>
            <Field label="Project Title" error={errors.title?.message}>
              <input {...register('title')} className={inputCls} placeholder="e.g. Q1 Brand Video" />
            </Field>
            <Field label="Link to Inspiration Video (optional)" error={errors.inspiration_url?.message}>
              <input type="url" {...register('inspiration_url')} className={inputCls} placeholder="https://youtube.com/watch?v=…" />
            </Field>
            <Field label="Video Script (optional)">
              <textarea {...register('video_script')} rows={4} className={inputCls + ' resize-none'} placeholder="Paste or write the script for your video…" />
            </Field>
            <Field label="Instructions for Editor">
              <textarea {...register('instructions')} rows={4} className={inputCls + ' resize-none'} placeholder="Describe what you need, style references, music preferences, etc." />
            </Field>
          </div>

          <div className="clay-card p-6 space-y-4">
            <h2 className="font-semibold text-sm">Source Video</h2>
            <DropZone
              label="Drop your raw video footage here"
              files={sourceFiles}
              onFiles={(f) => addFiles('source', f)}
              onRemove={(i) => setSourceFiles((s) => s.filter((_, idx) => idx !== i))}
              accept="video/*"
              dragging={dragTarget === 'source'}
              onDragChange={(d) => setDragTarget(d ? 'source' : null)}
            />
          </div>

          <div className="clay-card p-6 space-y-4">
            <h2 className="font-semibold text-sm">Supporting Files <span className="text-muted-foreground font-normal">(optional)</span></h2>
            <DropZone
              label="Drop attachments — logos, scripts, music, etc."
              files={attachments}
              onFiles={(f) => addFiles('attachment', f)}
              onRemove={(i) => setAttachments((a) => a.filter((_, idx) => idx !== i))}
              dragging={dragTarget === 'attachment'}
              onDragChange={(d) => setDragTarget(d ? 'attachment' : null)}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-primary rounded-xl text-white font-semibold text-sm shadow-clay hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? 'Creating project…' : 'Submit Project'}
          </button>
        </form>
      </main>
    </div>
  )
}

function DropZone({ label, files, onFiles, onRemove, accept, dragging, onDragChange }: {
  label: string; files: File[]; onFiles: (f: FileList) => void; onRemove: (i: number) => void; accept?: string; dragging: boolean; onDragChange: (d: boolean) => void
}) {
  return (
    <div>
      <div
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-muted/50'}`}
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
        <p className="text-sm text-muted-foreground">{label} or <span className="text-primary font-medium">browse files</span></p>
      </div>
      {files.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-foreground bg-muted rounded-xl px-3.5 py-2.5 border border-border/60">
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-muted-foreground text-xs">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
              <button onClick={() => onRemove(i)} className="text-muted-foreground hover:text-destructive ml-1 text-lg leading-none">×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const inputCls = 'w-full px-3.5 py-2.5 bg-muted border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all'

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
