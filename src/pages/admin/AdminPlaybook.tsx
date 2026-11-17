import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { ClientMark, Ms, Segmented } from '@/components/ds'
import { useSheetClose } from '@/hooks/useSheetClose'
import { usePlaybook, usePlaybookActions, usePlaybookViews } from '@/hooks/usePlaybook'
import { useApiFetch } from '@/lib/api'
import { PLAYBOOK_NAME, grabFrame, isHevcVideo } from '@/lib/playbook'
import { uploadPlaybookFile } from '@/lib/storage'
import { cn } from '@/lib/utils'
import type { Profile } from '@/types'
import type { PlaybookSection, PlaybookVideo } from '@/types/playbook'

// Admins (managers included): the Playbook — sections of short training
// videos for clients. Create, reorder (drag on desktop, arrows on phones),
// publish, choose who sees each section, attachments.

const errMsg = (e: unknown) => (e as Error)?.message ?? 'Something went wrong'
type Actions = ReturnType<typeof usePlaybookActions>
type Uploaded = { key: string; fileName: string; fileSize: number; mimeType: string }

/** Move item `from` to `to` in a list of ids. */
const moved = (ids: string[], from: string, to: string) => {
  const out = ids.filter((x) => x !== from)
  out.splice(out.indexOf(to) + (ids.indexOf(from) < ids.indexOf(to) ? 1 : 0), 0, from)
  return out
}

function Thumb({ v, size = 'sm' }: { v: PlaybookVideo; size?: 'sm' | 'lg' }) {
  const w = size === 'sm' ? 88 : '100%'
  return (
    <span className="relative block overflow-hidden flex-none rounded-[10px]" style={{ width: w, aspectRatio: '16 / 9', background: 'var(--panel)', boxShadow: 'inset 0 0 0 1px var(--panel-ring)' }}>
      {v.thumbnailUrl
        ? <img src={v.thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        : <span className="absolute inset-0 grid place-items-center"><Ms name={v.source === 'upload' ? 'play_circle' : 'smart_display'} style={{ fontSize: 22, width: 22 }} /></span>}
    </span>
  )
}

function StatusTag({ status }: { status?: string }) {
  const pub = status === 'published'
  return (
    <span className="inline-flex items-center gap-1.5 flex-none" style={{ fontSize: 12, fontWeight: 500, color: pub ? 'var(--strong)' : 'var(--faint)' }}>
      <span className="w-[7px] h-[7px] rounded-full" style={{ background: pub ? '#2E9E5B' : 'var(--dash)' }} />{pub ? 'Published' : 'Draft'}
    </span>
  )
}

/** Upload one video with progress, HEVC warning and an automatic thumbnail. */
function useVideoUpload() {
  const apiFetch = useApiFetch()
  const [state, setState] = useState<{ fileName: string; progress: number; hevc: boolean; done: Uploaded | null; thumbKey: string | null; error: string | null; offline: boolean } | null>(null)
  const run = useRef(0)
  const start = async (file: File) => {
    const id = ++run.current
    setState({ fileName: file.name, progress: 0, hevc: false, done: null, thumbKey: null, error: null, offline: false })
    // While it uploads: check the format and grab a still frame.
    void isHevcVideo(file).then((hevc) => { if (run.current === id) setState((s) => s && { ...s, hevc }) })
    void grabFrame(file).then(async (blob) => {
      if (!blob || run.current !== id) return
      try {
        const key = await uploadPlaybookFile(apiFetch, { file: blob, fileName: 'frame.jpg', kind: 'thumb' })
        if (run.current === id) setState((s) => s && { ...s, thumbKey: key })
      } catch { /* no thumbnail: the video still works */ }
    })
    try {
      const key = await uploadPlaybookFile(apiFetch, {
        file, fileName: file.name, kind: 'video',
        onProgress: (p) => { if (run.current === id) setState((s) => s && { ...s, progress: p }) },
        onConnectionState: (c) => { if (run.current === id) setState((s) => s && { ...s, offline: c === 'offline' }) },
      })
      if (run.current === id) setState((s) => s && { ...s, progress: 100, done: { key, fileName: file.name, fileSize: file.size, mimeType: file.type || 'video/mp4' } })
    } catch (e) {
      if (run.current === id) setState((s) => s && { ...s, error: errMsg(e) })
    }
  }
  const reset = () => { run.current++; setState(null) }
  return { state, start, reset }
}

function UploadStatus({ s }: { s: NonNullable<ReturnType<typeof useVideoUpload>['state']> }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2" style={{ fontSize: 13 }}>
        <Ms name="movie" style={{ fontSize: 17, width: 17 }} />
        <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--strong)' }}>{s.fileName}</span>
        <span className="tabular-nums" style={{ color: s.error ? '#dc2626' : 'var(--faint)' }}>{s.error ? 'Failed' : s.done ? 'Uploaded' : s.offline ? 'Waiting for connection' : `${s.progress}%`}</span>
      </div>
      <span className="ds-track block" aria-hidden><i style={{ width: `${s.progress}%` }} /></span>
      {s.hevc && (
        <div className="ds-rich-conflict" role="alert" style={{ marginBottom: 0 }}>
          <Ms name="warning" style={{ fontSize: 18, width: 18, color: 'inherit' }} />
          <span className="flex-1 min-w-0">iPhone HEVC video: it won’t play on some phones and computers. Re-export it as MP4 (H.264), or set the iPhone camera to Most Compatible.</span>
        </div>
      )}
      {s.error && <p style={{ fontSize: 12.5, color: '#dc2626' }}>{s.error}</p>}
    </div>
  )
}

