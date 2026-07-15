import { useApiFetch } from './api'
import {
  MULTIPART_THRESHOLD,
  MAX_PARTS,
  backoffDelayMs,
  computePartCount,
  computePartSize,
  createConnectionReporter,
  isNetworkError,
  type UploadConnectionState,
} from './uploadPlanner'
import type { FileType } from '@/types'

export type { UploadConnectionState }

export interface StorageAdapter {
  /** Upload a file. Returns an opaque storage key — never a URL — plus the
   *  registered project_files row id (absent for preview artifacts). */
  upload(params: {
    file: File
    projectId: string
    fileType: FileType
    onProgress?: (percent: number) => void
    /** Fires when the connection quality state changes (retrying/offline/uploading). */
    onConnectionState?: (state: UploadConnectionState) => void
    /** Review-copy bytes: skips project_files registration and the
     *  deliverable cap; stored under the project's preview/ key namespace.
     *  The caller attaches the returned key to a deliverable row via
     *  POST /api/project-files/:id/preview. */
    previewArtifact?: boolean
  }): Promise<{ key: string; fileId?: string }>

  /** Get a short-lived signed URL. Never cache or persist this. */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>

  /** Hard delete a file by key. (Requires the file's D1 id) */
  deleteById(id: string): Promise<void>
}

// Sizing/backoff policy lives in uploadPlanner.ts (unit-tested). Files at or
// above MULTIPART_THRESHOLD go multipart so an interruption costs one part
// instead of the whole file — that resume-not-restart property is worth the
// extra round-trips on anything a flaky connection takes minutes to move.
// 2, not 6: on a 2–5 Mbit/s uplink parallel streams starve each other — a
// part that gets no bandwidth for long enough trips the stall watchdog, its
// progress resets, and the upload looks like it "breaks down at 10%". Two
// streams keep the pipe full with far less mutual starvation.
const PART_CONCURRENCY = 2
const PART_MAX_RETRIES = 5
// Idle-progress timeout: abort a part PUT only if no bytes move for this long.
// Replaces the old total-time timeout, which would kill long-running parts
// even when they were uploading fine — just slowly. Generous on purpose: on
// congested Wi-Fi, progress events can genuinely pause for minutes while the
// link recovers — killing the part then just re-sends bytes we'd have kept.
const PART_IDLE_TIMEOUT_MS = 180_000 // 3 min with zero progress = stalled
// Refresh a presigned URL that's been sitting around longer than this before
// using it. Below the 24h server TTL with comfortable margin.
const URL_PROACTIVE_REFRESH_MS = 18 * 60 * 60 * 1000 // 18 hours

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { signal?.removeEventListener('abort', finish); resolve() }, ms)
    const finish = () => { clearTimeout(timer); resolve() }
    signal?.addEventListener('abort', finish, { once: true })
  })
}

/** One cheap reachability check against our own origin. `navigator.onLine`
 *  alone is NOT trustworthy: it reports "online" whenever a network interface
 *  is up, even if the link has zero real throughput (flaky Wi-Fi, dead
 *  cellular, captive portals) — which is exactly the "bad internet" case
 *  uploads kept dying on. version.txt is a ~10-byte static asset served with
 *  must-revalidate, so this costs almost nothing. */
