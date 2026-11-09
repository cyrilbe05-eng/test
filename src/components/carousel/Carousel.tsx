import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useApiFetch } from '@/lib/api'
import { getSignedUrlById, useStorageAdapter } from '@/lib/storage'
import { toSlides } from '@/lib/pdfSlides'
import { cn } from '@/lib/utils'
import type { ProjectFile, TimelineComment } from '@/types'

// Carousels (Stage G): an Instagram-style slide viewer, comments per slide,
// and drag-to-reorder. Slides are project files ordered by sort_order
// (migration 019); finished slides are the project's deliverables.

type Commentish = TimelineComment & { profiles?: { full_name: string } }

function useFileUrl(fileId: string | undefined) {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['project_file_url', fileId],
    enabled: !!fileId,
    staleTime: 4 * 60 * 1000,
    queryFn: () => getSignedUrlById(apiFetch, fileId!),
  }).data
}

function SlideImg({ fileId, src, className }: { fileId?: string; src?: string; className?: string }) {
  const url = useFileUrl(src ? undefined : fileId)
  const s = src ?? url
  return s
    ? <img src={s} alt="" draggable={false} className={className} />
    : <span className={cn('block bg-muted animate-pulse', className)} />
}

const Chevron = ({ left }: { left?: boolean }) => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d={left ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
  </svg>
)