function Sheet({ title, onClose, children, foot }: { title: string; onClose: () => void; children: React.ReactNode; foot: (close: () => void) => React.ReactNode }) {
  const { closing, close } = useSheetClose(onClose)
  return (
    <div className={cn('ds-cal-veil', closing && 'closing')} onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}>
      <div className={cn('ds-cal-sheet ds-msheet max-w-lg overflow-hidden flex flex-col', closing && 'closing')} style={{ maxHeight: '92vh' }}>
        <h2 className="ds-form-title">{title}</h2>
        <div className="px-6 space-y-4 overflow-y-auto pb-2">{children}</div>
        <div className="ds-form-foot">{foot(close)}</div>
      </div>
    </div>
  )
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div><p className="mb-1.5" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--faint)' }}>{label}</p>{children}</div>
)

function AddVideo({ section, actions, onClose }: { section: PlaybookSection; actions: Actions; onClose: () => void }) {
  const [mode, setMode] = useState<'upload' | 'link'>('upload')
  const [title, setTitle] = useState('')
  const [link, setLink] = useState('')
  const up = useVideoUpload()
  const fileRef = useRef<HTMLInputElement>(null)
  const ready = title.trim() && (mode === 'link' ? link.trim() : up.state?.done)
  // Add is always pressable: say what's missing rather than sit greyed out.
  const missing = !title.trim() ? 'Add a title'
    : mode === 'link' ? (!link.trim() ? 'Paste a YouTube or Loom link' : null)
    : !up.state ? 'Choose a video' : up.state.error ? 'The upload failed — choose the file again' : !up.state.done ? 'Wait for the upload to finish' : null
  const save = (close: () => void) => missing ? toast(missing) : actions.addVideo.mutate(
    { sectionId: section.id, title: title.trim(), ...(mode === 'link' ? { link: link.trim() } : { upload: up.state!.done!, thumbnailKey: up.state?.thumbKey ?? null }) },
    { onSuccess: () => { toast.success('Video added as a draft'); close() }, onError: (e) => toast.error(errMsg(e)) })
  return (
    <Sheet title="Add video" onClose={onClose} foot={(close) => (
      <>
        <button type="button" className="ds-ghost-btn" onClick={close}>Cancel</button>
        <button type="button" className={cn('ds-primary', !ready && 'opacity-60')} style={{ paddingLeft: 14 }} disabled={actions.addVideo.isPending} onClick={() => save(close)}>Add</button>
      </>
    )}>
      <p style={{ fontSize: 13, color: 'var(--faint)' }}>{section.title}</p>
      <Field label="Title"><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="How to film B-roll" aria-label="Title" /></Field>
      <Segmented label="Video" width={120} value={mode} onChange={setMode} options={[{ value: 'upload', label: 'Upload' }, { value: 'link', label: 'YouTube / Loom' }]} />
      {mode === 'upload' ? (
        <div className="space-y-3">
          <input ref={fileRef} type="file" accept="video/*" className="hidden" aria-label="Video file"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) {
                // No title yet: start from the file name (editable).
                if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim())
                void up.start(f)
              }
              e.target.value = ''
            }} />
          {up.state && <UploadStatus s={up.state} />}
          <button type="button" className="ds-ghost-btn inline-flex items-center gap-1.5" onClick={() => fileRef.current?.click()}>
            <Ms name="upload" style={{ fontSize: 17, width: 17, color: 'inherit' }} />{up.state ? 'Choose another file' : 'Choose video'}
          </button>
        </div>
      ) : (
        <Field label="Link"><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://youtu.be/… or https://www.loom.com/share/…" aria-label="YouTube or Loom link" inputMode="url" /></Field>
      )}
    </Sheet>
  )
}

