import { Icon, Ms, Segmented } from '@/components/ds'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useApiFetch } from '@/lib/api'
import { useUploadManager } from '@/lib/uploadManager'
import { uploadGalleryFile, apiFetchResilient } from '@/lib/storage'
import { downloadAll } from '@/lib/zipDownload'
import { grabFrame, saveThumbnail } from '@/lib/thumbnail'
import {
  useGalleryFiles,
  useGalleryFolders,
  useCreateFolder,
  useDeleteFolder,
  useMoveFile,
  useDeleteGalleryFile,
  useRenameGalleryFile,
} from '@/hooks/useGallery'
import type { GalleryFile, GalleryFolder } from '@/types'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface GalleryProps {
  ownerId: string
  currentUserId: string
  showOwner?: boolean
  storageLimitMb?: number
  readOnly?: boolean
  canDownload?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function mimeIcon(mime: string): string {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'movie'
  if (mime.startsWith('audio/')) return 'audio_file'
  if (mime === 'application/pdf') return 'picture_as_pdf'
  if (mime.includes('zip') || mime.includes('compressed')) return 'folder_zip'
  return 'description'
}

/** File-type placeholder: icon + short label, quiet. */
function TypeMark({ mime, small }: { mime: string; small?: boolean }) {
  return (
    <span className="flex flex-col items-center gap-1" style={{ color: 'var(--faint)' }}>
      <Ms name={mimeIcon(mime)} style={{ fontSize: small ? 18 : 30, width: small ? 18 : 30, color: 'inherit' }} />
      {!small && <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.02em' }}>{mimeShortLabel(mime)}</span>}
    </span>
  )
}

function mimeShortLabel(mime: string): string {
  if (mime.startsWith('image/')) return mime.split('/')[1].toUpperCase().slice(0, 4)
  if (mime.startsWith('video/')) return mime.split('/')[1].toUpperCase().slice(0, 4)
  if (mime === 'application/pdf') return 'PDF'
  if (mime.includes('zip')) return 'ZIP'
  const parts = mime.split('/')
  return (parts[1] ?? parts[0]).toUpperCase().slice(0, 4)
}

// ─── Context-menu state ───────────────────────────────────────────────────────

interface ContextMenu {
  x: number
  y: number
  fileId: string
}

/** Touch long-press → the same menu right-click opens on desktop.
 *
 *  Phones have no right-click, so rename/move/delete were unreachable on
 *  mobile entirely. Press-and-hold for LONG_PRESS_MS opens the menu at the
 *  finger; moving more than a few pixels (i.e. a scroll) cancels it, and the
 *  click that would normally follow the release is swallowed so the file
 *  doesn't also open. */
const LONG_PRESS_MS = 450
const LONG_PRESS_MOVE_TOLERANCE_PX = 10

function useLongPress(onLongPress: (x: number, y: number) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)

  const clear = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    origin.current = null
  }

  return {
    // Suppresses the post-release click (and iOS's own callout menu).
    didLongPress: fired,
    handlers: {
      onTouchStart: (e: React.TouchEvent) => {
        const t = e.touches[0]
        if (!t) return
        fired.current = false
        origin.current = { x: t.clientX, y: t.clientY }
        timer.current = setTimeout(() => {
          fired.current = true
          onLongPress(t.clientX, t.clientY)
        }, LONG_PRESS_MS)
      },
      onTouchMove: (e: React.TouchEvent) => {
        const t = e.touches[0]
        if (!t || !origin.current) return
        const moved = Math.hypot(t.clientX - origin.current.x, t.clientY - origin.current.y)
        if (moved > LONG_PRESS_MOVE_TOLERANCE_PX) clear()
      },
      onTouchEnd: clear,
      onTouchCancel: clear,
    },
  }
}

// ─── Move Modal ───────────────────────────────────────────────────────────────

