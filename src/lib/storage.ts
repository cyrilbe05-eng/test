import { useApiFetch } from './api'
import type { FileType } from '@/types'

export interface StorageAdapter {
  /** Upload a file. Returns an opaque storage key — never a URL. */
  upload(params: {
    file: File
    projectId: string
    fileType: FileType
    onProgress?: (percent: number) => void
  }): Promise<{ key: string }>

  /** Get a short-lived signed URL. Never cache or persist this. */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>

  /** Hard delete a file by key. (Requires the file's D1 id) */
  deleteById(id: string): Promise<void>
}

// Multipart kicks in only when a single PUT physically can't handle the file.
// R2's single-PUT hard ceiling is 5 GB; below that, single-PUT is faster
// because multipart adds N+2 round-trips and serializes throughput across
// PART_CONCURRENCY parallel connections. We pick 4.5 GB as the threshold to
// give a safety margin under R2's 5 GB cap.
const MULTIPART_THRESHOLD = 4.5 * 1024 * 1024 * 1024 // 4.5 GB
const PART_SIZE = 250 * 1024 * 1024 // 250 MB per part — fewer round-trips, retry cost still modest
const PART_CONCURRENCY = 6
const PART_MAX_RETRIES = 5
// Idle-progress timeout: abort a part PUT only if no bytes move for this long.
// Replaces the old total-time timeout, which would kill long-running parts
// even when they were uploading fine — just slowly.
const PART_IDLE_TIMEOUT_MS = 90_000 // 90s with zero progress = stalled
// Refresh a presigned URL that's been sitting around longer than this before
// using it. Below the 24h server TTL with comfortable margin.
const URL_PROACTIVE_REFRESH_MS = 18 * 60 * 60 * 1000 // 18 hours

/**
 * Creates a storage adapter bound to an apiFetch instance.
 * Must be called inside a React component or hook (uses useApiFetch internally).
 */
export function useStorageAdapter(): StorageAdapter {
  const apiFetch = useApiFetch()

  return {
    async upload({ file, projectId, fileType, onProgress }) {
      if (file.size >= MULTIPART_THRESHOLD) {
        const key = await uploadMultipart({ file, projectId, fileType, onProgress, apiFetch })
        await registerWithRetry({ apiFetch, projectId, fileType, key, file })
        return { key }
      }

      // ── Single-PUT path (small files) ───────────────────────────────────
      const { uploadUrl, key } = await apiFetch<{ uploadUrl: string; key: string }>(
        '/api/project-files/upload-url',
        {
          method: 'POST',
          body: JSON.stringify({
            projectId,
            fileType,
            fileName: file.name,
            mimeType: file.type,
          }),
        }
      )

      const MAX_RETRIES = 3
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            xhr.open('PUT', uploadUrl)
            xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')

            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                onProgress?.(Math.round((e.loaded / e.total) * 100))
              }
            }

            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                onProgress?.(100)
                resolve()
              } else {
                const msg = xhr.responseText?.match(/<Message>(.*?)<\/Message>/)?.[1]
                reject(new Error(msg ?? `Upload failed (${xhr.status})`))
              }
            }

            xhr.onerror = () => reject(new Error('network'))
            xhr.onabort = () => reject(new Error('Upload was cancelled'))
            xhr.ontimeout = () => reject(new Error('network'))
            xhr.timeout = Math.max(300_000, Math.ceil(file.size / (10 * 1024 * 1024)) * 60_000)
            xhr.send(file)
          })
          break
        } catch (err: any) {
          const isRetryable = err.message === 'network'
          if (!isRetryable || attempt === MAX_RETRIES) throw isRetryable
            ? new Error(`Upload failed after ${MAX_RETRIES} attempts — check your connection`)
            : err
          onProgress?.(0)
          await new Promise((r) => setTimeout(r, attempt * 1500))
        }
      }

      await registerWithRetry({ apiFetch, projectId, fileType, key, file })
      return { key }
    },

    async getSignedUrl(_key, _expiresInSeconds = 3600) {
      throw new Error('getSignedUrl(key) is not supported. Use getSignedUrlById(apiFetch, fileId) instead.')
    },

    async deleteById(id: string) {
      await apiFetch(`/api/project-files/${id}`, { method: 'DELETE' })
    },
  }
}

// Keep a plain (non-hook) version for components that use getSignedUrl by file id.
// Pass `forDownload: true` to get a URL that forces a Save As dialog with the
// original filename + correct content-type (mobile browsers otherwise sniff
// the bytes and save with a wrong extension that opens as text/gibberish).
// Default (no flag) returns an inline URL suitable for the video player.
export async function getSignedUrlById(
  apiFetch: ReturnType<typeof useApiFetch>,
  fileId: string,
  forDownload = false,
): Promise<string> {
  const qs = forDownload ? '?download=1' : ''
  const { signedUrl } = await apiFetch<{ signedUrl: string }>(
    `/api/project-files/${fileId}/signed-url${qs}`
  )
  return signedUrl
}

