import { useSyncExternalStore } from 'react'
import type { useApiFetch } from '@/lib/api'
import { uploadBatchFile } from '@/lib/storage'
import type { EnqueueItem, UploadRunArgs, UploadTask } from '@/lib/uploadManager'
import { grabFrame } from '@/lib/playbook'

// Batch upload: many videos → one project each. Each file is handed to the
// app's normal upload queue (useUploadManager().enqueue, unchanged): so it
// shows in the bottom-right upload panel like any upload, runs 2 at a time
// with everything else, and keeps going while the client looks at other
// pages. Inside the queue, a file uses the normal resumable upload into the
// client's waiting spot (uploadBatchFile); as soon as it has arrived its
// project is created (POST /api/batch/projects). A failed file is tried once
// more by itself, then waits for Retry (on its row or in the panel).
// The rows live here, outside the page, so they're still there on return.

export type RowStatus = 'ready' | 'queued' | 'uploading' | 'creating' | 'created' | 'failed' | 'over'
export interface BatchRow {
  id: string
  file: File
  title: string
  notes: string
  link: string
  script: string
  thumb?: string
  status: RowStatus
  progress: number
  key?: string
  projectId?: string
  error?: string
  /** The label it was queued under (finds its task in the upload panel). */
  queuedAs?: string
}
type ApiFetch = ReturnType<typeof useApiFetch>
type Enqueue = (items: EnqueueItem[]) => void
interface State { owner: string | null; rows: BatchRow[]; first: string | null; doneSent: boolean }

let state: State = { owner: null, rows: [], first: null, doneSent: false }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const set = (next: Partial<State>) => { state = { ...state, ...next }; emit(); guardUnload() }
const patch = (id: string, p: Partial<BatchRow>) => set({ rows: state.rows.map((r) => (r.id === id ? { ...r, ...p } : r)) })
const row = (id: string) => state.rows.find((r) => r.id === id)
const busy = (r: BatchRow) => r.status === 'queued' || r.status === 'uploading' || r.status === 'creating'

export function useBatch(owner: string | undefined) {
  const s = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => state)
  // Another account signed in on this device: never show their batch.
  if (owner && s.owner && s.owner !== owner && !s.rows.some(busy)) { state = { owner, rows: [], first: null, doneSent: false } }
  return state
}

// Warn before closing the page while anything is still going (the queue
// warns too while it uploads; this also covers "creating the project").
const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
let guarded = false
function guardUnload() {
  const on = state.rows.some(busy)
  if (on && !guarded) window.addEventListener('beforeunload', onBeforeUnload)
  if (!on && guarded) window.removeEventListener('beforeunload', onBeforeUnload)
  guarded = on
}

const titleFrom = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim()

export function addFiles(owner: string, files: File[]) {
  if (state.owner !== owner) state = { owner, rows: [], first: null, doneSent: false }
  const fresh = files.map((file) => ({ id: crypto.randomUUID(), file, title: titleFrom(file.name), notes: '', link: '', script: '', status: 'ready' as const, progress: 0 }))
  set({ owner, rows: [...state.rows, ...fresh] })
  void thumbs(fresh.map((r) => r.id))
}

// One still frame per video, one at a time (phones don't like decoding many).
async function thumbs(ids: string[]) {
  for (const id of ids) {
    const r = row(id)
    if (!r) continue
    const blob = await grabFrame(r.file).catch(() => null)
    if (blob && row(id)) patch(id, { thumb: URL.createObjectURL(blob) })
  }
}

export const editRow = (id: string, p: Partial<Pick<BatchRow, 'title' | 'notes' | 'link' | 'script'>>) => patch(id, p)

export function removeRow(id: string) {
  const r = row(id)
  if (!r || busy(r) || r.status === 'created') return
  if (r.thumb) URL.revokeObjectURL(r.thumb)
  set({ rows: state.rows.filter((x) => x.id !== id) })
}

/** Copy one row's notes, link and script to every row not sent yet. */
export function applyToAll(id: string) {
  const r = row(id)
  if (!r) return
  set({ rows: state.rows.map((x) => (x.id === id || x.status === 'created' || busy(x) ? x : { ...x, notes: r.notes, link: r.link, script: r.script })) })
}

function queue(ids: string[], enqueue: Enqueue, apiFetch: ApiFetch, onCreated: () => void) {
  const items: EnqueueItem[] = []
  for (const id of ids) {
    const r = row(id)!
    const label = r.title.trim()
    patch(id, { status: 'queued', error: undefined, queuedAs: label })
    items.push({
      file: r.file,
      label,
      invalidate: [['projects'], ['client', 'dashboard']],
      run: (args) => run(id, args, apiFetch, onCreated),
    })
  }
  enqueue(items)
}

