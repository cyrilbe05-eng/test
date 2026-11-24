import { useEffect, useRef, useState } from 'react'
import { useGalleryFiles, useGalleryFolders, useGallerySignedUrl } from '@/hooks/useGallery'
import { useGalleryThumbs } from '@/hooks/useGalleryThumbs'
import { isVideoFile } from '@/lib/thumbnail'
import { useThumbnailBackfill } from '@/hooks/useThumbnailBackfill'
import { cn } from '@/lib/utils'
import type { GalleryFile, GalleryFolder } from '@/types'

const Check = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
  </svg>
)

function Tile({ file, thumb, selected, onToggle }: {
  file: GalleryFile; thumb?: string; selected: boolean; onToggle: () => void
}) {
  const video = isVideoFile(file)
  const image = (file.mime_type ?? '').startsWith('image/')
  const [playing, setPlaying] = useState(false)
  const { data: signed } = useGallerySignedUrl(image || (video && playing) ? file.id : null)
  const src = signed?.url
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (playing && ref.current) ref.current.play().catch(() => {}) }, [playing, src])

  const hover = (on: boolean) => (e: React.PointerEvent) => { if (video && e.pointerType === 'mouse') setPlaying(on) }

  return (
    <div
      className={cn('relative rounded-xl overflow-hidden bg-muted aspect-square ring-2 transition-shadow', selected ? 'ring-primary' : 'ring-transparent')}
      onPointerEnter={hover(true)}
      onPointerLeave={hover(false)}
    >
      <button type="button" onClick={onToggle} className="absolute inset-0 w-full h-full" aria-pressed={selected} aria-label={file.file_name}>
        {image && src ? (
          <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : thumb ? (
          <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <span className="w-full h-full flex items-center justify-center text-muted-foreground">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {video
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />}
            </svg>
          </span>
        )}
        {video && playing && src && (
          <video ref={ref} src={src} muted loop playsInline autoPlay preload="auto" className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
        )}
        <span className="absolute inset-x-0 bottom-0 px-2 pt-5 pb-1.5 bg-gradient-to-t from-black/70 to-transparent text-white text-[11px] text-left truncate">
          {file.file_name}
        </span>
      </button>

      <span className={cn(
        'absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center pointer-events-none transition-colors',
        selected ? 'bg-primary text-white' : 'bg-black/30 text-transparent border border-white/70',
      )}>
        <Check />
      </span>

      {video && (
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="absolute top-0 right-0 w-11 h-11 flex items-center justify-center"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          <span className="w-7 h-7 rounded-full bg-black/45 text-white flex items-center justify-center">
            {playing
              ? <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
              : <svg className="w-3 h-3 ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>}
          </span>
        </button>
      )}
    </div>
  )
}

function FolderTile({ folder, count, onOpen }: { folder: GalleryFolder; count: number; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-label={`Open folder ${folder.name}`}
      className="relative rounded-xl overflow-hidden bg-muted aspect-square flex flex-col items-center justify-center gap-2 px-3 hover:brightness-95">
      <svg className="w-9 h-9 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      </svg>
      <span className="text-sm font-medium truncate max-w-full">{folder.name}</span>
      <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
    </button>
  )
}

export function GalleryPickerModal({ ownerId, alreadySelected, onSelect, onClose }: {
  ownerId: string
  alreadySelected: string[]
  onSelect: (files: GalleryFile[]) => void
  onClose: () => void
}) {
  const { data: files = [] } = useGalleryFiles(ownerId)
  const { data: folders = [] } = useGalleryFolders(ownerId)
  const { data: thumbs } = useGalleryThumbs(ownerId)
  const [selected, setSelected] = useState<Set<string>>(new Set(alreadySelected))
  // Browse like My Gallery: top level first, tap a folder to go in.
  const [at, setAt] = useState<string | null>(null)
  const here = folders.find((f) => f.id === at) ?? null
  const known = new Set(folders.map((f) => f.id))
  const subfolders = folders.filter((f) => (f.parent_id ?? null) === at).sort((a, b) => a.name.localeCompare(b.name))
  // A file whose folder is gone shows at the top level rather than vanishing.
  const shown = files.filter((f) => (f.folder_id && known.has(f.folder_id) ? f.folder_id : null) === at)
  const inside = (id: string): number => files.filter((f) => f.folder_id === id).length
    + folders.filter((f) => f.parent_id === id).reduce((n, c) => n + inside(c.id), 0)
  useThumbnailBackfill(ownerId, files, thumbs)

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const confirm = () => {
    onSelect(files.filter((f) => selected.has(f.id)))
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-3xl flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pl-5 pr-2 py-1.5 border-b border-border flex-shrink-0">
          {here ? (
            <div className="flex items-center gap-1 min-w-0 -ml-3">
              <button type="button" onClick={() => setAt(here.parent_id ?? null)} aria-label="Back"
                className="w-11 h-11 flex-shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <h2 className="font-heading font-semibold text-base truncate">{here.name}</h2>
            </div>
          ) : <h2 className="font-heading font-semibold text-base">Pick from Gallery</h2>}
          <button type="button" onClick={onClose} className="w-11 h-11 flex items-center justify-center text-muted-foreground hover:text-foreground text-xl leading-none" aria-label="Close">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {files.length === 0 && folders.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-10">Your gallery is empty.</p>
          ) : subfolders.length === 0 && shown.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-10">Empty folder</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {subfolders.map((f) => <FolderTile key={f.id} folder={f} count={inside(f.id)} onOpen={() => setAt(f.id)} />)}
              {shown.map((f) => (
                <Tile key={f.id} file={f} thumb={thumbs?.[f.id]} selected={selected.has(f.id)} onToggle={() => toggle(f.id)} />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-border flex-shrink-0">
          <span className="text-sm text-muted-foreground tabular-nums">{selected.size} selected</span>
          <div className="flex gap-1">
            <button type="button" onClick={onClose} className="min-h-11 px-4 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            <button type="button" onClick={confirm} className="min-h-11 px-5 text-sm bg-primary text-white font-semibold rounded-full hover:brightness-110">
              Add{selected.size ? ` ${selected.size}` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
