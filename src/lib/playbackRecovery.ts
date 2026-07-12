/**
 * Recovery gate for video playback errors.
 *
 * R2 signed URLs expire (default 1 h), networks blip, and the media element
 * fires `error` for both. Recovery = fetch a fresh signed URL and swap it in.
 * This gate decides *whether* a given error should trigger that recovery:
 *
 * - a cooldown stops error storms from hammering the signed-url endpoint
 * - a consecutive-failure cap stops infinite refresh loops when the file
 *   itself is broken (deleted from R2, corrupt, wrong content-type…)
 * - a successful playback resets the failure streak
 */
export interface RecoveryGate {
  /** Should we attempt a recovery for an error observed at `now`? */
  canAttempt(now: number): boolean
  /** Record that a recovery attempt started at `now`. */
  recordAttempt(now: number): void
  /** Playback succeeded — reset the failure streak. */
  reset(): void
  /** Number of attempts since the last reset. */
  attempts(): number
}

export function createRecoveryGate({
  cooldownMs = 5_000,
  maxConsecutive = 4,
}: { cooldownMs?: number; maxConsecutive?: number } = {}): RecoveryGate {
  let lastAttemptAt = -Infinity
  let consecutive = 0

  return {
    canAttempt(now) {
      if (consecutive >= maxConsecutive) return false
      return now - lastAttemptAt >= cooldownMs
    },
    recordAttempt(now) {
      lastAttemptAt = now
      consecutive++
    },
    reset() {
      consecutive = 0
    },
    attempts() {
      return consecutive
    },
  }
}
