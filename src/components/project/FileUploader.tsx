import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useApiFetch } from '@/lib/api'
import { useStorageAdapter, type UploadConnectionState } from '@/lib/storage'
import { canCompressInBrowser, compressVideoInBrowser } from '@/lib/videoCompress'
import { cn } from '@/lib/utils'
import type { FileType } from '@/types'

const CONCURRENCY = 2

// Deliverable videos above this size automatically get a low-bitrate review
// copy generated in the uploader's browser right after the upload — clients
// stream that copy, so slow connections play smoothly with zero manual steps.
const AUTO_PREVIEW_OVER_BYTES = 25 * 1024 * 1024

function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name)
}

interface Props {
  projectId: string
  fileType: FileType
  accept?: string
  maxSizeMb?: number
  onUploaded?: () => void
  disabled?: boolean
}

type FileStatus = 'queued' | 'uploading' | 'processing' | 'done' | 'error'

interface FileItem {
  id: number
  file: File
  status: FileStatus
  progress: number
  /** Connection substate while uploading (retrying / offline). */
  conn?: UploadConnectionState
  error?: string
}

let _id = 0
function nextId() { return ++_id }

export function FileUploader({ projectId, fileType, accept, maxSizeMb = 50000, onUploaded, disabled }: Props) {
  const storageAdapter = useStorageAdapter()
  const apiFetch = useApiFetch()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [items, setItems] = useState<FileItem[]>([])
  // track how many uploads are active right now
  const activeRef = useRef(0)
  // queue of item ids waiting to start
  const queueRef = useRef<number[]>([])

  const patch = (id: number, update: Partial<FileItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...update } : it)))

  const runNext = () => {
    if (activeRef.current >= CONCURRENCY) return
    const nextId = queueRef.current.shift()
    if (nextId == null) return
    activeRef.current++
    runUpload(nextId)
  }

  const runUpload = async (id: number) => {
    // grab the file from state snapshot via closure — use a ref-based lookup instead
    setItems((prev) => {
      const item = prev.find((it) => it.id === id)
      if (!item) return prev
      // kick off upload outside setState
      doUpload(item)
      return prev.map((it) => (it.id === id ? { ...it, status: 'uploading' as FileStatus } : it))
    })
  }

  const doUpload = async (item: FileItem) => {
    const { file } = item
    if (file.size > maxSizeMb * 1024 * 1024) {
      patch(item.id, { status: 'error', error: `Exceeds ${maxSizeMb} MB limit` })
      activeRef.current--
      runNext()
      return
    }
    let uploaded: { key: string; fileId?: string }
    try {
      uploaded = await storageAdapter.upload({
        file,
        projectId,
        fileType,
        onProgress: (pct) => patch(item.id, { progress: pct }),
        onConnectionState: (state) => patch(item.id, { conn: state }),
      })
      onUploaded?.()
    } catch (err: any) {
      patch(item.id, { status: 'error', conn: undefined, error: err?.message ?? 'Upload failed' })
      toast.error(`${file.name}: ${err?.message ?? 'Upload failed'}`)
      activeRef.current--
      runNext()
      return
    }
    // Upload finished — free the network slot for the next queued file. The
    // review-copy encode below is local CPU work and shouldn't block uploads.
    activeRef.current--
    runNext()

    // Automatic review copy: heavy deliverable videos get a ≤720p/~3 Mbit/s
    // copy generated right here (we still hold the original file locally —
    // the cheapest moment to do it). Failure is non-fatal: clients then
    // stream the original, and a copy can be generated later from the
    // deliverable list.
    if (
      fileType === 'deliverable' &&
      uploaded.fileId &&
      file.size > AUTO_PREVIEW_OVER_BYTES &&
      isVideoFile(file) &&
      canCompressInBrowser()
    ) {
      patch(item.id, { status: 'processing', progress: 0, conn: undefined })
      try {
        const small = await compressVideoInBrowser(file, (pct) => patch(item.id, { progress: pct }))
        patch(item.id, { status: 'processing', progress: 0 })
        const { key } = await storageAdapter.upload({
          file: small,
          projectId,
          fileType: 'deliverable',
          previewArtifact: true,
          onProgress: (pct) => patch(item.id, { progress: pct }),
        })
        await apiFetch(`/api/project-files/${uploaded.fileId}/preview`, {
          method: 'POST',
          body: JSON.stringify({ storage_key: key, file_size: small.size }),
        })
        onUploaded?.()
      } catch (e: any) {
        toast.info(`${file.name}: review copy not generated (${e?.message ?? 'unknown error'}) — clients will stream the original. You can generate one from the deliverable list.`)
      }
    }
    patch(item.id, { status: 'done', progress: 100, conn: undefined })
  }

  const retryItem = (id: number) => {
    patch(id, { status: 'queued', progress: 0, conn: undefined, error: undefined })
    queueRef.current.push(id)
    runNext()
  }

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return
    const newItems: FileItem[] = Array.from(files).map((file) => ({
      id: nextId(),
      file,
      status: 'queued',
      progress: 0,
    }))
    setItems((prev) => [...prev, ...newItems])
    newItems.forEach((it) => queueRef.current.push(it.id))
    // drain up to CONCURRENCY slots
    for (let i = 0; i < CONCURRENCY; i++) runNext()
  }

  const activeItems = items.filter((it) => it.status !== 'done')
  const hasActivity = items.length > 0

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'relative border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer',
          dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
          disabled && 'opacity-50 pointer-events-none',
        )}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="space-y-2">
          <div className="mx-auto w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <p className="text-sm text-foreground font-medium">
            Drop files here or <span className="text-primary">click to browse</span>
          </p>
          {maxSizeMb && <p className="text-xs text-muted-foreground">Max {maxSizeMb} MB per file</p>}
        </div>
      </div>

      {hasActivity && (
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.id} className="clay-card px-3 py-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                {it.status === 'done' && (
                  <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {it.status === 'error' && (
                  <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                {(it.status === 'uploading' || it.status === 'queued' || it.status === 'processing') && (
                  <div className={cn(
                    'w-3.5 h-3.5 rounded-full border-2 border-t-transparent flex-shrink-0',
                    it.status === 'queued' && 'border-muted-foreground',
                    it.status === 'processing' && 'border-secondary animate-spin',
                    it.status === 'uploading' && (it.conn === 'retrying' || it.conn === 'offline' ? 'border-amber-500 animate-spin' : 'border-primary animate-spin'),
                  )} />
                )}
                <p className="text-xs font-medium truncate flex-1">{it.file.name}</p>
                <span className={cn('text-[10px] flex-shrink-0', it.conn === 'retrying' || it.conn === 'offline' ? 'text-amber-500' : 'text-muted-foreground')}>
                  {it.status === 'queued' && 'Queued'}
                  {it.status === 'uploading' && (
                    it.conn === 'offline' ? 'Connection lost — will resume automatically'
                    : it.conn === 'retrying' ? `Connection unstable — retrying… ${it.progress}%`
                    : `${it.progress}%`
                  )}
                  {it.status === 'processing' && `Uploaded ✓ — generating review copy… ${it.progress}%`}
                  {it.status === 'done' && 'Done'}
                  {it.status === 'error' && 'Failed'}
                </span>
                {it.status === 'error' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); retryItem(it.id) }}
                    className="text-[10px] font-semibold text-primary hover:underline flex-shrink-0"
                  >
                    Retry
                  </button>
                )}
              </div>
              {(it.status === 'uploading' || it.status === 'processing') && (
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div className={cn(
                    'h-full transition-all duration-200',
                    it.conn === 'retrying' || it.conn === 'offline' ? 'bg-amber-500' : 'bg-gradient-to-r from-primary to-secondary',
                  )} style={{ width: `${it.progress}%` }} />
                </div>
              )}
              {it.status === 'error' && it.error && (
                <p className="text-[10px] text-red-500 mt-0.5">{it.error}</p>
              )}
            </div>
          ))}

          {activeItems.length === 0 && (
            <button
              onClick={() => setItems([])}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-center py-1"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
