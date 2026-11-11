// Sign-in protection (migration 021). Every function is a no-op when the
// table/column doesn't exist yet, so sign-in never breaks before the
// migration runs.

import { dbQuery, dbExecute } from './db.js'

const WINDOW_MS = 15 * 60 * 1000
/** Wrong passwords allowed per window before a 15-minute pause. */
const MAX_PER_EMAIL = 8
const MAX_PER_IP = 30

const limitFor = (key: string) => (key.startsWith('ip:') ? MAX_PER_IP : MAX_PER_EMAIL)

/** Keys counted for one sign-in attempt: the email, and the network address
 *  when known (Vercel sets x-forwarded-for). */
export function attemptKeys(email: string, forwardedFor: string | string[] | undefined): string[] {
  const ip = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)?.split(',')[0]?.trim()
  return [`email:${email}`, ...(ip ? [`ip:${ip}`] : [])]
}

/** True while any of these keys is paused. */
export async function isLocked(keys: string[], now = Date.now()): Promise<boolean> {
  try {
    const rows = await dbQuery<{ locked_until: string | null }>(
      `SELECT locked_until FROM login_attempts WHERE key IN (${keys.map(() => '?').join(',')})`, keys)
    return rows.some((r) => !!r.locked_until && Date.parse(r.locked_until) > now)
  } catch {
    return false // pre-migration
  }
}

/** Count a wrong password; pause the key once it reaches its limit. */
export async function recordFailure(keys: string[], now = Date.now()): Promise<void> {
  try {
    for (const key of keys) {
      const [row] = await dbQuery<{ failures: number; first_failed_at: string }>(
        'SELECT failures, first_failed_at FROM login_attempts WHERE key = ?', [key])
      const fresh = !row || now - Date.parse(row.first_failed_at) > WINDOW_MS
      const failures = fresh ? 1 : row.failures + 1
      const first = fresh ? new Date(now).toISOString() : row.first_failed_at
      const lockedUntil = failures >= limitFor(key) ? new Date(now + WINDOW_MS).toISOString() : null
      await dbExecute(
        `INSERT INTO login_attempts (key, failures, first_failed_at, locked_until) VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET failures = excluded.failures, first_failed_at = excluded.first_failed_at, locked_until = excluded.locked_until`,
        [key, failures, first, lockedUntil])
    }
  } catch { /* pre-migration */ }
}

/** A correct password clears the email's count (the network address keeps
 *  its own, so one good account can't reset guessing on others). */
export async function clearFailures(email: string): Promise<void> {
  try { await dbExecute('DELETE FROM login_attempts WHERE key = ?', [`email:${email}`]) } catch { /* pre-migration */ }
}

/** End every existing session for this account (tokens issued before now). */
export async function endSessions(profileId: string): Promise<void> {
  try {
    await dbExecute('UPDATE profiles SET sessions_valid_after = ? WHERE id = ?', [new Date().toISOString(), profileId])
  } catch { /* pre-migration */ }
}

/** Was this token issued before the account's session cut-off? iat is in
 *  seconds; a token issued in the same second as the cut-off stays valid
 *  (that's the new token handed out with the password change). */
export function isEndedSession(iatSeconds: number | undefined, sessionsValidAfter: string | null | undefined): boolean {
  if (!sessionsValidAfter || typeof iatSeconds !== 'number') return false
  return iatSeconds < Math.floor(Date.parse(sessionsValidAfter) / 1000)
}
