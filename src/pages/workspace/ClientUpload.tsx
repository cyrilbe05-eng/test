import { useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { useProjects } from '@/hooks/useProjects'
import { useApiFetch } from '@/lib/api'
import { useStorageAdapter } from '@/lib/storage'
import { useUploadManager } from '@/lib/uploadManager'
import { autoTitles, isVideo } from '@/lib/autoTitle'
import { cn } from '@/lib/utils'
import { ClientLayout } from '@/components/workspace/ClientLayout'
import { GalleryPickerModal } from '@/pages/workspace/ClientNewProject'
import type { GalleryFile } from '@/types'

// One-step "New video" (Part 4). Drop the footage, send. The title fills
// itself in ("Ellie · Nov 8") and stays editable. Several videos dropped at
// once → one question: separate videos or one video. Arriving from a calendar
// entry keeps the link so that entry changes colour. Same endpoints and upload
// queue as the old form (ClientNewProject, kept but no longer routed).

type Picked = { id: string; file: File }
type Mode = 'separate' | 'one'
type Prefill = { title?: string; inspiration_url?: string; video_script?: string; instructions?: string; fromEventTitle?: string; fromEventId?: string }

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`
const input = 'w-full min-h-[44px] px-3 bg-muted border border-border rounded-xl text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30'
const secondary = 'min-h-[44px] px-3.5 inline-flex items-center justify-center rounded-xl border border-border text-sm font-medium hover:bg-muted'
const remove = 'w-11 h-11 -mr-2 flex-shrink-0 rounded-lg text-lg leading-none text-muted-foreground hover:text-destructive hover:bg-muted'

function Segmented({ value, onChange }: { value: Mode | null; onChange: (m: Mode) => void }) {
  return (
    <div role="radiogroup" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-muted">
      {([['separate', 'Separate videos'], ['one', 'One video']] as const).map(([m, label]) => (
        <button key={m} type="button" role="radio" aria-checked={value === m} onClick={() => onChange(m)}
          className={cn('min-h-[40px] rounded-lg text-sm font-medium', value === m ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
          {label}
        </button>
      ))}
    </div>
  )
}

export default function ClientUpload() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const apiFetch = useApiFetch()
  const storage = useStorageAdapter()
  const { enqueue } = useUploadManager()
  const { data: projects = [] } = useProjects()
  const prefill = ((useLocation().state as { prefill?: Prefill } | null)?.prefill) ?? {}

  const [videos, setVideos] = useState<Picked[]>([])
  const [files, setFiles] = useState<Picked[]>([])
  const [gallery, setGallery] = useState<GalleryFile[]>([])
  const [mode, setMode] = useState<Mode | null>(null)
  const [asking, setAsking] = useState(false)
  const [titles, setTitles] = useState<Record<string, string>>({}) // edited titles; '' key = the single title
  const [notes, setNotes] = useState(prefill.instructions ?? '')
  const [link, setLink] = useState(prefill.inspiration_url ?? '')
  const [script, setScript] = useState(prefill.video_script ?? '')
  const [showLink, setShowLink] = useState(!!prefill.inspiration_url)
  const [showScript, setShowScript] = useState(!!prefill.video_script)
  const [picker, setPicker] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [sending, setSending] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const separate = mode === 'separate' && videos.length > 1
  const count = separate ? videos.length : 1
  const auto = useMemo(() => {
    const t = autoTitles(profile?.full_name, new Date(), projects, count)
    if (prefill.title) t[0] = prefill.title
    return t
  }, [profile?.full_name, projects, count, prefill.title])
  const titleFor = (key: string, i: number) => titles[key] ?? auto[i] ?? ''

  const add = (list: FileList | null) => {
    if (!list?.length) return
    const all = Array.from(list).map((file) => ({ id: crypto.randomUUID(), file }))
    const v = all.filter((p) => isVideo(p.file))
    setFiles((s) => [...s, ...all.filter((p) => !isVideo(p.file))])
    setVideos((s) => [...s, ...v])
    if (videos.length + v.length > 1 && !mode) setAsking(true)
  }
  const drop = (id: string) => setVideos((s) => s.filter((p) => p.id !== id))

  const send = async () => {
    const groups = separate ? videos.map((v) => ({ key: v.id, videos: [v] })) : [{ key: '', videos }]
    const names = groups.map((g, i) => titleFor(g.key, i).trim())
    if (names.some((n) => n.length < 2)) { toast.error('Title required'); return }
    if (link.trim() && !/^https?:\/\/\S+$/i.test(link.trim())) { toast.error('Link must start with https://'); return }
    setSending(true)
    const created: string[] = []
    try {
      for (const [i, g] of groups.entries()) {
        const { id } = await apiFetch<{ id: string }>('/api/projects/create', {
          method: 'POST',
          body: JSON.stringify({
            title: names[i],
            inspiration_url: link.trim() || null,
            video_script: script.trim() || null,
            instructions: notes.trim() || undefined,
            // One calendar entry = one video: only the first is linked.
            calendar_event_id: i === 0 ? prefill.fromEventId ?? null : null,
          }),
        })
        created.push(id)
        enqueue([
          ...g.videos.map((p) => ({ file: p.file, fileType: 'source_video' as const })),
          ...files.map((p) => ({ file: p.file, fileType: 'attachment' as const })),
        ].map(({ file, fileType }) => ({
          file,
          label: `${file.name} · ${names[i]}`,
          invalidate: [['project_files', id], ['projects']],
          run: ({ onProgress, onConnectionState }) =>
            storage.upload({ file, projectId: id, fileType, onProgress, onConnectionState }).then(() => undefined),
        })))
        for (const gf of gallery) {
          await apiFetch('/api/project-files/register', {
            method: 'POST',
            body: JSON.stringify({ project_id: id, file_type: 'attachment', storage_key: gf.storage_key, file_name: gf.file_name, file_size: gf.file_size, mime_type: gf.mime_type }),
          })
        }
      }
    } catch (e) {
      const msg = (e as Error)?.message
      toast.error(msg === 'active_project_limit_reached' ? 'Video limit reached' : msg || 'Something went wrong')
    }
    setSending(false)
    if (!created.length) return
    qc.invalidateQueries({ queryKey: ['projects'] })
    qc.invalidateQueries({ queryKey: ['client', 'dashboard'] })
    if (created.length === groups.length) toast.success(created.length > 1 ? `${created.length} videos sent` : 'Sent')
    navigate(created.length === 1 ? `/workspace/projects/${created[0]}` : '/workspace/videos')
  }

  const row = 'flex items-center gap-2 pl-3 rounded-xl bg-muted/60 border border-border/60 min-w-0'
  const meta = (f: { name: string; size: number }) => (
    <>
      <span className="flex-1 min-w-0 truncate text-sm">{f.name}</span>
      <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{mb(f.size)}</span>
    </>
  )

  return (
    <ClientLayout>
      <main className="max-w-2xl px-4 md:px-6 pt-5 pb-24 md:py-8">
        <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!sending) void send() }}>
          <div className="flex items-center justify-between gap-3 min-w-0">
            <h1 className="text-xl md:text-2xl font-heading font-semibold tracking-tight">New video</h1>
            {prefill.fromEventTitle && (
              <span className="min-w-0 truncate text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary">{prefill.fromEventTitle}</span>
            )}
          </div>

          {!separate && (
            <label className="block space-y-1">
              <span className="text-sm font-medium">Title</span>
              <input className={input} value={titleFor('', 0)} onChange={(e) => setTitles((t) => ({ ...t, '': e.target.value }))} />
            </label>
          )}

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
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} />

          {videos.length > 1 && <Segmented value={mode} onChange={setMode} />}

          {videos.length > 0 && (
            <ul className="space-y-1.5">
              {videos.map((p, i) => (
                <li key={p.id} className={cn(row, separate && 'flex-wrap py-2')}>
                  {separate && (
                    <input aria-label="Title" className={cn(input, 'flex-1 basis-full sm:basis-0 bg-card mr-3 sm:mr-0')} value={titleFor(p.id, i)}
                      onChange={(e) => setTitles((t) => ({ ...t, [p.id]: e.target.value }))} />
                  )}
                  {meta(p.file)}
                  <button type="button" aria-label="Remove" className={remove} onClick={() => drop(p.id)}>×</button>
                </li>
              ))}
            </ul>
          )}

          {(files.length > 0 || gallery.length > 0) && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Files</p>
              <ul className="space-y-1.5">
                {files.map((p) => (
                  <li key={p.id} className={row}>
                    {meta(p.file)}
                    <button type="button" aria-label="Remove" className={remove} onClick={() => setFiles((s) => s.filter((x) => x.id !== p.id))}>×</button>
                  </li>
                ))}
                {gallery.map((g) => (
                  <li key={g.id} className={row}>
                    {meta({ name: g.file_name, size: g.file_size })}
                    <button type="button" aria-label="Remove" className={remove} onClick={() => setGallery((s) => s.filter((x) => x.id !== g.id))}>×</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <label className="block space-y-1">
            <span className="text-sm font-medium">Notes</span>
            <textarea rows={3} className={cn(input, 'py-2.5 resize-y')} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {showLink && (
            <label className="block space-y-1">
              <span className="text-sm font-medium">Link</span>
              <input type="text" inputMode="url" className={input} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
            </label>
          )}
          {showScript && (
            <label className="block space-y-1">
              <span className="text-sm font-medium">Script</span>
              <textarea rows={5} className={cn(input, 'py-2.5 resize-y')} value={script} onChange={(e) => setScript(e.target.value)} />
            </label>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondary} onClick={() => setPicker(true)}>Gallery</button>
            {!showLink && <button type="button" className={secondary} onClick={() => setShowLink(true)}>+ Link</button>}
            {!showScript && <button type="button" className={secondary} onClick={() => setShowScript(true)}>+ Script</button>}
          </div>

          <button type="submit" disabled={sending}
            className="w-full min-h-[48px] rounded-xl bg-primary text-white text-sm font-semibold hover:brightness-110 disabled:opacity-50">
            {sending ? 'Sending…' : separate ? `Send ${videos.length} videos` : 'Send'}
          </button>
        </form>
      </main>

      {asking && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" aria-label={`${videos.length} videos`} className="w-full max-w-sm bg-card border border-border rounded-2xl p-4 space-y-3 shadow-2xl">
            <p className="font-heading font-semibold text-center">{videos.length} videos</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="min-h-[48px] rounded-xl bg-primary text-white text-sm font-semibold hover:brightness-110"
                onClick={() => { setMode('separate'); setAsking(false) }}>Separate videos</button>
              <button type="button" className={cn(secondary, 'min-h-[48px]')}
                onClick={() => { setMode('one'); setAsking(false) }}>One video</button>
            </div>
          </div>
        </div>
      )}

      {picker && profile && (
        <GalleryPickerModal
          ownerId={profile.id}
          alreadySelected={gallery.map((g) => g.id)}
          onSelect={(picked) => setGallery((prev) => [...prev, ...picked.filter((g) => !prev.some((x) => x.id === g.id))])}
          onClose={() => setPicker(false)}
        />
      )}
    </ClientLayout>
  )
}