function MoveModal({
  fileId,
  ownerId,
  folders,
  onClose,
}: {
  fileId: string
  ownerId: string
  folders: GalleryFolder[]
  onClose: () => void
}) {
  const moveFile = useMoveFile()

  const handleMove = async (folderId: string | null) => {
    try {
      await moveFile.mutateAsync({ id: fileId, folderId, ownerId })
      toast.success('File moved')
      onClose()
    } catch {
      toast.error('Failed to move file')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-xl w-80 p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-heading font-semibold text-sm mb-4">Move to folder</h3>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          <button
            onClick={() => handleMove(null)}
            className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
            Root
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => handleMove(f.id)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
              {f.name}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="mt-4 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Fullscreen Preview Modal ─────────────────────────────────────────────────

function PreviewModal({ file, signedUrl, onClose }: { file: GalleryFile; signedUrl: string; onClose: () => void }) {
  const isImage = file.mime_type.startsWith('image/')
  const isVideo = file.mime_type.startsWith('video/')
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <div className="max-w-5xl max-h-[90vh] w-full flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        {isImage ? (
          <img src={signedUrl} alt={file.file_name} className="max-h-[80vh] max-w-full object-contain rounded-xl" />
        ) : isVideo ? (
          <video src={signedUrl} controls autoPlay className="max-h-[80vh] max-w-full rounded-xl" />
        ) : (
          <div className="text-white text-sm">Preview not available for this file type.</div>
        )}
        <p className="text-white/70 text-sm truncate max-w-full">{file.file_name}</p>
      </div>
    </div>
  )
}

/** True once the element has come near the viewport (and stays true).
 *
 *  Thumbnails used to load for EVERY file in a gallery at mount: a client with
 *  318 files fired 318 signed-URL calls plus 318 <video> metadata fetches at
 *  once, the browser queued them 6-at-a-time, retries piled up and the grid
 *  never populated — which is why large galleries looked empty. Loading only
 *  what's on screen keeps that flat regardless of gallery size. */
function useNearViewport<T extends HTMLElement>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    if (near) return
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) { setNear(true); io.disconnect() }
      },
      // Preload a screenful ahead so scrolling feels instant.
      { rootMargin: '400px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [near])
  return [ref, near]
}

// ─── File Card ────────────────────────────────────────────────────────────────

