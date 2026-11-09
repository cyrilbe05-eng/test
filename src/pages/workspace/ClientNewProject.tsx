import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { useApiFetch } from '@/lib/api'
import { useStorageAdapter } from '@/lib/storage'
import { ClientLayout } from '@/components/workspace/ClientLayout'
import { useUploadManager } from '@/lib/uploadManager'
import { cn } from '@/lib/utils'
import { GalleryPickerModal } from '@/components/gallery/GalleryPickerModal'
import type { GalleryFile } from '@/types'

const schema = z.object({
  title: z.string().min(2, 'Title required'),
  inspiration_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  video_script: z.string().optional(),
  instructions: z.string().optional(),
})
type FormData = z.infer<typeof schema>

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ClientNewProject() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const apiFetch = useApiFetch()
  const storageAdapter = useStorageAdapter()
  const [sourceFiles, setSourceFiles] = useState<File[]>([])
  const [attachments, setAttachments] = useState<File[]>([])
  const [galleryAttachments, setGalleryAttachments] = useState<GalleryFile[]>([])
  const [showGalleryPicker, setShowGalleryPicker] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [dragTarget, setDragTarget] = useState<'source' | 'attachment' | null>(null)
  const [attachTab, setAttachTab] = useState<'upload' | 'gallery'>('upload')
  const { enqueue } = useUploadManager()

  // Arriving from a calendar entry's "Create project" button: the brief is
  // already written there, so it lands pre-filled (see ClientCalendar).
  const location = useLocation()
  const prefill = (location.state as {
    prefill?: Partial<FormData> & { fromEventTitle?: string; fromEventId?: string }
  } | null)?.prefill

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: prefill?.title ?? '',
      inspiration_url: prefill?.inspiration_url ?? '',
      video_script: prefill?.video_script ?? '',
      instructions: prefill?.instructions ?? '',
    },
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
          // Set when started from a calendar entry — links the two so the
          // entry's colour follows this project's progress.
          calendar_event_id: prefill?.fromEventId ?? null,
        }),
      })

      // 2+3. Hand source files and attachments to the background queue — the
      // project already exists, so the client can leave this page immediately
      // and watch progress in the dock instead of babysitting the form.
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

      // 4. Link gallery files as attachments (already in R2, just register)
      for (const gf of galleryAttachments) {
        await apiFetch('/api/project-files/register', {
          method: 'POST',
          body: JSON.stringify({
            project_id: project!.id,
            file_type: 'attachment',
            storage_key: gf.storage_key,
            file_name: gf.file_name,
            file_size: gf.file_size,
            mime_type: gf.mime_type,
          }),
        })
      }

      toast.success(
        sourceFiles.length + attachments.length > 0
          ? "Project created! Your files keep uploading in the background."
          : "Project created! We'll assign a team member shortly.",
      )
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

  const removeGalleryAttachment = (id: string) => {
    setGalleryAttachments((prev) => prev.filter((f) => f.id !== id))
  }

  return (
    <ClientLayout>
      <main className="max-w-3xl mx-auto px-6 py-10 animate-slide-up">
        <h1 className="text-2xl font-heading font-semibold tracking-tight mb-1.5">New Project</h1>
        <p className="text-muted-foreground mb-4 text-sm">Tell us what you need and upload your source material.</p>

        {prefill?.fromEventTitle && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-primary/10 border border-primary/20 text-sm text-primary flex items-start gap-2">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              Pre-filled from your calendar entry <strong>“{prefill.fromEventTitle}”</strong> — edit anything before submitting.
            </span>
          </div>
        )}

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
            <h2 className="font-semibold text-sm">Main Video</h2>
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
            <h2 className="font-semibold text-sm">
              Supporting Files <span className="text-muted-foreground font-normal">(optional)</span>
            </h2>

            {/* Tab toggle */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit">
              <button
                type="button"
                onClick={() => setAttachTab('upload')}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  attachTab === 'upload' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Upload files
              </button>
              <button
                type="button"
                onClick={() => setAttachTab('gallery')}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  attachTab === 'gallery' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Pick from Gallery
              </button>
            </div>

            {attachTab === 'upload' ? (
              <DropZone
                label="Drop attachments — b-roll, logos, scripts, music, etc."
                files={attachments}
                onFiles={(f) => addFiles('attachment', f)}
                onRemove={(i) => setAttachments((a) => a.filter((_, idx) => idx !== i))}
                dragging={dragTarget === 'attachment'}
                onDragChange={(d) => setDragTarget(d ? 'attachment' : null)}
              />
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => setShowGalleryPicker(true)}
                  className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted/50 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                  </svg>
                  Browse my gallery
                </button>

                {galleryAttachments.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {galleryAttachments.map((f) => (
                      <li key={f.id} className="flex items-center gap-2 text-sm text-foreground bg-muted rounded-xl px-3.5 py-2.5 border border-border/60">
                        <svg className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                        </svg>
                        <span className="flex-1 truncate">{f.file_name}</span>
                        <span className="text-muted-foreground text-xs">{(f.file_size / 1024 / 1024).toFixed(1)} MB</span>
                        <button
                          type="button"
                          onClick={() => removeGalleryAttachment(f.id)}
                          className="text-muted-foreground hover:text-destructive ml-1 text-lg leading-none"
                        >×</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
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

      {showGalleryPicker && profile && (
        <GalleryPickerModal
          ownerId={profile.id}
          alreadySelected={galleryAttachments.map((f) => f.id)}
          onSelect={(picked) => setGalleryAttachments((prev) => {
            const existingIds = new Set(prev.map((f) => f.id))
            return [...prev, ...picked.filter((f) => !existingIds.has(f.id))]
          })}
          onClose={() => setShowGalleryPicker(false)}
        />
      )}
    </ClientLayout>
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
        <p className={dragging ? 'text-sm text-primary font-semibold' : 'text-sm text-muted-foreground'}>
          {dragging ? 'Release to upload here' : <>{label} or <span className="text-primary font-medium">browse files</span></>}
        </p>
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
