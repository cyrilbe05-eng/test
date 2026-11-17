import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Plyr from 'plyr'
import 'plyr/dist/plyr.css'
import { toast } from 'sonner'
import { ClientLayout } from '@/components/workspace/ClientLayout'
import { Ms } from '@/components/ds'
import { usePlaybook } from '@/hooks/usePlaybook'
import { useApiFetch } from '@/lib/api'
import { PLAYBOOK_NAME, PLAYBOOK_PATH } from '@/lib/playbook'
import type { PlaybookOverview, PlaybookSection, PlaybookVideo } from '@/types/playbook'

// Clients: the Playbook — the published sections meant for them, in the
// admin's order, with per-section progress; one video per page with its
// description and attachments. Uploaded videos count as watched at 90%;
// YouTube / Loom ones with the "Mark as watched" tick.

const BASE = `/workspace/${PLAYBOOK_PATH}`
const errMsg = (e: unknown) => (e as Error)?.message ?? 'Something went wrong'

function useWatched() {
  const apiFetch = useApiFetch()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, watched }: { id: string; watched: boolean }) =>
      apiFetch<{ watchedAt: string | null }>(`/api/playbook/videos/${id}/watched`, { method: watched ? 'POST' : 'DELETE' }),
    onSuccess: (r, v) => qc.setQueryData<PlaybookOverview>(['playbook'], (o) => o && ({
      sections: o.sections.map((s) => ({ ...s, videos: s.videos.map((x) => (x.id === v.id ? { ...x, watchedAt: r.watchedAt } : x)) })),
    })),
  })
}