async function probeReachable(signal?: AbortSignal): Promise<boolean> {
  const ctrl = new AbortController()
  // 8 s, not 5: while several parts saturate the uplink, even this tiny
  // probe's response can queue behind upload traffic — a too-tight timeout
  // reads a busy-but-healthy link as offline and pauses the upload for nothing.
  const timer = setTimeout(() => ctrl.abort(), 8000)
  const onAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    // ANY HTTP response proves the link works (a 404 in dev — version.txt only
    // exists in build output — still made a full round-trip). Only a rejected
    // fetch means the network path is actually down.
    await fetch(`/version.txt?probe=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** Resolve once the connection is VERIFIED working (probe round-trip), not
 *  merely when the browser claims to be online. Returns quickly when the
 *  link is actually fine. Resolves (without throwing) on abort — callers
 *  check the signal themselves. */
async function waitForConnectivity(signal?: AbortSignal): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    if (signal?.aborted) return
    if (typeof navigator === 'undefined' || navigator.onLine) {
      if (await probeReachable(signal)) return
    }
    if (signal?.aborted) return
    await sleep(Math.min(15_000, 2000 * attempt), signal)
  }
}

/** apiFetch with bad-network semantics for upload control-plane calls
 *  (multipart create/sign/complete, upload-url, register):
 *  - transport failures: wait for verified connectivity, retry indefinitely
 *    (the upload is paused, not dead — cancel via signal)
 *  - HTTP 5xx: transient server hiccup, retry a few times with backoff
 *  - HTTP 4xx: real answer (auth/validation/limits) — surface immediately */
async function apiFetchResilient<T>(
  apiFetch: ReturnType<typeof useApiFetch>,
  path: string,
  init: RequestInit,
  opts: { signal?: AbortSignal; onNetworkWait?: () => void } = {},
): Promise<T> {
  let serverErrors = 0
  for (;;) {
    if (opts.signal?.aborted) throw new Error('aborted')
    try {
      return await apiFetch<T>(path, init)
    } catch (err: any) {
      if (opts.signal?.aborted) throw new Error('aborted')
      if (typeof err?.status === 'number') {
        if (err.status < 500) throw err
        serverErrors++
        // 8 attempts ≈ 90 s of patience: losing a slow-link upload to a
        // transient burst of 5xx (e.g. at /complete) is far worse than waiting.
        if (serverErrors > 8) throw err
        await sleep(backoffDelayMs(Math.min(serverErrors, 4)), opts.signal)
        continue
      }
      if (!isNetworkError(err)) throw err
      opts.onNetworkWait?.()
      await waitForConnectivity(opts.signal)
    }
  }
}

/**
 * Creates a storage adapter bound to an apiFetch instance.
 * Must be called inside a React component or hook (uses useApiFetch internally).
 */
export function useStorageAdapter(): StorageAdapter {
  const apiFetch = useApiFetch()

  return {
    async upload({ file, projectId, fileType, onProgress, onConnectionState, previewArtifact }) {
      if (file.size >= MULTIPART_THRESHOLD) {
        const key = await uploadMultipart({ file, projectId, fileType, onProgress, onConnectionState, apiFetch, previewArtifact })
        if (previewArtifact) return { key }
        const registered = await registerWithRetry({ apiFetch, projectId, fileType, key, file })
        return { key, fileId: registered?.id }
      }

      // ── Single-PUT path (small files, < 32 MB) ──────────────────────────
      // A restart is cheap at this size, so no multipart bookkeeping — but the
      // failure policy matches multipart: transport-level failures pause the
      // upload until connectivity is VERIFIED, then retry; they never kill it.
      // Only real HTTP rejections (and repeated 5xx) fail the upload.
      const reporter = createConnectionReporter(onConnectionState)
      const requestUploadUrl = () =>
        apiFetchResilient<{ uploadUrl: string; key: string }>(
          apiFetch,
          '/api/project-files/upload-url',
          {
            method: 'POST',
            body: JSON.stringify({
              projectId,
              fileType,
              fileName: file.name,
              mimeType: file.type,
              fileSize: file.size,
              previewArtifact: previewArtifact ?? false,
            }),
          },
          { onNetworkWait: () => reporter.set('offline') },
        )

      let { uploadUrl, key } = await requestUploadUrl()
      reporter.set('uploading')

      let httpFailures = 0
      let netFailures = 0
      let expiredRefreshes = 0
      for (;;) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          reporter.set('offline')
          await waitForConnectivity()
          reporter.set('uploading')
        }
        try {
          await putBlob(uploadUrl, file, file.size, undefined, (loaded) => {
            onProgress?.(Math.round((loaded / file.size) * 100))
          }, { contentType: file.type || 'application/octet-stream', requireEtag: false })
          onProgress?.(100)
          reporter.set('uploading')
          break
        } catch (err: any) {
          if (err?.fatal) throw err
          onProgress?.(0)
          if (err?.expired) {
            // Presigned PUT URL expired (long stall / long pause). Get a fresh
            // one — this issues a new storage key, which is fine: the old key
            // was never written. Capped: persistent 403s are not expiry.
            expiredRefreshes++
            if (expiredRefreshes > 5) {
              throw new Error('storage keeps rejecting upload URLs (403) — this is not a connection problem, contact support')
            }
            ;({ uploadUrl, key } = await requestUploadUrl())
            continue
          }
          if (isNetworkError(err)) {
            netFailures++
            reporter.set(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'retrying')
            await waitForConnectivity()
            // Probe verified the link — retry immediately; only pause when
            // failures repeat back-to-back (see multipart path).
            if (netFailures > 2) {
              await sleep(Math.min(2000, 500 * (netFailures - 2)) + Math.random() * 300)
            }
            continue
          }
          // Real HTTP rejection from R2 (not expiry): retry a little, then surface.
          httpFailures++
          if (httpFailures >= 3) throw err
          reporter.set('retrying')
          await sleep(backoffDelayMs(httpFailures))
        }
      }

      if (previewArtifact) return { key }
      const registered = await registerWithRetry({ apiFetch, projectId, fileType, key, file })
      return { key, fileId: registered?.id }
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

/** Playback source with quality info: clients may get the low-bitrate review
 *  copy ('preview'); pass forceOriginal to demand the original — the player's
 *  automatic fallback when a preview turns out to be unplayable. */
export async function getPlaybackSource(
  apiFetch: ReturnType<typeof useApiFetch>,
  fileId: string,
  opts: { forceOriginal?: boolean } = {},
): Promise<{ signedUrl: string; quality: 'preview' | 'original' }> {
  const qs = opts.forceOriginal ? '?original=1' : ''
  const res = await apiFetch<{ signedUrl: string; quality?: 'preview' | 'original' }>(
    `/api/project-files/${fileId}/signed-url${qs}`
  )
  return { signedUrl: res.signedUrl, quality: res.quality ?? 'original' }
}

// ── Multipart upload ────────────────────────────────────────────────────────
// Splits the file into computePartSize() chunks, uploads PART_CONCURRENCY at a time
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
  onConnectionState?: (state: UploadConnectionState) => void
  apiFetch: ReturnType<typeof useApiFetch>
  previewArtifact?: boolean
}): Promise<string> {
  const { file, projectId, fileType, onProgress, onConnectionState, apiFetch, previewArtifact } = args
  const reporter = createConnectionReporter(onConnectionState)

  const partSize = computePartSize(file.size)
  const partCount = computePartCount(file.size, partSize)
  if (partCount > MAX_PARTS) {
    throw new Error(`File too large: would require ${partCount} parts (max ${MAX_PARTS})`)
  }

  const { key, uploadId, partUrls } = await apiFetchResilient<{
    key: string
    uploadId: string
    partUrls: Array<{ partNumber: number; url: string }>
  }>(apiFetch, '/api/project-files/multipart/create', {
    method: 'POST',
    body: JSON.stringify({
      projectId,
      fileType,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      partCount,
      previewArtifact: previewArtifact ?? false,
    }),
  }, { onNetworkWait: () => reporter.set('offline') })
  reporter.set('uploading')

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
    // Resilient: a dropped connection during re-sign pauses and retries
    // instead of throwing out of the part loop and killing the whole upload.
    const { partUrls: refreshed } = await apiFetchResilient<{
      partUrls: Array<{ partNumber: number; url: string }>
    }>(apiFetch, '/api/project-files/multipart/sign', {
      method: 'POST',
      body: JSON.stringify({ key, uploadId, partNumbers: [partNumber] }),
    }, { signal: abortController.signal, onNetworkWait: () => reporter.set('offline') })
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
    const start = (partNumber - 1) * partSize
    const end = Math.min(start + partSize, file.size)
    const blob = file.slice(start, end)
    const blobSize = end - start

    // Failure policy: transport-level failures (drop, stall, DNS) NEVER kill
    // the upload — on a bad connection they are expected. We pause until the
    // link passes a real reachability probe, back off a little, and try the
    // part again; completed parts are never thrown away. Only genuine HTTP
    // rejections (and fatal config errors) consume the retry budget.
    let httpFailures = 0
    let netFailures = 0
    let serverFailures = 0
    let expiredRefreshes = 0
    for (;;) {
      if (abortController.signal.aborted) throw new Error('aborted')
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        reporter.set('offline')
        await waitForConnectivity(abortController.signal)
        if (abortController.signal.aborted) throw new Error('aborted')
        reporter.set('uploading')
      }
      // Pre-refresh the URL if it's near server-side expiry. Cheap on the
      // happy path (one Map lookup + Date.now()).
      const url = await getFreshUrl(partNumber)
      try {
        const etag = await putBlob(url, blob, blobSize, abortController.signal, (loaded) => {
          bytesByPart[partNumber - 1] = loaded
          reportProgress()
        }, { requireEtag: true })
        bytesByPart[partNumber - 1] = blobSize
        reportProgress()
        reporter.set('uploading')
        return { partNumber, etag }
      } catch (err: any) {
        if (abortController.signal.aborted) throw err
        if (err?.fatal) throw err
        bytesByPart[partNumber - 1] = 0
        reportProgress()
        // 403 = stale presigned URL: free retry, no backoff, no budget cost —
        // but CAPPED. A 403 that persists across fresh URLs is not expiry
        // (credentials/CORS/clock), and refreshing forever spins the upload.
        if (err?.expired) {
          expiredRefreshes++
          if (expiredRefreshes > 5) {
            throw new Error('storage keeps rejecting upload URLs (403) — this is not a connection problem, contact support')
          }
          await refreshUrl(partNumber)
          continue
        }
        if (isNetworkError(err)) {
          netFailures++
          reporter.set(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'retrying')
          await waitForConnectivity(abortController.signal)
          if (abortController.signal.aborted) throw new Error('aborted')
          // The probe just verified a working link — sleeping on top of it is
          // dead time that makes flaky-connection uploads feel slow. Retry
          // immediately; add only a short jittered pause when THIS part keeps
          // dying instantly despite passing probes (avoids a tight loop).
          if (netFailures > 2) {
            await sleep(Math.min(2000, 500 * (netFailures - 2)) + Math.random() * 300, abortController.signal)
          }
          continue
        }
        // R2 5xx = transient server trouble. On a slow link a killed upload
        // costs the user an hour of transfer — pause and retry indefinitely
        // (capped backoff, cancellable) instead of dying.
        if (typeof err?.status === 'number' && err.status >= 500) {
          serverFailures++
          reporter.set('retrying')
          await sleep(backoffDelayMs(Math.min(serverFailures, 4)), abortController.signal)
          continue
        }
        // 4xx rejection from R2 on this part (not expiry): a real refusal.
        httpFailures++
        if (httpFailures >= PART_MAX_RETRIES) {
          throw new Error(`part ${partNumber} was rejected ${PART_MAX_RETRIES} times: ${err?.message ?? 'unknown'}`)
        }
        reporter.set('retrying')
        await sleep(backoffDelayMs(httpFailures), abortController.signal)
      }
    }
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
  // Resilient: after every byte is uploaded, a flaky connection must not be
  // able to kill the upload at the finish line — network failures here pause
  // and retry. Only a genuine server rejection abandons the parts.
  completed.sort((a, b) => a.partNumber - b.partNumber)
  try {
    await apiFetchResilient(apiFetch, '/api/project-files/multipart/complete', {
      method: 'POST',
      body: JSON.stringify({ key, uploadId, parts: completed }),
    }, { onNetworkWait: () => reporter.set('offline') })
  } catch (err) {
    apiFetch('/api/project-files/multipart/abort', {
      method: 'POST',
      body: JSON.stringify({ key, uploadId }),
    }).catch(() => {})
    throw err
  }

  onProgress?.(100)
  return key
}

/**
 * PUT a blob (a multipart part, or a whole small file) to its presigned URL,
 * with an idle-progress watchdog instead of a wall-clock timeout.
 *
 * With `requireEtag` (multipart parts): resolves with the ETag from the
 * response headers — later passed to CompleteMultipartUpload so R2 can verify
 * part integrity before assembling the final object. Without it (single-file
 * PUT): resolves with '' and sends `contentType` so R2 stores the real type.
 */
function putBlob(
  url: string,
  blob: Blob,
  size: number,
  signal: AbortSignal | undefined,
  onLoaded: (loaded: number) => void,
  opts: { contentType?: string; requireEtag: boolean },
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('aborted')); return }
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    if (opts.contentType) xhr.setRequestHeader('Content-Type', opts.contentType)

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
    signal?.addEventListener('abort', onAbort, { once: true })
    let settled = false
    const cleanup = () => {
      if (settled) return
      settled = true
      disarmIdle()
      signal?.removeEventListener('abort', onAbort)
    }
    const finishResolve = (v: string) => { if (!settled) { cleanup(); resolve(v) } }
    const finishReject = (e: any) => { if (!settled) { cleanup(); reject(e) } }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && !signal?.aborted) {
        onLoaded(e.loaded)
        armIdle()
      }
    }
    xhr.upload.onloadstart = () => armIdle()

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (!opts.requireEtag) {
          onLoaded(size)
          finishResolve('')
          return
        }
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
        const err: any = new Error('upload rejected (403) — URL expired')
        err.expired = true
        finishReject(err)
      } else {
        const msg = xhr.responseText?.match(/<Message>(.*?)<\/Message>/)?.[1]
        const err: any = new Error(msg ?? `upload failed (${xhr.status})`)
        err.status = xhr.status
        finishReject(err)
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
}): Promise<{ id?: string } | null> {
  const { apiFetch, projectId, fileType, key, file } = args
  try {
    // Resilient: the file is already safe in R2 at this point — losing the
    // registration to a network blip would orphan it, so network failures
    // wait for connectivity and retry rather than giving up after 3 tries.
    return await apiFetchResilient<{ id?: string }>(apiFetch, '/api/project-files/register', {
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
  } catch (e: any) {
    throw new Error(`File uploaded but failed to register: ${e?.message ?? 'unknown error'}. Contact support.`)
  }
}