// ── Multipart upload ────────────────────────────────────────────────────────
// Splits the file into PART_SIZE chunks, uploads PART_CONCURRENCY at a time
// directly to R2 via presigned URLs, retries each chunk independently on
// network failure, then asks the API to assemble the parts.
//
// Corruption protection: each PUT response carries an ETag (R2's hash of the
// chunk it received). We pass those ETags back at complete time. If any part
// got corrupted in transit the ETag won't match what R2 has stored, R2 rejects
// the complete call, and the final object is never created — so a corrupted
// upload can't silently succeed.

async function uploadMultipart(args: {
  file: File
  projectId: string
  fileType: FileType
  onProgress?: (percent: number) => void
  apiFetch: ReturnType<typeof useApiFetch>
}): Promise<string> {
  const { file, projectId, fileType, onProgress, apiFetch } = args

  const partCount = Math.ceil(file.size / PART_SIZE)
  if (partCount > 10000) {
    throw new Error(`File too large: would require ${partCount} parts (max 10000)`)
  }

  const { key, uploadId, partUrls } = await apiFetch<{
    key: string
    uploadId: string
    partUrls: Array<{ partNumber: number; url: string }>
  }>('/api/project-files/multipart/create', {
    method: 'POST',
    body: JSON.stringify({
      projectId,
      fileType,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      partCount,
    }),
  })

  // Map partNumber → { url, signedAt } so we can pre-refresh URLs that are
  // close to their server-side TTL before sending. Without this, parts started
  // late in a multi-hour upload would hit 403 on first attempt and waste a
  // full retry round-trip.
  const startedAt = Date.now()
  const urlByPart = new Map<number, { url: string; signedAt: number }>(
    partUrls.map((p) => [p.partNumber, { url: p.url, signedAt: startedAt }]),
  )

  // Track per-part bytes uploaded so combined progress stays smooth even when
  // parts upload concurrently and finish out of order.
  const bytesByPart = new Array(partCount).fill(0)
  const reportProgress = () => {
    const total = bytesByPart.reduce((a, b) => a + b, 0)
    onProgress?.(Math.min(100, Math.round((total / file.size) * 100)))
  }

  const completed: Array<{ partNumber: number; etag: string }> = []
  // AbortController stops in-flight XHRs the moment one worker fails — without
  // this, surviving workers keep streaming parts to R2 after we've decided to
  // abort, wasting bandwidth and racing the /abort cleanup call.
  const abortController = new AbortController()

  const refreshUrl = async (partNumber: number): Promise<string> => {
    const { partUrls: refreshed } = await apiFetch<{
      partUrls: Array<{ partNumber: number; url: string }>
    }>('/api/project-files/multipart/sign', {
      method: 'POST',
      body: JSON.stringify({ key, uploadId, partNumbers: [partNumber] }),
    })
    const url = refreshed[0]?.url
    if (!url) throw new Error('failed to refresh part URL')
    urlByPart.set(partNumber, { url, signedAt: Date.now() })
    return url
  }

  // Return a usable URL for a part, refreshing proactively if the cached one
  // is older than URL_PROACTIVE_REFRESH_MS. This keeps multi-hour uploads
  // from hitting an avoidable 403 on the first attempt of late parts.
  const getFreshUrl = async (partNumber: number): Promise<string> => {
    const cached = urlByPart.get(partNumber)!
    if (Date.now() - cached.signedAt < URL_PROACTIVE_REFRESH_MS) return cached.url
    return refreshUrl(partNumber)
  }

  const uploadOnePart = async (partNumber: number): Promise<{ partNumber: number; etag: string }> => {
    const start = (partNumber - 1) * PART_SIZE
    const end = Math.min(start + PART_SIZE, file.size)
    const blob = file.slice(start, end)
    const partSize = end - start

    let lastErr: any
    let attempt = 0
    while (attempt < PART_MAX_RETRIES) {
      if (abortController.signal.aborted) throw new Error('aborted')
      // Pre-refresh the URL if it's near server-side expiry. Cheap on the
      // happy path (one Map lookup + Date.now()).
      const url = await getFreshUrl(partNumber)
      try {
        const etag = await putPart(url, blob, partSize, abortController.signal, (loaded) => {
          bytesByPart[partNumber - 1] = loaded
          reportProgress()
        })
        bytesByPart[partNumber - 1] = partSize
        reportProgress()
        return { partNumber, etag }
      } catch (err: any) {
        if (abortController.signal.aborted) throw err
        if (err?.fatal) throw err
        lastErr = err
        bytesByPart[partNumber - 1] = 0
        reportProgress()
        // 403 = stale presigned URL: free retry, no backoff, no budget cost.
        // The URL was definitely the problem — refresh and immediately retry.
        if (err?.expired) {
          await refreshUrl(partNumber)
          continue
        }
        attempt++
        if (attempt >= PART_MAX_RETRIES) break
        // exponential-ish backoff with jitter
        const delay = Math.min(15_000, 1000 * 2 ** (attempt - 1)) + Math.random() * 500
        await new Promise((r) => setTimeout(r, delay))
      }
    }
    throw new Error(`part ${partNumber} failed after ${PART_MAX_RETRIES} attempts: ${lastErr?.message ?? 'unknown'}`)
  }

  // Concurrency-limited fan-out. We pull from a shared cursor so the worker
  // count stays at PART_CONCURRENCY regardless of which parts finish first.
  let cursor = 1
  const workers = Array.from({ length: Math.min(PART_CONCURRENCY, partCount) }, async () => {
    while (cursor <= partCount && !abortController.signal.aborted) {
      const n = cursor++
      const result = await uploadOnePart(n)
      completed.push(result)
    }
  })

  try {
    await Promise.all(workers)
  } catch (err) {
    abortController.abort()
    // Best-effort cleanup so abandoned parts don't accrue R2 storage cost.
    apiFetch('/api/project-files/multipart/abort', {
      method: 'POST',
      body: JSON.stringify({ key, uploadId }),
    }).catch(() => {})
    throw err
  }

  // R2 assembles parts in partNumber order; sort just to be explicit/stable.
  completed.sort((a, b) => a.partNumber - b.partNumber)
  await apiFetch('/api/project-files/multipart/complete', {
    method: 'POST',
    body: JSON.stringify({ key, uploadId, parts: completed }),
  })

  onProgress?.(100)
  return key
}