// ── Viewer ────────────────────────────────────────────────────────────────────
export function CarouselViewer({ slides, index, onIndex, marked }: {
  slides: { id: string }[]
  index: number
  onIndex: (i: number) => void
  /** Slide indexes (0-based) that have comments — shown on the dots. */
  marked?: Set<number>
}) {
  const track = useRef<HTMLDivElement>(null)
  // While an arrow/dot/comment scrolls us somewhere, the in-between scroll
  // positions must not pull the index back.
  const heading = useRef<{ left: number; until: number } | null>(null)
  const n = slides.length

  // Swiping/scrolling updates the index…
  const onScroll = () => {
    const el = track.current
    if (!el || !el.clientWidth) return
    const h = heading.current
    if (h) {
      if (Math.abs(el.scrollLeft - h.left) > 2 && Date.now() < h.until) return
      heading.current = null
    }
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== index) onIndex(Math.max(0, Math.min(n - 1, i)))
  }
  // …and an index set from outside (arrows, dots, a comment) scrolls there.
  useEffect(() => {
    const el = track.current
    if (!el) return
    const target = index * el.clientWidth
    if (Math.abs(el.scrollLeft - target) > 2) {
      heading.current = { left: target, until: Date.now() + 1000 }
      el.scrollTo({ left: target, behavior: 'smooth' })
    }
  }, [index])

  // Size changes (rotating a phone, resizing a window) keep the same slide in view.
  const indexRef = useRef(index)
  indexRef.current = index
  useEffect(() => {
    const el = track.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let width = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      const left = indexRef.current * width
      heading.current = { left, until: Date.now() + 300 }
      el.scrollTo({ left })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [n])

  const go = (i: number) => onIndex(Math.max(0, Math.min(n - 1, i)))
  if (!n) return null

  return (
    <div className="w-full max-w-md sm:max-w-[35rem] mx-auto select-none">
      {/* Arrows sit outside the slide (desktop) so they never cover the picture. */}
      <div className="flex items-center gap-3">
        {n > 1 && (
          <button type="button" aria-label="Previous" onClick={() => go(index - 1)} disabled={index === 0}
            className="hidden sm:flex w-11 h-11 flex-shrink-0 rounded-full border border-border bg-card text-foreground items-center justify-center shadow-sm hover:bg-muted transition-opacity disabled:opacity-0 disabled:pointer-events-none">
            <Chevron left />
          </button>
        )}
        <div
          className="relative flex-1 min-w-0 rounded-2xl overflow-hidden bg-black/90"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'ArrowLeft') go(index - 1); if (e.key === 'ArrowRight') go(index + 1) }}
          aria-roledescription="carousel"
        >
          <div ref={track} onScroll={onScroll} className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {slides.map((s, i) => (
              <div key={s.id} className="w-full flex-shrink-0 snap-center aspect-[4/5] flex items-center justify-center" aria-label={`${i + 1} / ${n}`}>
                <SlideImg fileId={s.id} className="w-full h-full object-contain" />
              </div>
            ))}
          </div>
          <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/60 text-white text-xs font-medium tabular-nums">
            {index + 1} / {n}
          </span>
        </div>
        {n > 1 && (
          <button type="button" aria-label="Next" onClick={() => go(index + 1)} disabled={index >= n - 1}
            className="hidden sm:flex w-11 h-11 flex-shrink-0 rounded-full border border-border bg-card text-foreground items-center justify-center shadow-sm hover:bg-muted transition-opacity disabled:opacity-0 disabled:pointer-events-none">
            <Chevron />
          </button>
        )}
      </div>

      {n > 1 && (
        <div className="flex justify-center flex-wrap gap-0.5 mt-1">
          {slides.map((s, i) => (
            <button key={s.id} type="button" aria-label={`Slide ${i + 1}`} onClick={() => go(i)} className="w-6 h-8 flex items-center justify-center">
              <span className={cn('rounded-full transition-all', i === index ? 'w-2 h-2 bg-primary' : 'w-1.5 h-1.5 bg-muted-foreground/40', marked?.has(i) && i !== index && 'bg-amber-500')} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Review: viewer + comments per slide ───────────────────────────────────────
export function CarouselReview({ projectId, slides, comments, userId, canComment, canResolve, revisionRound, onChanged }: {
  projectId: string
  slides: ProjectFile[]
  comments: Commentish[]
  userId: string
  canComment: boolean
  canResolve?: boolean
  revisionRound: number
  onChanged: () => void
}) {
  const apiFetch = useApiFetch()
  const [index, setIndex] = useState(0)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const slideNo = index + 1

  const list = comments
    .filter((c) => c.slide != null)
    .sort((a, b) => (b.revision_round - a.revision_round) || (a.slide! - b.slide!) || a.created_at.localeCompare(b.created_at))
  const marked = new Set(list.filter((c) => c.revision_round === revisionRound && !c.resolved).map((c) => c.slide! - 1))

  const send = async () => {
    const t = text.trim()
    if (!t) return
    setBusy(true)
    try {
      await apiFetch('/api/timeline-comments/create', {
        method: 'POST',
        body: JSON.stringify({ project_id: projectId, comment_text: t, revision_round: revisionRound, slide: slideNo }),
      })
      setText('')
      onChanged()
    } catch (e) {
      toast.error((e as Error).message)
    }
    setBusy(false)
  }
  const remove = async (id: string) => {
    try { await apiFetch(`/api/timeline-comments/${id}`, { method: 'DELETE' }); onChanged() } catch (e) { toast.error((e as Error).message) }
  }
  const resolve = async (c: Commentish) => {
    try {
      await apiFetch(`/api/timeline-comments/${c.id}/resolve`, { method: 'POST', body: JSON.stringify({ resolved: !c.resolved }) })
      onChanged()
    } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <div className="space-y-4">
      <CarouselViewer slides={slides} index={Math.min(index, Math.max(0, slides.length - 1))} onIndex={setIndex} marked={marked} />

      <div className="space-y-3 min-w-0 w-full max-w-md mx-auto">
        {canComment && (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!busy) void send() }}>
            <span className="h-11 px-3 flex items-center rounded-xl bg-primary/10 text-primary text-sm font-semibold tabular-nums flex-shrink-0" aria-label={`Slide ${slideNo}`}>
              {slideNo}
            </span>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Comment on slide ${slideNo}`}
              className="flex-1 min-w-0 h-11 px-3 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button type="submit" disabled={busy || !text.trim()} className="h-11 px-4 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-40">
              Send
            </button>
          </form>
        )}

        {list.length > 0 && (
          <ul className="space-y-1.5">
            {list.map((c) => (
              <li key={c.id} className={cn('flex items-start gap-2 rounded-xl border px-2 py-1.5', c.slide === slideNo ? 'border-primary/40 bg-primary/5' : 'border-border/60', c.resolved && 'opacity-55')}>
                <button type="button" onClick={() => setIndex(c.slide! - 1)} aria-label={`Slide ${c.slide}`}
                  className="w-11 h-11 -my-1 flex-shrink-0 flex items-center justify-center">
                  <span className="w-7 h-7 rounded-lg bg-muted text-xs font-semibold tabular-nums flex items-center justify-center">{c.slide}</span>
                </button>
                <div className="flex-1 min-w-0 py-1">
                  <p className={cn('text-sm break-words', c.resolved && 'line-through')}>{c.comment_text}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {c.profiles?.full_name ?? c.author_role}{c.revision_round !== revisionRound ? ` · R${c.revision_round}` : ''}
                  </p>
                </div>
                {canResolve && (
                  <button type="button" onClick={() => resolve(c)} aria-label={c.resolved ? 'Reopen' : 'Done'}
                    className={cn('w-11 h-11 -my-1 flex-shrink-0 flex items-center justify-center', c.resolved ? 'text-green-600' : 'text-muted-foreground hover:text-foreground')}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  </button>
                )}
                {canComment && c.author_id === userId && c.revision_round === revisionRound && (
                  <button type="button" onClick={() => remove(c.id)} aria-label="Delete"
                    className="w-11 h-11 -my-1 flex-shrink-0 flex items-center justify-center text-lg text-muted-foreground hover:text-destructive">×</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── Sorter: drag to reorder (mouse anywhere on a tile; touch on the handle) ──
export type SortItem = { id: string; name: string; src?: string; fileId?: string }

export function SlideSorter({ items, onReorder, onRemove, disabled }: {
  items: SortItem[]
  onReorder: (ids: string[]) => void
  onRemove?: (id: string) => void
  disabled?: boolean
}) {
  const [order, setOrder] = useState<string[] | null>(null) // live order while dragging
  const drag = useRef<{ id: string; x: number; y: number; on: boolean } | null>(null)
  const ids = order ?? items.map((i) => i.id)
  const byId = new Map(items.map((i) => [i.id, i]))

  const down = (id: string) => (e: React.PointerEvent) => {
    if (disabled || e.button !== 0) return
    if (e.pointerType !== 'mouse' && !(e.target as HTMLElement).closest('[data-handle]')) return
    if ((e.target as HTMLElement).closest('[data-remove]')) return
    drag.current = { id, x: e.clientX, y: e.clientY, on: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    if (!d.on) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return
      d.on = true
      setOrder(items.map((i) => i.id))
    }
    const over = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-slide]')?.dataset.slide
    if (!over || over === d.id) return
    setOrder((prev) => {
      const list = [...(prev ?? items.map((i) => i.id))]
      const from = list.indexOf(d.id), to = list.indexOf(over)
      if (from < 0 || to < 0) return prev
      list.splice(to, 0, ...list.splice(from, 1))
      return list
    })
  }
  const up = () => {
    const d = drag.current
    drag.current = null
    if (d?.on && order && order.join() !== items.map((i) => i.id).join()) onReorder(order)
    setOrder(null)
  }

  return (
    <ol className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
      {ids.map((id, i) => {
        const it = byId.get(id)
        if (!it) return null
        const dragging = drag.current?.on && drag.current.id === id
        return (
          <li
            key={id}
            data-slide={id}
            onPointerDown={down(id)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            className={cn('relative aspect-[4/5] rounded-xl overflow-hidden bg-muted ring-2 transition-transform',
              dragging ? 'ring-primary scale-95 opacity-80 z-10' : 'ring-transparent',
              !disabled && 'sm:cursor-grab')}
          >
            <SlideImg src={it.src} fileId={it.fileId} className="w-full h-full object-cover pointer-events-none" />
            <span className="absolute top-1.5 left-1.5 min-w-6 h-6 px-1.5 rounded-full bg-black/60 text-white text-xs font-semibold tabular-nums flex items-center justify-center">{i + 1}</span>
            {onRemove && !disabled && (
              <button type="button" data-remove aria-label={`Remove ${it.name}`} onClick={() => onRemove(id)}
                className="absolute top-0 right-0 w-11 h-11 flex items-center justify-center">
                <span className="w-6 h-6 rounded-full bg-black/60 text-white text-sm leading-none flex items-center justify-center">×</span>
              </button>
            )}
            {!disabled && items.length > 1 && (
              <span data-handle aria-hidden className="absolute bottom-0 right-0 w-11 h-11 flex items-center justify-center touch-none sm:hidden">
                <span className="w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
                </span>
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

// ── Editor/admin: manage the finished slides (deliverables) ─────────────────
export function SlideManager({ projectId, slides, canEdit, onChanged }: {
  projectId: string
  slides: ProjectFile[]
  canEdit: boolean
  onChanged: () => void
}) {
  const apiFetch = useApiFetch()
  const storage = useStorageAdapter()
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<string | null>(null)

  const reorder = async (ids: string[]) => {
    try { await apiFetch('/api/project-files/order', { method: 'PUT', body: JSON.stringify({ project_id: projectId, ids }) }) } catch (e) { toast.error((e as Error).message) }
    onChanged()
  }
  const remove = async (id: string) => {
    if (!confirm('Remove this slide?')) return
    try { await apiFetch(`/api/project-files/${id}`, { method: 'DELETE' }) } catch (e) { toast.error((e as Error).message) }
    onChanged()
  }
  const add = async (list: FileList | null) => {
    if (!list?.length) return
    setProgress('…')
    try {
      const files = await toSlides(Array.from(list))
      if (!files.length) { toast.error('Images or PDF only'); return }
      for (const [i, file] of files.entries()) {
        setProgress(`${i + 1} / ${files.length}`)
        const { fileId } = await storage.upload({ file, projectId, fileType: 'deliverable' })
        if (fileId) await apiFetch('/api/project-files/order', { method: 'PUT', body: JSON.stringify({ project_id: projectId, ids: [fileId], from: slides.length + i }) })
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setProgress(null)
      onChanged()
    }
  }

  return (
    <div className="space-y-2">
      {slides.length > 0 && (
        <SlideSorter
          items={slides.map((s) => ({ id: s.id, name: s.file_name, fileId: s.id }))}
          onReorder={reorder}
          onRemove={canEdit ? remove : undefined}
          disabled={!canEdit}
        />
      )}
      {canEdit && (
        <>
          <button type="button" disabled={!!progress} onClick={() => input.current?.click()}
            className="w-full min-h-11 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground disabled:opacity-60">
            {progress ? `Uploading ${progress}` : '+ Slides'}
          </button>
          <input ref={input} type="file" multiple hidden accept="image/*,.pdf,application/pdf" onChange={(e) => { void add(e.target.files); e.target.value = '' }} />
        </>
      )}
    </div>
  )
}
