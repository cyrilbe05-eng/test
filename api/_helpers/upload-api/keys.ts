// Upload API keys (migration 029): making them, checking them, the per-key
// request limit and the activity log. A key only ever works on the /api/v1
// upload routes (routes.ts); everywhere else in the app it is refused, because
// it isn't a login token.

import { createHash, randomBytes } from 'node:crypto'
import type { VercelRequest } from '@vercel/node'
import { dbExecute, dbQuery, newId, nowIso } from '../db.js'

export const KEY_PREFIX = 'pgk_'
export const REQUESTS_PER_MINUTE = 60

export type ApiError = Error & { status: number; code: string; retryAfter?: number }
export const apiError = (status: number, code: string, message: string, retryAfter?: number): ApiError =>
  Object.assign(new Error(message), { status, code, retryAfter })

/** A new key: shown once. Only its hash is stored. */
export function generateKey(): { key: string; hash: string; prefix: string } {
  const key = KEY_PREFIX + randomBytes(32).toString('base64url')
  return { key, hash: hashKey(key), prefix: key.slice(0, KEY_PREFIX.length + 6) }
}

export const hashKey = (key: string) => createHash('sha256').update(key, 'utf8').digest('hex')

/** Shape check before touching the database (43 base64url chars after the prefix). */
export const looksLikeKey = (s: string) => new RegExp(`^${KEY_PREFIX}[A-Za-z0-9_-]{43}$`).test(s)

export interface KeyCaller {
  keyId: string
  keyName: string
  keyPrefix: string
  clientId: string
  clientName: string
  planId: string | null
  ip: string | null
}

export function callerIp(req: VercelRequest): string | null {
  const f = req.headers['x-forwarded-for']
  const first = (Array.isArray(f) ? f[0] : f)?.split(',')[0]?.trim()
  return first || (req.socket?.remoteAddress ?? null)
}

/** Who is calling: an active key of an active client, or an error. */
export async function authenticateKey(req: VercelRequest): Promise<KeyCaller> {
  const header = req.headers.authorization
  const raw = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!raw) throw apiError(401, 'missing_api_key', 'Send your API key as: Authorization: Bearer pgk_…')
  if (!looksLikeKey(raw)) throw apiError(401, 'invalid_api_key', 'This API key is not valid.')
  const [row] = await dbQuery<{ id: string; name: string; key_prefix: string; client_id: string; full_name: string | null; plan_id: string | null; role: string; disabled: number; revoked_at: string | null }>(
    `SELECT k.id, k.name, k.key_prefix, k.client_id, k.revoked_at, p.full_name, p.plan_id, p.role, p.disabled
     FROM api_keys k JOIN profiles p ON p.id = k.client_id WHERE k.key_hash = ?`, [hashKey(raw)])
  if (!row || row.revoked_at || row.role !== 'client' || row.disabled) {
    throw apiError(401, 'invalid_api_key', 'This API key is not valid or has been turned off.')
  }
  return { keyId: row.id, keyName: row.name, keyPrefix: row.key_prefix, clientId: row.client_id, clientName: row.full_name ?? '', planId: row.plan_id, ip: callerIp(req) }
}

const minuteOf = (d: Date) => d.toISOString().slice(0, 16)

/** Counts this request; refuses past REQUESTS_PER_MINUTE in the current minute. */
export async function checkRateLimit(keyId: string, now = new Date()): Promise<void> {
  const minute = minuteOf(now)
  const [row] = await dbQuery<{ count: number }>(
    `INSERT INTO api_key_rate (key_id, minute, count) VALUES (?, ?, 1)
     ON CONFLICT(key_id, minute) DO UPDATE SET count = count + 1
     RETURNING count`, [keyId, minute])
  if ((row?.count ?? 1) > REQUESTS_PER_MINUTE) {
    const retryAfter = 60 - now.getUTCSeconds()
    throw apiError(429, 'rate_limited', `Too many requests: at most ${REQUESTS_PER_MINUTE} per minute per key. Try again in ${retryAfter} seconds.`, retryAfter)
  }
}

export async function touchKey(keyId: string): Promise<void> {
  await dbExecute('UPDATE api_keys SET last_used_at = ? WHERE id = ?', [nowIso(), keyId])
}

/** Activity log. Never fails the request it describes. */
export async function logEvent(e: {
  keyId: string; clientId: string; action: string; status: number
  detail?: string | null; uploadId?: string | null; projectId?: string | null; ip?: string | null
}): Promise<void> {
  try {
    await dbExecute(
      `INSERT INTO api_key_events (id, key_id, client_id, action, status, detail, upload_id, project_id, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId(), e.keyId, e.clientId, e.action, e.status, e.detail?.slice(0, 500) ?? null, e.uploadId ?? null, e.projectId ?? null, e.ip ?? null, nowIso()])
  } catch (err) {
    console.warn('[upload-api] could not log event', (err as Error).message)
  }
  console.log(`[upload-api] ${JSON.stringify({ key: e.keyId, client: e.clientId, action: e.action, status: e.status, upload: e.uploadId ?? undefined, project: e.projectId ?? undefined })}`)
}

/** Old rate counters are only needed for the current minute. */
export async function pruneRateCounters(now = new Date()): Promise<void> {
  await dbExecute('DELETE FROM api_key_rate WHERE minute < ?', [minuteOf(new Date(now.getTime() - 10 * 60_000))])
}