function Card({ v }: { v: PlaybookVideo }) {
  return (
    <Link to={`${BASE}/${v.id}`} className="clay-card block overflow-hidden" style={{ padding: 0 }}>
      <span className="relative block" style={{ aspectRatio: '16 / 9', background: 'var(--panel)' }}>
        {v.thumbnailUrl
          ? <img src={v.thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          : <span className="absolute inset-0 grid place-items-center"><Ms name="play_circle" style={{ fontSize: 34, width: 34 }} /></span>}
        {v.watchedAt && (
          <span className="absolute top-2 right-2 grid place-items-center rounded-full" style={{ width: 26, height: 26, background: 'var(--ds-accent)', color: 'var(--accent-fg)' }} aria-label="Watched">
            <Ms name="check" style={{ fontSize: 17, width: 17, color: 'inherit' }} />
          </span>
        )}
      </span>
      <span className="block px-3.5 py-3">
        <span className="block line-clamp-2" style={{ fontSize: 14, fontWeight: 600, color: 'var(--strong)', lineHeight: 1.35 }}>{v.title}</span>
      </span>
    </Link>
  )
}

function SectionBlock({ s, i }: { s: PlaybookSection; i: number }) {
  const done = s.videos.filter((v) => v.watchedAt).length
  return (
    <section className="animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
      <div className="flex items-center gap-3 mb-3">
        <h2 style={{ fontSize: 17, fontWeight: 650, letterSpacing: '-.01em', color: 'var(--strong)' }}>{s.title}</h2>
        <span className="tabular-nums" style={{ fontSize: 12.5, fontWeight: 600, color: done === s.videos.length ? 'var(--strong)' : 'var(--faint)' }}>{done}/{s.videos.length}</span>
        <span className="ds-track flex-1 max-w-[160px]" aria-hidden><i style={{ width: `${s.videos.length ? (done / s.videos.length) * 100 : 0}%` }} /></span>
      </div>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        {s.videos.map((v) => <Card key={v.id} v={v} />)}
      </div>
    </section>
  )
}

function Overview() {
  const { data, isLoading, error } = usePlaybook()
  const sections = (data?.sections ?? []).filter((s) => s.videos.length > 0)
  return (
    <>
      <h1 className="mb-5" style={{ fontSize: 24, fontWeight: 650, letterSpacing: '-.02em', color: 'var(--strong)' }}>{PLAYBOOK_NAME}</h1>
      {isLoading ? (
        <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
      ) : error ? (
        <div className="ds-panel p-6" style={{ fontSize: 13.5 }}>{errMsg(error)}</div>
      ) : sections.length === 0 ? (
        <div className="ds-panel text-center py-14"><p style={{ fontSize: 13.5, color: 'var(--faint)' }}>Nothing here yet</p></div>
      ) : (
        <div className="space-y-8">{sections.map((s, i) => <SectionBlock key={s.id} s={s} i={i} />)}</div>
      )}
    </>
  )
}

/** Uploaded video: our usual player; reports "watched" once at 90%. */
function FilePlayer({ url, onWatched }: { url: string; onWatched: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const sent = useRef(false)
  const cb = useRef(onWatched)
  cb.current = onWatched
  useEffect(() => {
    const video = host.current?.querySelector('video')
    if (!video) return
    const player = new Plyr(video, { controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'fullscreen'] })
    player.on('timeupdate', () => {
      if (!sent.current && player.duration > 0 && player.currentTime / player.duration >= 0.9) { sent.current = true; cb.current() }
    })
    player.on('ended', () => { if (!sent.current) { sent.current = true; cb.current() } })
    return () => player.destroy()
  }, [url])
  return (
    <div ref={host} className="rounded-2xl overflow-hidden" style={{ background: '#000' }}>
      <video src={url} playsInline preload="metadata" />
    </div>
  )
}

function Attachments({ v }: { v: PlaybookVideo }) {
  const apiFetch = useApiFetch()
  const [opening, setOpening] = useState<string | null>(null)
  if (!v.attachments.length) return null
  // PDFs and images open in a new tab to read; other files just download
  // (no empty tab left behind).
  const openFile = async (id: string, fileName: string | null) => {
    setOpening(id)
    const viewable = /\.(pdf|png|jpe?g|gif|webp|heic)$/i.test(fileName ?? '')
    // Open the tab first (phones block pop-ups opened after a wait).
    const tab = viewable ? window.open('', '_blank') : null
    try {
      const { url, inline } = await apiFetch<{ url: string; inline?: boolean }>(`/api/playbook/attachments/${id}/url`)
      // Full address: a new tab has no page of its own to resolve against.
      const abs = new URL(url, window.location.origin).href
      if (tab && inline) tab.location.href = abs
      else { tab?.close(); window.location.href = abs }
    } catch (e) { tab?.close(); toast.error(errMsg(e)) } finally { setOpening(null) }
  }
  return (
    <ul className="ds-panel" style={{ padding: '6px 14px' }}>
      {v.attachments.map((a) => (
        <li key={a.id} style={{ borderTop: '1px solid var(--line)' }} className="first:border-t-0">
          {a.kind === 'link' ? (
            <a href={a.url ?? '#'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 min-h-[48px]">
              <Ms name="link" style={{ fontSize: 19, width: 19 }} />
              <span className="flex-1 min-w-0 truncate" style={{ fontSize: 14, fontWeight: 500, color: 'var(--strong)' }}>{a.title}</span>
              <Ms name="open_in_new" style={{ fontSize: 17, width: 17 }} />
            </a>
          ) : (
            <button type="button" onClick={() => openFile(a.id, a.fileName)} disabled={opening === a.id} className="w-full flex items-center gap-3 min-h-[48px] text-left">
              <Ms name="description" style={{ fontSize: 19, width: 19 }} />
              <span className="flex-1 min-w-0 truncate" style={{ fontSize: 14, fontWeight: 500, color: 'var(--strong)' }}>{a.title}</span>
              <Ms name={opening === a.id ? 'hourglass_empty' : 'download'} style={{ fontSize: 17, width: 17 }} />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

function VideoPage({ id }: { id: string }) {
  const { data, isLoading } = usePlaybook()
  const apiFetch = useApiFetch()
  const watched = useWatched()
  const all = (data?.sections ?? []).flatMap((s) => s.videos.map((v) => ({ v, s })))
  const at = all.findIndex((x) => x.v.id === id)
  const cur = at >= 0 ? all[at] : null
  const next = at >= 0 ? all[at + 1] : null
  const { data: play, error } = useQuery({
    queryKey: ['playbook', 'play', id],
    enabled: !!cur,
    staleTime: 60 * 60 * 1000,
    queryFn: () => apiFetch<{ kind: 'file' | 'embed'; url: string }>(`/api/playbook/videos/${id}/play`),
  })
  const mark = (on: boolean) => watched.mutate({ id, watched: on }, { onError: (e) => toast.error(errMsg(e)) })

  if (isLoading) return <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
  if (!cur) return <div className="ds-panel text-center py-14"><p style={{ fontSize: 13.5, color: 'var(--faint)' }}>This video isn’t available</p></div>
  const { v, s } = cur
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to={BASE} aria-label={PLAYBOOK_NAME} className="ds-ibtn -ml-2 flex-none"><Ms name="arrow_back" /></Link>
        <span className="truncate" style={{ fontSize: 13, color: 'var(--faint)' }}>{s.title}</span>
      </div>

      {error ? (
        <div className="ds-panel p-6" style={{ fontSize: 13.5 }}>{errMsg(error)}</div>
      ) : !play ? (
        <div className="rounded-2xl" style={{ aspectRatio: '16 / 9', background: 'var(--panel)' }} />
      ) : play.kind === 'file' ? (
        <FilePlayer url={play.url} onWatched={() => { if (!v.watchedAt) mark(true) }} />
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ aspectRatio: '16 / 9', background: '#000' }}>
          <iframe src={play.url} title={v.title} className="w-full h-full" style={{ border: 0 }} allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen />
        </div>
      )}

      <div className="flex flex-wrap items-start gap-3">
        <h1 className="flex-1 min-w-0" style={{ fontSize: 22, fontWeight: 650, letterSpacing: '-.02em', color: 'var(--strong)', lineHeight: 1.25 }}>{v.title}</h1>
        {v.source === 'upload' ? (
          v.watchedAt && <span className="inline-flex items-center gap-1.5 h-9" style={{ fontSize: 13, fontWeight: 600, color: 'var(--strong)' }}><Ms name="check_circle" style={{ fontSize: 18, width: 18, color: 'inherit' }} />Watched</span>
        ) : (
          <button type="button" onClick={() => mark(!v.watchedAt)} disabled={watched.isPending} aria-pressed={!!v.watchedAt}
            className={v.watchedAt ? 'ds-primary' : 'ds-ghost-btn'} style={{ paddingLeft: 12 }}>
            <Ms name={v.watchedAt ? 'check_circle' : 'radio_button_unchecked'} style={{ fontSize: 18, width: 18, color: 'inherit' }} />{v.watchedAt ? 'Watched' : 'Mark as watched'}
          </button>
        )}
      </div>
      {v.description && <p className="whitespace-pre-wrap" style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--text)' }}>{v.description}</p>}
      <Attachments v={v} />

      {next && (
        <Link to={`${BASE}/${next.v.id}`} className="ds-hrow" style={{ margin: '8px -10px 0' }}>
          <span className="flex-1 min-w-0">
            <span className="block" style={{ fontSize: 12, color: 'var(--faint)' }}>Up next</span>
            <span className="block truncate" style={{ fontSize: 14, fontWeight: 600, color: 'var(--strong)' }}>{next.v.title}</span>
          </span>
          <Ms name="arrow_forward" style={{ fontSize: 18, width: 18 }} />
        </Link>
      )}
    </div>
  )
}

export default function ClientPlaybook() {
  const { videoId } = useParams()
  return (
    <ClientLayout>
      <main className="px-4 sm:px-6 py-6 max-w-4xl">
        {videoId ? <VideoPage key={videoId} id={videoId} /> : <Overview />}
      </main>
    </ClientLayout>
  )
}