/**
 * PUT a single part to its presigned URL. Resolves with the ETag from the
 * response headers — that ETag is later passed to CompleteMultipartUpload so
 * R2 can verify part integrity before assembling the final object.
 */
function putPart(
  url: string,
  blob: Blob,
  size: number,
  signal: AbortSignal,
  onLoaded: (loaded: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('aborted')); return }
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)

    // Idle-progress watchdog: fires only when the upload has stopped moving
    // bytes for PART_IDLE_TIMEOUT_MS. Replaces xhr.timeout (which counts
    // total wallclock time and can kill long-but-progressing uploads).
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    const armIdle = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        try { xhr.abort() } catch {}
        // Distinct error message so the caller doesn't confuse it with a
        // user-initiated abort.
        finishReject(new Error('part upload stalled — no progress'))
      }, PART_IDLE_TIMEOUT_MS)
    }
    const disarmIdle = () => { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null } }

    const onAbort = () => {
      try { xhr.abort() } catch {}
    }
    signal.addEventListener('abort', onAbort, { once: true })
    let settled = false
    const cleanup = () => {
      if (settled) return
      settled = true
      disarmIdle()
      signal.removeEventListener('abort', onAbort)
    }
    const finishResolve = (v: string) => { if (!settled) { cleanup(); resolve(v) } }
    const finishReject = (e: any) => { if (!settled) { cleanup(); reject(e) } }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && !signal.aborted) {
        onLoaded(e.loaded)
        armIdle()
      }
    }
    xhr.upload.onloadstart = () => armIdle()

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // R2/S3 returns the part hash in the ETag header. CORS must expose it
        // (ExposeHeaders: ["ETag"]) — without that, getResponseHeader returns
        // null and we cannot complete the upload.
        const etag = xhr.getResponseHeader('ETag') || xhr.getResponseHeader('etag')
        if (!etag) {
          const err: any = new Error('R2 did not expose ETag header — check bucket CORS (ExposeHeaders must include ETag)')
          err.fatal = true
          finishReject(err); return
        }
        onLoaded(size)
        // Strip surrounding quotes only — keep any embedded chars intact.
        finishResolve(etag.replace(/^"|"$/g, ''))
      } else if (xhr.status === 403) {
        // Stale presigned URL — caller treats this as a free retry with re-sign.
        const err: any = new Error('part rejected (403) — URL expired')
        err.expired = true
        finishReject(err)
      } else {
        const msg = xhr.responseText?.match(/<Message>(.*?)<\/Message>/)?.[1]
        finishReject(new Error(msg ?? `part upload failed (${xhr.status})`))
      }
    }

    xhr.onerror = () => finishReject(new Error('network'))
    xhr.onabort = () => finishReject(new Error('aborted'))
    // We deliberately don't set xhr.timeout — the idle-progress watchdog
    // above is the single source of timeout truth, so a slow-but-moving
    // upload of a 100 MB part on a 1 MB/s link can run for ~100s without
    // being killed.
    xhr.send(blob)
  })
}

async function registerWithRetry(args: {
  apiFetch: ReturnType<typeof useApiFetch>
  projectId: string
  fileType: FileType
  key: string
  file: File
}): Promise<void> {
  const { apiFetch, projectId, fileType, key, file } = args
  let registerErr: Error | null = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await apiFetch('/api/project-files/register', {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          file_type: fileType,
          storage_key: key,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
        }),
      })
      registerErr = null
      break
    } catch (e: any) {
      registerErr = e
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1000))
    }
  }
  if (registerErr) {
    throw new Error(`File uploaded but failed to register: ${registerErr.message ?? 'unknown error'}. Contact support.`)
  }
}
