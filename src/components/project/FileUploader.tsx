import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useStorageAdapter } from '@/lib/storage'
import { cn } from '@/lib/utils'
import type { FileType } from '@/types'

const CONCURRENCY = 2

interface Props {
  projectId: string
  fileType: FileType
  accept?: string
  maxSizeMb?: number
  onUploaded?: () => void
  disabled?: boolean
}

type FileStatus = 'queued' | 'uploading' | 'done' | 'error'

interface FileItem {
  id: number
  file: File
  status: FileStatus
  progress: number
  error?: string
}

let _id = 0
function nextId() { return ++_id }

export function FileUploader({ projectId, fileType, accept, maxSizeMb = 2000, onUploaded, disabled }: Props) {
  const storageAdapter = useStorageAdapter()
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
    try {
      await storageAdapter.upload({
        file,
        projectId,
        fileType,
        onProgress: (pct) => patch(item.id, { progress: pct }),
      })
      patch(item.id, { status: 'done', progress: 100 })
      onUploaded?.()
    } catch (err: any) {
      patch(item.id, { status: 'error', error: err?.message ?? 'Upload failed' })
      toast.error(`${file.name}: ${err?.message ?? 'Upload failed'}`)
    } finally {
      activeRef.current--
      runNext()
    }
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
                {(it.status === 'uploading' || it.status === 'queued') && (
                  <div className={cn('w-3.5 h-3.5 rounded-full border-2 border-t-transparent flex-shrink-0', it.status === 'uploading' ? 'border-primary animate-spin' : 'border-muted-foreground')} />
                )}
                <p className="text-xs font-medium truncate flex-1">{it.file.name}</p>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                  {it.status === 'queued' && 'Queued'}
                  {it.status === 'uploading' && `${it.progress}%`}
                  {it.status === 'done' && 'Done'}
                  {it.status === 'error' && 'Failed'}
                </span>
              </div>
              {it.status === 'uploading' && (
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-200" style={{ width: `${it.progress}%` }} />
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
