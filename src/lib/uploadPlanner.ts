/**
 * Pure planning helpers for the upload pipeline (src/lib/storage.ts).
 * Kept free of DOM/network so the sizing and backoff behaviour is unit-testable.
 */

/** Files at or above this size upload via R2 multipart so an interruption
 *  costs one part, not the whole file. Below it, a single PUT is cheaper
 *  (multipart adds create/complete round-trips) and a restart is cheap. */
export const MULTIPART_THRESHOLD = 100 * 1024 * 1024 // 100 MB

/** Smallest part we ever use. S3/R2 require ≥5 MB (except the last part);
 *  50 MB keeps the retry cost on a flaky link at ~1–2 min while avoiding
 *  round-trip overhead on fast links. */
export const MIN_PART_SIZE = 50 * 1024 * 1024 // 50 MB

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