/** Start every row that is ready. `slots` = how many more videos the plan
 *  allows (Infinity when unlimited): the rest are marked, not uploaded. */
export function startAll(enqueue: Enqueue, apiFetch: ApiFetch, slots: number, onCreated: () => void) {
  let free = slots - state.rows.filter((r) => busy(r)).length
  const go: string[] = []
  for (const r of state.rows) {
    if (r.status !== 'ready' && r.status !== 'over') continue
    if (free-- > 0) go.push(r.id)
    else patch(r.id, { status: 'over' })
  }
  queue(go, enqueue, apiFetch, onCreated)
}

/** Retry one row: the same task in the upload panel when it's still there
 *  (so it isn't listed twice), otherwise queued again. */
export function retryRow(id: string, tasks: UploadTask[], retryTask: (taskId: string) => void, enqueue: Enqueue, apiFetch: ApiFetch, onCreated: () => void) {
  const r = row(id)
  if (!r || r.status !== 'failed') return
  const task = tasks.find((t) => t.status === 'error' && t.name === r.file.name && t.label === r.queuedAs)
  if (task) { patch(id, { status: 'queued', error: undefined }); retryTask(task.id) }
  else queue([id], enqueue, apiFetch, onCreated)
}

/** Clear a finished batch (nothing running). */
export function clearBatch() {
  if (state.rows.some(busy)) return
  state.rows.forEach((r) => r.thumb && URL.revokeObjectURL(r.thumb))
  set({ rows: [], first: null, doneSent: false })
}

function maybeDone(apiFetch: ApiFetch) {
  if (!state.rows.some(busy) && state.first && !state.doneSent) {
    // The whole batch has finished: one email to the team.
    set({ doneSent: true })
    void apiFetch('/api/batch/done', { method: 'POST', body: JSON.stringify({ first: state.first }) }).catch(() => undefined)
  }
}

const friendly = (e: unknown) => {
  const m = (e as Error)?.message ?? ''
  if (m === 'active_project_limit_reached') return 'Video limit reached'
  if (m === 'storage_limit_reached') return 'Storage full'
  return m || 'Upload failed'
}
const final = (e: unknown) => { const s = (e as { status?: number })?.status; return s === 400 || s === 403 || s === 413 }

// Projects are asked for one after another, so the first one of the batch is
// known before the next (one grouped notification).
let creating: Promise<unknown> = Promise.resolve()

/** What the upload queue runs for one row. Throws when it failed, so the
 *  panel shows it as failed with its Retry. */
async function run(id: string, args: UploadRunArgs, apiFetch: ApiFetch, onCreated: () => void) {
  const r = row(id)
  if (!r) return
  patch(id, { status: r.key ? 'creating' : 'uploading', error: undefined })
  try {
    // 1. The file, unless it already arrived (a retry after a creation error).
    if (!r.key) {
      let key: string | undefined
      for (let attempt = 1; !key; attempt++) {
        try {
          key = await uploadBatchFile(apiFetch, {
            file: r.file,
            onProgress: (p) => { args.onProgress(p); patch(id, { progress: p }) },
            onConnectionState: args.onConnectionState,
          })
        } catch (e) {
          if (attempt >= 2 || final(e)) throw e // tried twice: wait for Retry
          patch(id, { progress: 0 }); args.onProgress(0)
        }
      }
      patch(id, { key, progress: 100 })
    }
    // 2. Its project, right away.
    patch(id, { status: 'creating' })
    const job = creating.catch(() => undefined).then(async (): Promise<{ id: string }> => {
      const cur = row(id)!
      let lastError: unknown
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          return await apiFetch<{ id: string }>('/api/batch/projects', {
            method: 'POST',
            body: JSON.stringify({
              key: cur.key, fileName: cur.file.name, fileSize: cur.file.size, mimeType: cur.file.type,
              title: cur.title.trim(), instructions: cur.notes.trim() || undefined,
              inspiration_url: cur.link.trim() || null, video_script: cur.script.trim() || null,
              first: state.first ?? undefined,
            }),
          })
        } catch (e) {
          lastError = e
          if (final(e)) break
          await new Promise((s) => setTimeout(s, 1500 * attempt))
        }
      }
      throw lastError
    })
    creating = job
    const made = await job
    if (!state.first) set({ first: made.id })
    patch(id, { status: 'created', projectId: made.id })
    onCreated()
  } catch (e) {
    patch(id, { status: 'failed', error: friendly(e), ...(final(e) ? { key: undefined } : {}) })
    throw new Error(friendly(e))
  } finally {
    maybeDone(apiFetch)
  }
}
