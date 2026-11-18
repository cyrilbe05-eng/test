// /api/settings: app-wide on/off switches (migration 026).
//
//   GET /api/settings    anyone signed in: { batchUpload }
//   PUT /api/settings    full admins: { batchUpload: boolean }
//
// Missing table (before the migration) or missing row = OFF.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../auth.js'
import { dbExecute, dbQuery, nowIso } from '../db.js'

export interface AppSettings { batchUpload: boolean }

export async function loadSettings(): Promise<AppSettings> {
  try {
    const rows = await dbQuery<{ key: string; value: string }>('SELECT key, value FROM app_settings')
    const on = (k: string) => rows.some((r) => r.key === k && r.value === 'on')
    return { batchUpload: on('batch_upload') }
  } catch {
    return { batchUpload: false }
  }
}

export async function handleSettingsRoute(req: VercelRequest, res: VercelResponse, rest: string[]) {
  try {
    const { profile } = await requireAuth(req)
    if (rest.length) { res.status(404).json({ error: 'Not found' }); return }
    if (req.method === 'GET') { res.json(await loadSettings()); return }
    if (req.method !== 'PUT') { res.status(405).json({ error: 'Method not allowed' }); return }
    if (profile.role !== 'admin' || (profile as { admin_role?: string | null }).admin_role === 'manager') {
      res.status(403).json({ error: 'Forbidden' }); return
    }
    const body = req.body ?? {}
    if (typeof body.batchUpload !== 'boolean') { res.status(400).json({ error: 'batchUpload must be true or false' }); return }
    await dbExecute(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('batch_upload', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [body.batchUpload ? 'on' : 'off', nowIso()])
    res.json(await loadSettings())
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
