/**
 * Pure planning helpers for the upload pipeline (src/lib/storage.ts).
 * Kept free of DOM/network so the sizing and backoff behaviour is unit-testable.
 */

// Tuned for the operator's real-world uplink: 2–5 Mbit/s (~0.25–0.6 MB/s)
// and flaky. Every constant below assumes that link, not office fibre.

/** Files at or above this size upload via R2 multipart so an interruption
 *  costs one part, not the whole file. At 0.4 MB/s a 16 MB restart already
 *  costs ~40 s — anything bigger must be resumable. */
export const MULTIPART_THRESHOLD = 16 * 1024 * 1024 // 16 MB

/** Smallest part we ever use. S3/R2 require ≥5 MB (except the last part).
 *  8 MB ≈ 20–30 s per part at 2–4 Mbit/s, so a connection that drops every
 *  minute still completes parts and loses at most a few MB per drop. */
export const MIN_PART_SIZE = 8 * 1024 * 1024 // 8 MB

/** Aim for at most this many parts; bigger files get bigger parts.
 *  2000 × 8 MB keeps small parts up to 16 GB files (part-count overhead is
 *  trivial next to transfer time on a slow link). */
export const TARGET_MAX_PARTS = 2000

/** Hard S3/R2 protocol limit. */
export const MAX_PARTS = 10_000

/** Part size for a given file: MIN_PART_SIZE, scaled up so the part count
 *  stays around TARGET_MAX_PARTS for very large files. */
export function computePartSize(fileSize: number): number {
  return Math.max(MIN_PART_SIZE, Math.ceil(fileSize / TARGET_MAX_PARTS))
}

export function computePartCount(fileSize: number, partSize: number): number {
  return Math.max(1, Math.ceil(fileSize / partSize))
}

/** Exponential backoff with jitter, capped. attempt is 1-based. */
export function backoffDelayMs(
  attempt: number,
  { baseMs = 1000, capMs = 15_000 }: { baseMs?: number; capMs?: number } = {},
  random: () => number = Math.random,
): number {
  return Math.min(capMs, baseMs * 2 ** (attempt - 1)) + random() * 500
}

/** Distinguishes transport-level failures (no HTTP response ever arrived:
 *  connection drop, DNS, stall-abort, fetch TypeError) from real HTTP
 *  responses. Transport failures are ALWAYS treated as transient — we wait
 *  for verified connectivity and try again rather than failing the upload,
 *  because on a flaky link they are the norm, not the exception. */
export function isNetworkError(err: unknown): boolean {
  const e = err as { status?: unknown; name?: string; message?: unknown } | null
  if (!e) return false
  if (typeof e.status === 'number') return false // an HTTP response arrived
  const msg = typeof e.message === 'string' ? e.message : ''
  return (
    e.name === 'TypeError' || // fetch() network failure
    msg === 'network' || // our XHR onerror/ontimeout marker
    msg.includes('stalled') || // our idle-watchdog abort
    msg.toLowerCase().includes('fetch') // "Failed to fetch" / "NetworkError when attempting to fetch"
  )
}

/** Connection state surfaced to the UI while an upload is in flight. */
export type UploadConnectionState = 'uploading' | 'retrying' | 'offline'

/** Deduplicating reporter so six concurrent part-workers don't spam the UI. */
export function createConnectionReporter(
  onChange?: (state: UploadConnectionState) => void,
): { set: (state: UploadConnectionState) => void; get: () => UploadConnectionState } {
  let current: UploadConnectionState = 'uploading'
  return {
    set(state) {
      if (state !== current) {
        current = state
        onChange?.(state)
      }
    },
    get: () => current,
  }
}
