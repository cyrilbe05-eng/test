import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { UploadConnectionState } from '@/lib/storage'

/**
 * App-level upload queue (Google-Drive style).
 *
 * Uploads used to run inside the page component that started them, so leaving
 * the page killed the transfer — users had to sit and watch a 45-minute batch.
 * The provider lives at the app root, above the router, so uploads keep
 * running while the user navigates anywhere else; progress is surfaced by the
 * floating UploadDock instead of inline UI.
 *
 * Callers supply their own `run` closure, so the manager stays agnostic about
 * project files vs gallery vs review copies. Everything a `run` needs must be
 * captured at enqueue time (apiFetch reads the token per call, so it keeps
 * working after the caller unmounts).
 */

export type UploadTaskStatus = 'queued' | 'uploading' | 'done' | 'error'

export interface UploadTask {
  id: string
  name: string
  size: number
  /** Short context line, e.g. "Deliverable · Spring Ad" or "Gallery". */
  label?: string
  status: UploadTaskStatus
  progress: number
  conn?: UploadConnectionState
  error?: string
}

export interface UploadRunArgs {
  onProgress: (percent: number) => void
  onConnectionState: (state: UploadConnectionState) => void
}

export interface EnqueueItem {
  file: File
  label?: string
  run: (args: UploadRunArgs) => Promise<void>
  /** Query keys to invalidate once this file lands (manager owns the client,
   *  so refreshes work even if the originating page has unmounted). */
  invalidate?: unknown[][]
}

interface UploadManagerValue {
  tasks: UploadTask[]
  enqueue: (items: EnqueueItem[]) => void
  retry: (id: string) => void
  clearFinished: () => void
  activeCount: number
}

const UploadManagerContext = createContext<UploadManagerValue | null>(null)

// Two files at a time: each file internally fans out to adaptive 2–6 part
// streams, so more files in parallel would just split the same pipe.
const FILE_CONCURRENCY = 2

let taskSeq = 0
const nextTaskId = () => `u${++taskSeq}`

export function UploadManagerProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()
  const [tasks, setTasks] = useState<UploadTask[]>([])
  const queueRef = useRef<Array<{ id: string; item: EnqueueItem }>>([])
  const activeRef = useRef(0)
  const itemsRef = useRef<Map<string, EnqueueItem>>(new Map())

  const patch = useCallback((id: string, update: Partial<UploadTask>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...update } : t)))
  }, [])

  const pump = useCallback(() => {
    while (activeRef.current < FILE_CONCURRENCY && queueRef.current.length > 0) {
      const next = queueRef.current.shift()!
      activeRef.current++
      void (async () => {
        patch(next.id, { status: 'uploading', progress: 0, error: undefined })
        try {
          await next.item.run({
            onProgress: (p) => patch(next.id, { progress: p }),
            onConnectionState: (c) => patch(next.id, { conn: c }),
          })
          patch(next.id, { status: 'done', progress: 100, conn: undefined })
          for (const key of next.item.invalidate ?? []) {
            qc.invalidateQueries({ queryKey: key })
          }
        } catch (e: any) {
          patch(next.id, { status: 'error', conn: undefined, error: e?.message ?? 'Upload failed' })
        } finally {
          activeRef.current--
          pump()
        }
      })()
    }
  }, [patch, qc])

  const enqueue = useCallback((items: EnqueueItem[]) => {
    if (items.length === 0) return
    const created = items.map((item) => ({ id: nextTaskId(), item }))
    setTasks((prev) => [
      ...prev,
      ...created.map(({ id, item }) => ({
        id,
        name: item.file.name,
        size: item.file.size,
        label: item.label,
        status: 'queued' as UploadTaskStatus,
        progress: 0,
      })),
    ])
    for (const c of created) {
      itemsRef.current.set(c.id, c.item)
      queueRef.current.push(c)
    }
    pump()
  }, [pump])

  const retry = useCallback((id: string) => {
    const item = itemsRef.current.get(id)
    if (!item) return
    patch(id, { status: 'queued', progress: 0, error: undefined, conn: undefined })
    queueRef.current.push({ id, item })
    pump()
  }, [patch, pump])

  const clearFinished = useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.status === 'queued' || t.status === 'uploading'))
  }, [])

  const activeCount = tasks.filter((t) => t.status === 'queued' || t.status === 'uploading').length

  // Closing the tab mid-upload loses the transfer — warn first.
  useEffect(() => {
    if (activeCount === 0) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [activeCount])

  return (
    <UploadManagerContext.Provider value={{ tasks, enqueue, retry, clearFinished, activeCount }}>
      {children}
    </UploadManagerContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- standard context + hook pairing
export function useUploadManager(): UploadManagerValue {
  const ctx = useContext(UploadManagerContext)
  if (!ctx) throw new Error('useUploadManager must be used within UploadManagerProvider')
  return ctx
}