function EditVideo({ video, sections, actions, onClose }: { video: PlaybookVideo; sections: PlaybookSection[]; actions: Actions; onClose: () => void }) {
  const apiFetch = useApiFetch()
  const [title, setTitle] = useState(video.title)
  const [description, setDescription] = useState(video.description)
  const [linkTitle, setLinkTitle] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const up = useVideoUpload()
  const videoRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const onErr = { onError: (e: unknown) => toast.error(errMsg(e)) }
  const sectionOf = sections.find((s) => s.videos.some((v) => v.id === video.id))

  // A replacement video finished uploading: swap it in (and its frame).
  useEffect(() => {
    if (up.state?.done) actions.updateVideo.mutate({ id: video.id, upload: up.state.done, ...(up.state.thumbKey ? { thumbnailKey: up.state.thumbKey } : {}) }, { onSuccess: () => toast.success('Video replaced'), ...onErr })
  }, [up.state?.done]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveText = () => {
    const b: { id: string; title?: string; description?: string } = { id: video.id }
    if (title.trim() && title.trim() !== video.title) b.title = title.trim()
    if (description.trim() !== video.description) b.description = description.trim()
    if (b.title !== undefined || b.description !== undefined) actions.updateVideo.mutate(b, onErr)
  }
  const replaceImage = async (f: File) => {
    setBusy('image')
    try {
      const key = await uploadPlaybookFile(apiFetch, { file: f, fileName: f.name, kind: 'thumb' })
      await actions.updateVideo.mutateAsync({ id: video.id, thumbnailKey: key })
      toast.success('Image replaced')
    } catch (e) { toast.error(errMsg(e)) } finally { setBusy(null) }
  }
  const addFile = async (f: File) => {
    setBusy('file')
    try {
      const key = await uploadPlaybookFile(apiFetch, { file: f, fileName: f.name, kind: 'file' })
      await actions.addAttachment.mutateAsync({ videoId: video.id, kind: 'file', key, fileName: f.name, fileSize: f.size, mimeType: f.type || 'application/octet-stream' })
    } catch (e) { toast.error(errMsg(e)) } finally { setBusy(null) }
  }

  return (
    <Sheet title="Video" onClose={() => { saveText(); onClose() }} foot={(close) => (
      <>
        <button type="button" className="ds-ghost-btn ds-danger mr-auto" onClick={() => { if (confirm(`Delete "${video.title}"?`)) actions.deleteVideo.mutate(video.id, { onSuccess: close, ...onErr }) }}>Delete</button>
        <button type="button" className="ds-primary" style={{ paddingLeft: 14 }} onClick={() => { saveText(); close() }}>Done</button>
      </>
    )}>
      <div className="flex items-center justify-between gap-3">
        <Segmented label="Status" width={98} value={video.status ?? 'draft'} onChange={(status) => actions.updateVideo.mutate({ id: video.id, status }, onErr)}
          options={[{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }]} />
        {sections.length > 1 && (
          <select value={sectionOf?.id} aria-label="Section" className="ds-tool" style={{ maxWidth: 180 }} onChange={(e) => actions.updateVideo.mutate({ id: video.id, sectionId: e.target.value }, onErr)}>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        )}
      </div>
      <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveText} aria-label="Title" /></Field>
      <Field label="Description">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} onBlur={saveText} rows={3} aria-label="Description"
          className="w-full" style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--field)', boxShadow: 'inset 0 0 0 1px var(--ds-ring)', border: 0, color: 'var(--text)', fontSize: 13.5, resize: 'vertical', outline: 0 }} />
      </Field>

      <div className="flex items-start gap-3">
        <div style={{ width: 160 }}><Thumb v={video} size="lg" /></div>
        <div className="flex-1 min-w-0 space-y-2">
          <p className="truncate" style={{ fontSize: 13, color: 'var(--strong)' }}>{video.source === 'upload' ? video.fileName : video.externalUrl?.replace(/^https?:\/\/(www\.)?/, '')}</p>
          <div className="flex flex-wrap gap-2">
            <input ref={imageRef} type="file" accept="image/*" className="hidden" aria-label="Image" onChange={(e) => { const f = e.target.files?.[0]; if (f) void replaceImage(f); e.target.value = '' }} />
            <button type="button" className="ds-ghost-btn" style={{ height: 34 }} disabled={busy === 'image'} onClick={() => imageRef.current?.click()}>{busy === 'image' ? 'Uploading…' : 'Replace image'}</button>
            {video.source === 'upload' && (
              <>
                <input ref={videoRef} type="file" accept="video/*" className="hidden" aria-label="Replacement video" onChange={(e) => { const f = e.target.files?.[0]; if (f) void up.start(f); e.target.value = '' }} />
                <button type="button" className="ds-ghost-btn" style={{ height: 34 }} onClick={() => videoRef.current?.click()}>Replace video</button>
              </>
            )}
          </div>
        </div>
      </div>
      {up.state && <UploadStatus s={up.state} />}

      <Field label="Attachments">
        <ul className="space-y-1 mb-2">
          {video.attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-2 min-w-0">
              <Ms name={a.kind === 'file' ? 'description' : 'link'} style={{ fontSize: 17, width: 17 }} />
              <span className="flex-1 min-w-0 truncate" style={{ fontSize: 13.5, color: 'var(--strong)' }}>{a.title}</span>
              <button type="button" aria-label={`Remove ${a.title}`} className="ds-ibtn" style={{ width: 30, height: 30 }} onClick={() => actions.deleteAttachment.mutate(a.id, onErr)}><Ms name="close" style={{ fontSize: 15, width: 15 }} /></button>
            </li>
          ))}
        </ul>
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (linkUrl.trim()) actions.addAttachment.mutate({ videoId: video.id, kind: 'link', title: linkTitle.trim(), url: linkUrl.trim() }, { onSuccess: () => { setLinkTitle(''); setLinkUrl('') }, ...onErr }) }}>
          <input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="Name" aria-label="Link name" style={{ flex: '1 1 120px' }} />
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="Link" aria-label="Link" inputMode="url" style={{ flex: '2 1 180px' }} />
          <button type="submit" className="ds-ghost-btn" style={{ height: 40 }} disabled={!linkUrl.trim()}>Add link</button>
        </form>
        <input ref={fileRef} type="file" className="hidden" aria-label="Attachment file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void addFile(f); e.target.value = '' }} />
        <button type="button" className="ds-ghost-btn inline-flex items-center gap-1.5 mt-2" disabled={busy === 'file'} onClick={() => fileRef.current?.click()}>
          <Ms name="attach_file" style={{ fontSize: 17, width: 17, color: 'inherit' }} />{busy === 'file' ? 'Uploading…' : 'Add file'}
        </button>
      </Field>

      <WatchedBy videoId={video.id} />
    </Sheet>
  )
}