function FileCard({
  file,
  viewMode,
  canDownload,
  downloading,
  selected,
  onSelect,
  onContextMenu,
  onLongPress,
  onDragStart,
  onDragEnd,
  onDownload,
  onPreview,
}: {
  file: GalleryFile
  viewMode: 'grid' | 'list'
  canDownload: boolean
  downloading?: boolean
  selected?: boolean
  onSelect?: (id: string) => void
  onContextMenu: (e: React.MouseEvent, fileId: string) => void
  /** Long-press equivalent for touch devices (no right-click on phones). */
  onLongPress: (x: number, y: number, fileId: string) => void
  onDragStart: (fileId: string) => void
  onDragEnd: () => void
  onDownload: (fileId: string, fileName: string) => void
  onPreview: (file: GalleryFile, url: string) => void
}) {
  const isImage = file.mime_type.startsWith('image/')
  const isVideo = file.mime_type.startsWith('video/')

  // Signed URL is fetched only once the card approaches the viewport — see
  // useNearViewport for why (large galleries used to self-DDoS on mount).
  const [cardRef, near] = useNearViewport<HTMLDivElement>()
  const longPress = useLongPress((x, y) => onLongPress(x, y, file.id))
  const apiFetch = useApiFetch()
  const { data: signedUrl } = useQuery({
    queryKey: ['gallery_signed_url', file.id],
    queryFn: () => apiFetch<{ url: string }>(`/api/gallery/${file.id}/signed-url`),
    staleTime: 1000 * 60 * 4,
    enabled: near && (isImage || isVideo),
  })

  const [playing, setPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!videoRef.current) return
    if (playing) {
      videoRef.current.pause()
      setPlaying(false)
    } else {
      videoRef.current.play()
      setPlaying(true)
    }
  }

  if (viewMode === 'list') {
    return (
      <div
        ref={cardRef}
        draggable
        onDragStart={() => onDragStart(file.id)}
        onDragEnd={onDragEnd}
        onContextMenu={(e) => onContextMenu(e, file.id)}
        {...longPress.handlers}
        onClickCapture={(e) => { if (longPress.didLongPress.current) { e.preventDefault(); e.stopPropagation() } }}
        style={{ WebkitTouchCallout: 'none' }}
        className={cn('flex items-center gap-3 px-3 py-2 hover:bg-[var(--hover)] transition-colors cursor-grab active:cursor-grabbing rounded-xl select-none', selected && 'bg-[var(--active)]')}
      >
        {onSelect && (
          <input type="checkbox" checked={!!selected} onChange={() => onSelect(file.id)}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 accent-primary flex-shrink-0" />
        )}
        <div className="w-10 h-10 flex-shrink-0 rounded-[9px] overflow-hidden flex items-center justify-center relative" style={{ background: 'var(--panel)', boxShadow: 'inset 0 0 0 1px var(--panel-ring)' }}>
          {isImage && signedUrl?.url ? (
            <img src={signedUrl.url} alt={file.file_name} className="w-full h-full object-cover" />
          ) : isVideo && signedUrl?.url ? (
            <>
              <video ref={videoRef} src={signedUrl.url} className="w-full h-full object-cover" muted preload="metadata" onEnded={() => setPlaying(false)} />
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <div className="w-4 h-4 rounded-full bg-white/90 flex items-center justify-center">
                  <svg className="w-2 h-2 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                </div>
              </div>
            </>
          ) : (
            <TypeMark mime={file.mime_type} small />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate" style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--strong)' }}>{file.file_name}</p>
          <p style={{ fontSize: 12, color: 'var(--faint)' }}>{formatBytes(file.file_size)}</p>
        </div>
        {canDownload && (
          <button
            onClick={(e) => { e.stopPropagation(); onDownload(file.id, file.file_name) }}
            disabled={downloading}
            className="ds-ibtn flex-shrink-0 disabled:opacity-40"
            style={{ width: 34, height: 34 }}
            title="Download"
          >
            {downloading
              ? <div className="w-3.5 h-3.5 rounded-full border border-current border-t-transparent animate-spin" />
              : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            }
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      ref={cardRef}
      draggable
      onDragStart={() => onDragStart(file.id)}
      onDragEnd={onDragEnd}
      onContextMenu={(e) => onContextMenu(e, file.id)}
      {...longPress.handlers}
      onClickCapture={(e) => { if (longPress.didLongPress.current) { e.preventDefault(); e.stopPropagation() } }}
      style={{ WebkitTouchCallout: 'none' }}
      className={cn('clay-card p-2 cursor-grab active:cursor-grabbing select-none group relative', selected && 'ring-2 ring-[var(--focus)]')}
    >
      {onSelect && (
        <div className="absolute top-3.5 left-3.5 z-10">
          <input type="checkbox" checked={!!selected} onChange={() => onSelect(file.id)}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 accent-primary" />
        </div>
      )}
      <div className="aspect-[4/3] rounded-[10px] flex items-center justify-center overflow-hidden relative group/media" style={{ background: 'var(--panel)', boxShadow: 'inset 0 0 0 1px var(--panel-ring)' }}>
        {isImage && signedUrl?.url ? (
          <>
            <img src={signedUrl.url} alt={file.file_name} className="w-full h-full object-cover" />
            <button
              onClick={(e) => { e.stopPropagation(); onPreview(file, signedUrl.url) }}
              className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/media:bg-black/30 transition-colors"
            >
              <svg className="w-7 h-7 text-white opacity-0 group-hover/media:opacity-100 transition-opacity drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          </>
        ) : isVideo && signedUrl?.url ? (
          <>
            <video
              ref={videoRef}
              src={signedUrl.url}
              className="w-full h-full object-cover"
              muted
              preload="metadata"
              onEnded={() => setPlaying(false)}
            />
            {/* Play/pause overlay */}
            <button
              onClick={togglePlay}
              className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                {playing ? (
                  <svg className="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </div>
            </button>
            {/* Fullscreen button */}
            <button
              onClick={(e) => { e.stopPropagation(); onPreview(file, signedUrl.url) }}
              className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/50 text-white flex items-center justify-center opacity-0 group-hover/media:opacity-100 transition-opacity hover:bg-black/70"
              title="Fullscreen"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
            {/* Video badge */}
            {!playing && (
              <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-white" style={{ fontSize: 11, fontWeight: 500, background: 'rgba(0,0,0,.55)' }}>
                <Ms name="movie" style={{ fontSize: 12, width: 12, color: 'inherit' }} />Video
              </span>
            )}
          </>
        ) : (
          <TypeMark mime={file.mime_type} />
        )}
      </div>
      <div className="px-1.5 pt-2 pb-0.5 flex items-center justify-between gap-1">
        <div className="min-w-0">
          <p className="truncate" style={{ fontSize: 13, fontWeight: 500, color: 'var(--strong)' }}>{file.file_name}</p>
          <p style={{ fontSize: 11.5, color: 'var(--faint)' }}>{formatBytes(file.file_size)}</p>
        </div>
        {canDownload && (
          <button
            onClick={(e) => { e.stopPropagation(); onDownload(file.id, file.file_name) }}
            disabled={downloading}
            className="ds-ibtn flex-shrink-0 disabled:opacity-40"
            style={{ width: 30, height: 30 }}
            title="Download"
          >
            {downloading
              ? <div className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />
              : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            }
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Folder Card ──────────────────────────────────────────────────────────────

function FolderCard({
  folder,
  fileCount,
  viewMode,
  isDragOver,
  onNavigate,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  folder: GalleryFolder
  fileCount: number
  viewMode: 'grid' | 'list'
  isDragOver: boolean
  onNavigate: (id: string) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (folderId: string) => void
}) {
  if (viewMode === 'list') {
    return (
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={() => onDrop(folder.id)}
        onClick={() => onNavigate(folder.id)}
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-colors select-none flex-1 min-w-0',
          isDragOver ? 'bg-[var(--drop)] ring-1 ring-[var(--drop-ring)]' : 'hover:bg-[var(--hover)]'
        )}
      >
        <span className="w-10 h-10 rounded-[9px] grid place-items-center flex-shrink-0" style={{ background: 'var(--panel)', boxShadow: 'inset 0 0 0 1px var(--panel-ring)' }}>
          <Ms name="folder" style={{ fontSize: 20, width: 20, color: 'var(--soft-text)', fontVariationSettings: "'FILL' 1, 'wght' 400" }} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="truncate" style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--strong)' }}>{folder.name}</p>
          <p style={{ fontSize: 12, color: 'var(--faint)' }}>{fileCount} {fileCount === 1 ? 'file' : 'files'}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={() => onDrop(folder.id)}
      onClick={() => onNavigate(folder.id)}
      className={cn(
        'clay-card p-4 cursor-pointer select-none',
        isDragOver && 'ring-2 ring-[var(--drop-ring)] bg-[var(--drop)]'
      )}
    >
      <span className="w-11 h-11 rounded-xl grid place-items-center mb-3" style={{ background: 'var(--panel)', boxShadow: 'inset 0 0 0 1px var(--panel-ring)' }}>
        <Ms name="folder" style={{ fontSize: 24, width: 24, color: 'var(--soft-text)', fontVariationSettings: "'FILL' 1, 'wght' 400" }} />
      </span>
      <p className="truncate" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--strong)' }}>{folder.name}</p>
      <p style={{ fontSize: 12, color: 'var(--faint)' }}>{fileCount} {fileCount === 1 ? 'file' : 'files'}</p>
    </div>
  )
}

// ─── Main Gallery Component ───────────────────────────────────────────────────

export function Gallery({ ownerId, currentUserId: _currentUserId, storageLimitMb = -1, readOnly = false, canDownload = true }: GalleryProps) {
  const apiFetch = useApiFetch()

  // Navigation state
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [folderPath, setFolderPath] = useState<{ id: string; name: string }[]>([])

  // UI state
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  // Drag state
  const [draggingFileId, setDraggingFileId] = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  // OS-file drag (drop-from-desktop upload) — distinct from the internal
  // file-move drag above; detected via dataTransfer.types includes 'Files'.
  const [fileDragOver, setFileDragOver] = useState(false)
  const fileDragDepth = useRef(0)

  // Context menu
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [moveModalFileId, setMoveModalFileId] = useState<string | null>(null)

  // Upload state lives in the app-level manager (progress shown in the dock).
  const { enqueue } = useUploadManager()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Data
  const { data: allFiles = [], isLoading: filesLoading } = useGalleryFiles(ownerId)
  const { data: allFolders = [], isLoading: foldersLoading } = useGalleryFolders(ownerId)

  const createFolder = useCreateFolder()
  const deleteFolder = useDeleteFolder()
  const moveFile = useMoveFile()
  const deleteFile = useDeleteGalleryFile()
  const renameFile = useRenameGalleryFile()

  // Preview / rename state
  const [previewFile, setPreviewFile] = useState<{ file: GalleryFile; url: string } | null>(null)
  const [renameFileId, setRenameFileId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchDownloading, setBatchDownloading] = useState(false)
  const [batchDone, setBatchDone] = useState(0)

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) { n.delete(id) } else { n.add(id) } return n })

  const selectAll = () => setSelectedIds(new Set(currentFiles.map((f) => f.id)))
  const clearSelection = () => setSelectedIds(new Set())

  const handleBatchDownload = async () => {
    if (selectedIds.size === 0) return
    const files = currentFiles.filter((f) => selectedIds.has(f.id))
    // One file: a plain download. Several: see downloadAll — one resumable
    // zip on desktop Chrome/Edge, else normal downloads one after another.
    if (files.length === 1) { await handleDownload(files[0].id, files[0].file_name); clearSelection(); return }
    setBatchDownloading(true)
    setBatchDone(0)
    try {
      const folder = folderPath[folderPath.length - 1]?.name ?? 'Gallery'
      const result = await downloadAll(`${folder} ${new Date().toISOString().slice(0, 10)}`, files.map((f) => ({
        name: f.file_name,
        size: f.file_size,
        url: async () => (await apiFetch<{ url: string }>(`/api/gallery/${f.id}/signed-url?download=1`)).url,
      })), setBatchDone)
      if (result !== 'cancelled') clearSelection()
    } catch {
      toast.error('Download failed')
    } finally {
      setBatchDownloading(false)
    }
  }

  const isLoading = filesLoading || foldersLoading

  // Filter to current folder
  const currentFolders = allFolders.filter((f) => f.parent_id === currentFolderId)
  const currentFiles = allFiles.filter((f) => f.folder_id === currentFolderId)

  // Storage usage
  const totalBytes = allFiles.reduce((sum, f) => sum + f.file_size, 0)
  const totalMb = totalBytes / 1048576
  const usagePct = storageLimitMb > 0 ? Math.min(100, (totalMb / storageLimitMb) * 100) : 0
  const usageBarColor = usagePct > 90 ? 'bg-red-500' : usagePct > 70 ? 'bg-amber-400' : 'bg-primary'

  // ── Folder navigation ──
  const navigateInto = (folderId: string) => {
    const folder = allFolders.find((f) => f.id === folderId)
    if (!folder) return
    setCurrentFolderId(folderId)
    setFolderPath((prev) => [...prev, { id: folderId, name: folder.name }])
  }

  const navigateTo = (index: number) => {
    if (index === -1) {
      setCurrentFolderId(null)
      setFolderPath([])
    } else {
      const target = folderPath[index]
      setCurrentFolderId(target.id)
      setFolderPath((prev) => prev.slice(0, index + 1))
    }
  }

  // ── Create folder ──
  const handleCreateFolder = async () => {
    const name = newFolderName.trim()
    if (!name) return
    try {
      await createFolder.mutateAsync({ name, ownerId, parentId: currentFolderId })
      toast.success('Folder created')
    } catch {
      toast.error('Failed to create folder')
    }
    setCreatingFolder(false)
    setNewFolderName('')
  }

  // ── Drag & drop ──
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDrop = async (targetFolderId: string) => {
    if (!draggingFileId) return
    setDragOverFolderId(null)
    try {
      await moveFile.mutateAsync({ id: draggingFileId, folderId: targetFolderId, ownerId })
      toast.success('File moved')
    } catch {
      toast.error('Failed to move file')
    }
    setDraggingFileId(null)
  }

  // ── Context menu ──
  const handleContextMenu = (e: React.MouseEvent, fileId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, fileId })
  }

  // Touch equivalent — opens the same menu at the finger position.
  const handleLongPress = (x: number, y: number, fileId: string) => {
    setContextMenu({ x, y, fileId })
  }

  const handleDeleteFile = async (fileId: string) => {
    setContextMenu(null)
    try {
      await deleteFile.mutateAsync({ id: fileId, ownerId })
      toast.success('File deleted')
    } catch {
      toast.error('Failed to delete file')
    }
  }

  const handleDeleteFolder = async (folder: GalleryFolder) => {
    if (!confirm(`Delete folder "${folder.name}"? Files inside will be moved to root.`)) return
    try {
      await deleteFolder.mutateAsync({ id: folder.id, ownerId })
      toast.success('Folder deleted')
    } catch {
      toast.error('Failed to delete folder')
    }
  }

  // ── Rename ──
  const startRename = (file: GalleryFile) => {
    setRenameFileId(file.id)
    setRenameValue(file.file_name)
    setContextMenu(null)
  }

  const commitRename = async () => {
    if (!renameFileId || !renameValue.trim()) { setRenameFileId(null); return }
    try {
      await renameFile.mutateAsync({ id: renameFileId, fileName: renameValue.trim(), ownerId })
      toast.success('File renamed')
    } catch {
      toast.error('Failed to rename')
    }
    setRenameFileId(null)
  }

  // ── Download ──
  // Tracks which fileIds currently have an in-flight signed-URL request, so
  // we can disable the button briefly without showing a fake progress bar.
  const [downloading, setDownloading] = useState<Record<string, boolean>>({})

  const handleDownload = async (fileId: string, fileName: string) => {
    setDownloading((p) => ({ ...p, [fileId]: true }))
    try {
      // Request a download-mode URL: R2 returns Content-Disposition:
      // attachment + correct filename + correct content-type. The browser
      // then handles the actual download natively, with the right name and
      // extension. The previous in-app fetch→blob→click flow corrupted the
      // file type on Android Chrome (saved as text/plain) and showed a
      // misleading 0→100% bar that finished before the real download began.
      const { url } = await apiFetch<{ url: string }>(`/api/gallery/${fileId}/signed-url?download=1`)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.rel = 'noopener'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
    } catch {
      toast.error('Failed to download file')
    } finally {
      setDownloading((p) => { const n = { ...p }; delete n[fileId]; return n })
    }
  }

  // ── Upload ──
  // Handed to the app-level queue: uploads survive navigation and their
  // progress lives in the floating UploadDock. The resilient pipeline
  // (multipart ≥16 MB with per-part retry/resume, watchdog + connectivity-
  // verified single PUT below) is unchanged.
  const handleUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const picked = Array.from(files)
    // Folder is captured at stage time, so files land where they were dropped
    // even if the user navigates elsewhere while they upload.
    const folderId = currentFolderId
    const folderName = folderPath.length > 0 ? folderPath[folderPath.length - 1].name : null

    enqueue(picked.map((file) => ({
      file,
      label: folderName ? `Gallery · ${folderName}` : 'Gallery',
      invalidate: [['gallery_files', ownerId], ['gallery_thumbs', ownerId]],
      run: async ({ onProgress, onConnectionState }) => {
        const { storageKey } = await uploadGalleryFile(apiFetch, {
          file,
          ownerId,
          onProgress,
          onConnectionState,
        })
        // Bytes are safe in R2 at this point — registration must survive a
        // network blip too, or the upload is orphaned.
        const row = await apiFetchResilient<{ id?: string }>(apiFetch, '/api/gallery/register', {
          method: 'POST',
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            fileSize: file.size,
            storageKey,
            folderId,
            ownerId,
          }),
        })
        // Clip thumbnail from the local file (best effort — never fails the upload).
        if (row?.id && (file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name))) {
          const local = URL.createObjectURL(file)
          try { await saveThumbnail(apiFetch, row.id, await grabFrame(local)) } catch { /* picker backfills later */ } finally { URL.revokeObjectURL(local) }
        }
      },
    })))
    toast.success(picked.length > 1 ? `${picked.length} files added to the upload queue` : `${picked[0].name} added to the upload queue`)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── OS-file drag & drop (upload from desktop) ──
  const isOsFileDrag = (e: React.DragEvent) => !readOnly && e.dataTransfer.types.includes('Files')
  const onOsDragEnter = (e: React.DragEvent) => {
    if (!isOsFileDrag(e)) return
    fileDragDepth.current++
    setFileDragOver(true)
  }
  const onOsDragOver = (e: React.DragEvent) => {
    if (isOsFileDrag(e)) e.preventDefault()
  }
  const onOsDragLeave = () => {
    if (fileDragDepth.current > 0) fileDragDepth.current--
    if (fileDragDepth.current === 0) setFileDragOver(false)
  }
  const onOsDrop = (e: React.DragEvent) => {
    if (!isOsFileDrag(e)) return
    e.preventDefault()
    fileDragDepth.current = 0
    setFileDragOver(false)
    if (e.dataTransfer.files.length > 0) handleUpload(e.dataTransfer.files)
  }

  // ── Render ──
  return (
    <div
      className="flex flex-col h-full relative"
      onClick={() => setContextMenu(null)}
      onDragEnter={onOsDragEnter}
      onDragOver={onOsDragOver}
      onDragLeave={onOsDragLeave}
      onDrop={onOsDrop}
    >
      {fileDragOver && (
        <div className="absolute inset-2 z-40 rounded-2xl border-2 border-dashed flex items-center justify-center pointer-events-none" style={{ borderColor: 'var(--focus)', background: 'var(--drop)', backdropFilter: 'none' }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--strong)' }}>
            Drop files to upload{folderPath.length > 0 ? ` to “${folderPath[folderPath.length - 1].name}”` : ''}
          </p>
        </div>
      )}
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 sm:px-6 pt-1 pb-3 gap-2 flex-wrap">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 min-w-0 flex-1" style={{ fontSize: 15 }}>
          <button
            onClick={() => navigateTo(-1)}
            className={cn(
              'transition-colors hover:text-foreground inline-flex items-center gap-2',
              currentFolderId === null ? 'text-foreground font-semibold' : 'text-muted-foreground font-medium'
            )}
          >
            <Ms name="photo_library" style={{ fontSize: 18, width: 18, color: 'inherit' }} />
            All Files
          </button>
          {folderPath.map((seg, i) => (
            <span key={seg.id} className="flex items-center gap-1 min-w-0">
              <svg className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <button
                onClick={() => navigateTo(i)}
                className={cn(
                  'truncate transition-colors hover:text-foreground',
                  i === folderPath.length - 1 ? 'text-foreground font-semibold' : 'text-muted-foreground font-medium'
                )}
              >
                {seg.name}
              </button>
            </span>
          ))}
        </nav>

        {/* Selection toolbar */}
        {canDownload && currentFiles.length > 0 && (
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            {selectedIds.size > 0 ? (
              <>
                <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
                <button
                  onClick={handleBatchDownload}
                  disabled={batchDownloading}
                  className="ds-primary disabled:opacity-50"
                  style={{ height: 34, fontSize: 13 }}
                >
                  {batchDownloading
                    ? <div className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />
                    : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  }
                  {batchDownloading && selectedIds.size > 1 ? `${batchDone}/${selectedIds.size}` : 'Download'}
                </button>
                <button onClick={clearSelection} className="text-xs text-muted-foreground hover:text-foreground transition-colors" aria-label="Clear selection"><Icon name="close" size={16} /></button>
              </>
            ) : (
              <button
                onClick={selectAll}
                className="ds-ghost-btn"
                style={{ height: 34, fontSize: 13 }}
              >
                Select all
              </button>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-4">
          {/* View toggle */}
          <Segmented label="View" width={56} value={viewMode} onChange={setViewMode}
            options={[{ value: 'grid', label: 'Grid' }, { value: 'list', label: 'List' }]} />

          {/* Create folder */}
          {!readOnly && (
            <button
              onClick={() => { setCreatingFolder(true); setNewFolderName('') }}
              className="ds-ghost-btn ds-tap inline-flex items-center gap-2"
              title="New Folder"
            >
              <Ms name="create_new_folder" style={{ fontSize: 18, width: 18, color: 'inherit' }} />
              <span className="hidden sm:inline">New Folder</span>
            </button>
          )}

          {/* Upload */}
          {!readOnly && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Upload files — they continue in the background while you work"
                className="ds-primary ds-tap"
              >
                <Ms name="upload" style={{ fontSize: 18, width: 18, color: 'inherit' }} />
                <span className="hidden sm:inline">Upload</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Upload progress now lives in the floating UploadDock (app-level). */}

      {/* New folder inline input */}
      {creatingFolder && (
        <div className="mx-4 sm:mx-6 mb-3 ds-panel flex items-center gap-2.5" style={{ padding: '8px 10px' }}>
          <Ms name="folder" style={{ fontSize: 20, width: 20, color: 'var(--soft-text)', fontVariationSettings: "'FILL' 1, 'wght' 400" }} />
          <input
            autoFocus
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder()
              if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName('') }
            }}
            placeholder="Folder name"
            className="ds-field flex-1"
            style={{ height: 36 }}
          />
          <button onClick={handleCreateFolder} className="ds-primary" style={{ height: 36 }}>Create</button>
          <button onClick={() => { setCreatingFolder(false); setNewFolderName('') }} className="ds-ghost-btn" style={{ height: 36 }}>Cancel</button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-8 pt-1">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : currentFolders.length === 0 && currentFiles.length === 0 ? (
          <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--panel)', boxShadow: 'inset 0 0 0 1px var(--panel-ring)' }}>
            <span className="w-12 h-12 rounded-2xl grid place-items-center mx-auto mb-3" style={{ background: 'var(--field)', boxShadow: 'inset 0 0 0 1px var(--ds-ring)' }}>
              <Ms name="photo_library" style={{ fontSize: 24, width: 24 }} />
            </span>
            <p style={{ fontSize: 13.5, color: 'var(--faint)' }}>
              {readOnly ? 'No files here yet.' : 'No files yet. Upload your first file to get started.'}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid gap-3 sm:gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(170px, 42vw), 1fr))' }}>
            {currentFolders.map((folder) => (
              <div key={folder.id} className="group relative">
                <FolderCard
                  folder={folder}
                  fileCount={allFiles.filter((f) => f.folder_id === folder.id).length}
                  viewMode="grid"
                  isDragOver={dragOverFolderId === folder.id}
                  onNavigate={navigateInto}
                  onDragOver={(e) => { handleDragOver(e); setDragOverFolderId(folder.id) }}
                  onDragLeave={() => setDragOverFolderId(null)}
                  onDrop={handleDrop}
                />
                {!readOnly && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder) }}
                    className="absolute top-2.5 right-2.5 z-10 w-7 h-7 rounded-lg ds-ibtn ds-danger opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete folder"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            {currentFiles.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                viewMode="grid"
                canDownload={canDownload}
                downloading={!!downloading[file.id]}
                selected={selectedIds.has(file.id)}
                onSelect={canDownload ? toggleSelect : undefined}
                onContextMenu={handleContextMenu}
                onLongPress={handleLongPress}
                onDragStart={setDraggingFileId}
                onDragEnd={() => setDraggingFileId(null)}
                onDownload={handleDownload}
                onPreview={(f, url) => setPreviewFile({ file: f, url })}
              />
            ))}
          </div>
        ) : (
          <div className="ds-panel" style={{ padding: 6 }}>
            {currentFolders.map((folder) => (
              <div key={folder.id} className="group relative flex items-center">
                <FolderCard
                  folder={folder}
                  fileCount={allFiles.filter((f) => f.folder_id === folder.id).length}
                  viewMode="list"
                  isDragOver={dragOverFolderId === folder.id}
                  onNavigate={navigateInto}
                  onDragOver={(e) => { handleDragOver(e); setDragOverFolderId(folder.id) }}
                  onDragLeave={() => setDragOverFolderId(null)}
                  onDrop={handleDrop}
                />
                {!readOnly && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder) }}
                    className="mr-2 w-8 h-8 rounded-lg ds-ibtn ds-danger opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    title="Delete folder"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            {currentFiles.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                viewMode="list"
                canDownload={canDownload}
                downloading={!!downloading[file.id]}
                selected={selectedIds.has(file.id)}
                onSelect={canDownload ? toggleSelect : undefined}
                onContextMenu={handleContextMenu}
                onLongPress={handleLongPress}
                onDragStart={setDraggingFileId}
                onDragEnd={() => setDraggingFileId(null)}
                onDownload={handleDownload}
                onPreview={(f, url) => setPreviewFile({ file: f, url })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Storage usage bar */}
      {storageLimitMb !== -1 && storageLimitMb > 0 && (
        <div className="px-4 sm:px-6 py-3" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="flex items-center justify-between mb-1.5" style={{ fontSize: 12, color: 'var(--faint)' }}>
            <span>Storage</span>
            <span>{formatBytes(totalBytes)} / {formatBytes(storageLimitMb * 1048576)}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full transition-all', usageBarColor)} style={{ width: usagePct + '%' }} />
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 w-48 ds-menu-fixed"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {!readOnly && (() => {
            const file = currentFiles.find((f) => f.id === contextMenu.fileId)
            if (!file) return null
            return (
              <button
                onClick={() => startRename(file)}
                className="ds-menu-item"
              >
                <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Rename
              </button>
            )
          })()}
          <button
            onClick={() => { setMoveModalFileId(contextMenu.fileId); setContextMenu(null) }}
            className="ds-menu-item"
          >
            <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Move to folder
          </button>
          {canDownload && (() => {
            const file = currentFiles.find((f) => f.id === contextMenu.fileId)
            if (!file) return null
            return (
              <button
                onClick={() => { handleDownload(file.id, file.file_name); setContextMenu(null) }}
                className="ds-menu-item"
              >
                <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            )
          })()}
          {!readOnly && (
            <button
              onClick={() => handleDeleteFile(contextMenu.fileId)}
              className="ds-menu-item text-destructive"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          )}
        </div>
      )}

      {/* Move modal */}
      {moveModalFileId && (
        <MoveModal
          fileId={moveModalFileId}
          ownerId={ownerId}
          folders={allFolders}
          onClose={() => setMoveModalFileId(null)}
        />
      )}

      {/* Rename modal */}
      {renameFileId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setRenameFileId(null)}>
          <div className="bg-card border border-border rounded-2xl shadow-xl w-80 p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-heading font-semibold text-sm">Rename file</h3>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenameFileId(null) }}
              className="w-full px-3 py-2 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex gap-2">
              <button onClick={commitRename} className="flex-1 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:brightness-110 transition-all">Save</button>
              <button onClick={() => setRenameFileId(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen preview */}
      {previewFile && (
        <PreviewModal
          file={previewFile.file}
          signedUrl={previewFile.url}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  )
}
