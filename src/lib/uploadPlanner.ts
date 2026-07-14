/**
 * Pure planning helpers for the upload pipeline (src/lib/storage.ts).
 * Kept free of DOM/network so the sizing and backoff behaviour is unit-testable.
 */

/** Files at or above this size upload via R2 multipart so an interruption
 *  costs one part, not the whole file. Below it, a single PUT is cheaper
 *  (multipart adds create/complete round-trips) and a restart is cheap —
 *  at 1 MB/s a full 32 MB restart costs ~30 s, which is tolerable. */
export const MULTIPART_THRESHOLD = 32 * 1024 * 1024 // 32 MB

/** Smallest part we ever use. S3/R2 require ≥5 MB (except the last part).
 *  16 MB keeps the retry cost on a genuinely bad link short (~16 s at
 *  1 MB/s) — a connection that drops every 30 s can still finish a part,
 *  which it never could at 50 MB. Concurrency hides the extra round-trips. */
export const MIN_PART_SIZE = 16 * 1024 * 1024 // 16 MB

/** Aim for at most this many parts; bigger files get bigger parts. */
export const TARGET_MAX_PARTS = 500

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