/** Every client who can see the video: watched (with the date) first. */
function WatchedBy({ videoId }: { videoId: string }) {
  const { data: viewers } = usePlaybookViews(videoId)
  if (!viewers) return null
  const list = [...viewers].sort((a, b) => (b.watchedAt ?? '').localeCompare(a.watchedAt ?? '') || a.name.localeCompare(b.name))
  const n = list.filter((v) => v.watchedAt).length
  return (
    <Field label={`Watched by ${n}/${list.length}`}>
      {list.length === 0
        ? <p style={{ fontSize: 13, color: 'var(--faint)' }}>No clients can see this section</p>
        : (
          <ul>
            {list.map((v) => (
              <li key={v.clientId} className="flex items-center gap-2.5 min-w-0" style={{ minHeight: 40 }}>
                <ClientMark name={v.name} size={24} />
                <span className="flex-1 min-w-0 truncate" style={{ fontSize: 13.5, color: 'var(--strong)' }}>{v.name}</span>
                {v.watchedAt
                  ? <span className="inline-flex items-center gap-1 tabular-nums" style={{ fontSize: 12.5, color: 'var(--strong)' }}><Ms name="check_circle" style={{ fontSize: 16, width: 16, color: 'inherit' }} />{new Date(v.watchedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                  : <span style={{ fontSize: 12.5, color: 'var(--faint)' }}>Not yet</span>}
              </li>
            ))}
          </ul>
        )}
    </Field>
  )
}

function Audience({ section, actions, clients }: { section: PlaybookSection; actions: Actions; clients: Profile[] }) {
  const [open, setOpen] = useState(false)
  const onErr = { onError: (e: unknown) => toast.error(errMsg(e)) }
  const ids = section.clientIds ?? []
  const toggle = (id: string) => actions.updateSection.mutate({ id: section.id, clientIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] }, onErr)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Who sees it" width={104} value={section.audience ?? 'all'}
          onChange={(audience) => { actions.updateSection.mutate({ id: section.id, audience }, onErr); if (audience === 'selected') setOpen(true) }}
          options={[{ value: 'all', label: 'All clients' }, { value: 'selected', label: 'Selected' }]} />
        {section.audience === 'selected' && (
          <button type="button" className="ds-ghost-btn" style={{ height: 34 }} onClick={() => setOpen((o) => !o)}>
            {ids.length} client{ids.length === 1 ? '' : 's'}<Ms name={open ? 'expand_less' : 'expand_more'} style={{ fontSize: 17, width: 17, color: 'inherit' }} />
          </button>
        )}
      </div>
      {section.audience === 'selected' && open && (
        <div className="flex flex-wrap gap-1.5">
          {clients.map((c) => {
            const on = ids.includes(c.id)
            return (
              <button key={c.id} type="button" onClick={() => toggle(c.id)} aria-pressed={on}
                className="inline-flex items-center gap-1.5 h-9 pl-1.5 pr-3 rounded-full transition-colors"
                style={{ fontSize: 12.5, fontWeight: 500, background: on ? 'var(--ds-accent)' : 'var(--ghost)', color: on ? 'var(--accent-fg)' : 'var(--soft-text)' }}>
                <ClientMark name={c.full_name} size={22} />{c.full_name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Section({ section, index, count, sections, actions, clients, onAddVideo, onEditVideo, drag }: {
  section: PlaybookSection; index: number; count: number; sections: PlaybookSection[]; actions: Actions; clients: Profile[]
  onAddVideo: () => void; onEditVideo: (v: PlaybookVideo) => void
  drag: { id: string | null; set: (id: string | null) => void }
}) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(section.title)
  const [dragVideo, setDragVideo] = useState<string | null>(null)
  const onErr = { onError: (e: unknown) => toast.error(errMsg(e)) }
  const ids = sections.map((s) => s.id)
  const vids = section.videos.map((v) => v.id)
  const moveSection = (dir: -1 | 1) => { const n = [...ids]; [n[index], n[index + dir]] = [n[index + dir], n[index]]; actions.orderSections.mutate(n, onErr) }
  const moveVideo = (i: number, dir: -1 | 1) => { const n = [...vids]; [n[i], n[i + dir]] = [n[i + dir], n[i]]; actions.orderVideos.mutate({ sectionId: section.id, ids: n }, onErr) }
  const rename = () => { setRenaming(false); const t = name.trim(); if (t && t !== section.title) actions.updateSection.mutate({ id: section.id, title: t }, onErr); else setName(section.title) }

  return (
    <section className={cn('ds-panel', drag.id && drag.id !== section.id && 'ds-drop-target')} style={{ padding: '14px 16px 12px' }}
      onDragOver={(e) => { if (drag.id && drag.id !== section.id) e.preventDefault() }}
      onDrop={(e) => { e.preventDefault(); if (drag.id && drag.id !== section.id) actions.orderSections.mutate(moved(ids, drag.id, section.id), onErr); drag.set(null) }}>
      <div className="flex items-center gap-1.5 min-h-[40px]">
        <span draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; drag.set(section.id) }} onDragEnd={() => drag.set(null)}
          className="hidden md:grid place-items-center cursor-grab" style={{ width: 22, color: 'var(--faint)' }} aria-hidden title="Drag to reorder">
          <Ms name="drag_indicator" style={{ fontSize: 18, width: 18, color: 'inherit' }} />
        </span>
        {renaming ? (
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} onKeyDown={(e) => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') { setName(section.title); setRenaming(false) } }}
            aria-label="Section name" className="ds-field" style={{ maxWidth: 280, height: 36 }} />
        ) : (
          <h2 onDoubleClick={() => setRenaming(true)} className="truncate" style={{ fontSize: 16, fontWeight: 650, color: 'var(--strong)' }}>{section.title}</h2>
        )}
        <span className="ds-count ml-1">{section.videos.length}</span>
        <div className="flex-1" />
        <button type="button" aria-label="Rename section" className="ds-ibtn" style={{ width: 34, height: 34 }} onClick={() => setRenaming(true)}><Ms name="edit" style={{ fontSize: 16, width: 16 }} /></button>
        <button type="button" aria-label="Move section up" className="ds-ibtn" style={{ width: 34, height: 34 }} disabled={index === 0} onClick={() => moveSection(-1)}><Ms name="arrow_upward" style={{ fontSize: 16, width: 16 }} /></button>
        <button type="button" aria-label="Move section down" className="ds-ibtn" style={{ width: 34, height: 34 }} disabled={index === count - 1} onClick={() => moveSection(1)}><Ms name="arrow_downward" style={{ fontSize: 16, width: 16 }} /></button>
        <button type="button" aria-label="Delete section" className="ds-ibtn ds-danger" style={{ width: 34, height: 34 }}
          onClick={() => { if (confirm(section.videos.length ? `Delete "${section.title}" and its ${section.videos.length} video${section.videos.length === 1 ? '' : 's'}?` : `Delete "${section.title}"?`)) actions.deleteSection.mutate(section.id, onErr) }}>
          <Ms name="delete" style={{ fontSize: 16, width: 16, color: 'inherit' }} />
        </button>
      </div>

      <div className="mt-2 mb-3"><Audience section={section} actions={actions} clients={clients} /></div>

      <ul>
        {section.videos.map((v, i) => (
          <li key={v.id} draggable onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; setDragVideo(v.id) }} onDragEnd={() => setDragVideo(null)}
            onDragOver={(e) => { if (dragVideo && dragVideo !== v.id) { e.preventDefault(); e.stopPropagation() } }}
            onDrop={(e) => { if (dragVideo && dragVideo !== v.id) { e.preventDefault(); e.stopPropagation(); actions.orderVideos.mutate({ sectionId: section.id, ids: moved(vids, dragVideo, v.id) }, onErr) } setDragVideo(null) }}
            className={cn('flex items-center gap-3 py-2', dragVideo === v.id && 'opacity-40')} style={{ borderTop: '1px solid var(--line)' }}>
            <span className="hidden md:grid place-items-center cursor-grab" style={{ width: 22, color: 'var(--faint)' }} aria-hidden><Ms name="drag_indicator" style={{ fontSize: 18, width: 18, color: 'inherit' }} /></span>
            <button type="button" onClick={() => onEditVideo(v)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
              <Thumb v={v} />
              <span className="flex-1 min-w-0">
                <span className="block truncate" style={{ fontSize: 14, fontWeight: 600, color: 'var(--strong)' }}>{v.title}</span>
                <span className="flex items-center gap-3 mt-0.5">
                  <StatusTag status={v.status} />
                  {(v.watchedCount ?? 0) > 0 && <span style={{ fontSize: 12, color: 'var(--faint)' }}>{v.watchedCount} watched</span>}
                </span>
              </span>
            </button>
            <span className="flex md:hidden">
              <button type="button" aria-label="Move video up" className="ds-ibtn" style={{ width: 36, height: 36 }} disabled={i === 0} onClick={() => moveVideo(i, -1)}><Ms name="arrow_upward" style={{ fontSize: 16, width: 16 }} /></button>
              <button type="button" aria-label="Move video down" className="ds-ibtn" style={{ width: 36, height: 36 }} disabled={i === section.videos.length - 1} onClick={() => moveVideo(i, 1)}><Ms name="arrow_downward" style={{ fontSize: 16, width: 16 }} /></button>
            </span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onAddVideo} className="inline-flex items-center gap-1.5 mt-2 h-9 px-2 rounded-lg transition-colors hover:bg-[var(--hover)]" style={{ fontSize: 13, fontWeight: 500, color: 'var(--soft-text)' }}>
        <Ms name="add" style={{ fontSize: 17, width: 17, color: 'inherit' }} />Add video
      </button>
    </section>
  )
}

export default function AdminPlaybook() {
  const { data, isLoading, error } = usePlaybook()
  const actions = usePlaybookActions()
  const apiFetch = useApiFetch()
  const { data: clients = [] } = useQuery<Profile[]>({ queryKey: ['users_clients'], queryFn: () => apiFetch<Profile[]>('/api/users/clients') })
  const [newSection, setNewSection] = useState('')
  const [adding, setAdding] = useState<PlaybookSection | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dragSection, setDragSection] = useState<string | null>(null)
  const sections = data?.sections ?? []
  const editing = sections.flatMap((s) => s.videos).find((v) => v.id === editingId) ?? null

  return (
    <AdminLayout>
      <main className="px-4 md:px-6 py-5 md:py-6 max-w-4xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 style={{ fontSize: 24, fontWeight: 650, letterSpacing: '-.02em', color: 'var(--strong)' }}>{PLAYBOOK_NAME}</h1>
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (newSection.trim()) actions.addSection.mutate(newSection.trim(), { onSuccess: () => setNewSection(''), onError: (er) => toast.error(errMsg(er)) }) }}>
            <input value={newSection} onChange={(e) => setNewSection(e.target.value)} placeholder="Getting started" aria-label="New section name" className="ds-field" style={{ width: 200, height: 38 }} />
            <button type="submit" className="ds-primary" disabled={!newSection.trim() || actions.addSection.isPending}><Ms name="add" style={{ fontSize: 18, width: 18, color: 'inherit' }} />Section</button>
          </form>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
        ) : error ? (
          <div className="ds-panel p-6" style={{ fontSize: 13.5 }}>{errMsg(error)}</div>
        ) : sections.length === 0 ? (
          <div className="ds-panel text-center py-14"><p style={{ fontSize: 13.5, color: 'var(--faint)' }}>No sections yet</p></div>
        ) : (
          sections.map((s, i) => (
            <Section key={s.id} section={s} index={i} count={sections.length} sections={sections} actions={actions} clients={clients}
              onAddVideo={() => setAdding(s)} onEditVideo={(v) => setEditingId(v.id)} drag={{ id: dragSection, set: setDragSection }} />
          ))
        )}
      </main>
      {adding && <AddVideo section={adding} actions={actions} onClose={() => setAdding(null)} />}
      {editing && <EditVideo key={editing.id} video={editing} sections={sections} actions={actions} onClose={() => setEditingId(null)} />}
    </AdminLayout>
  )
}
