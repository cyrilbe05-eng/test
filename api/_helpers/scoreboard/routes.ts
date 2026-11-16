// /api/scoreboard — the editor leaderboard and monthly bonus.
//
//   GET    /api/scoreboard?month=YYYY-MM        full admins: everything;
//                                               editors: the board + their own videos
//   PUT    /api/scoreboard/clients/:clientId    { coefficient, timeTargetHours }   (full admins)
//   DELETE /api/scoreboard/clients/:clientId    back to the defaults
//   PUT    /api/scoreboard/adjustments/:projectId  { amount, reason }
//   DELETE /api/scoreboard/adjustments/:projectId
//   PUT    /api/scoreboard/bonus/:month         { amount }
//   DELETE /api/scoreboard/bonus/:month

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../auth.js'
import { dbExecute, dbQuery, nowIso } from '../db.js'
import { loadScoreboard } from './data.js'

const fail = (status: number, message: string) => Object.assign(new Error(message), { status })

function isFullAdmin(p: { role: string; admin_role?: string | null }) {
  return p.role === 'admin' && p.admin_role !== 'manager'
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

function num(v: unknown, min: number, max: number, label: string): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw fail(400, `${label} must be between ${min} and ${max}`)
  return n
}

async function save(sql: string, params: unknown[]) {
  try { await dbExecute(sql, params) } catch (e: any) {
    if (/no such table/i.test(String(e?.message))) throw fail(500, 'The scoreboard settings need database migration 022 — run db/migrations/022_editor_scoreboard.sql')
    throw e
  }
}

export async function handleScoreboardRoute(req: VercelRequest, res: VercelResponse, rest: string[]) {
  try {
    const { profile } = await requireAuth(req)
    const admin = isFullAdmin(profile as any)
    const editor = profile.role === 'team' && (profile as any).team_role === 'editor'

    if (rest.length === 0) {
      if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
      if (!admin && !editor) throw fail(403, 'The leaderboard is for editors and full admins')
      const month = typeof req.query.month === 'string' && MONTH.test(req.query.month) ? req.query.month : null
      const data = await loadScoreboard(month)
      if (admin) { res.json({ ...data, me: null }); return }
      // Editors: everyone's standing, but only their own videos, and no
      // client settings.
      res.json({ ...data, videos: data.videos.filter((v) => v.editorId === profile.id), clients: [], me: profile.id })
      return
    }

    if (!admin) throw fail(403, 'Only full admins can change the scoreboard')
    const [kind, key] = rest
    if (!key || rest.length !== 2) { res.status(404).json({ error: 'Not found' }); return }
    const by = profile.id

    if (kind === 'clients') {
      const [client] = await dbQuery<{ id: string }>("SELECT id FROM profiles WHERE id = ? AND role = 'client'", [key])
      if (!client) throw fail(404, 'Client not found')
      if (req.method === 'DELETE') {
        await save('DELETE FROM scoreboard_client_settings WHERE client_id = ?', [key])
      } else if (req.method === 'PUT') {
        const coefficient = num(req.body?.coefficient, 0.1, 10, 'Coefficient')
        const hours = num(req.body?.timeTargetHours, 0.5, 24, 'Time target')
        await save(
          `INSERT INTO scoreboard_client_settings (client_id, coefficient, time_target_hours, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(client_id) DO UPDATE SET coefficient = excluded.coefficient, time_target_hours = excluded.time_target_hours, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
          [key, coefficient, hours, nowIso(), by])
      } else { res.status(405).json({ error: 'Method not allowed' }); return }
      res.json({ ok: true }); return
    }

    if (kind === 'adjustments') {
      const [project] = await dbQuery<{ id: string }>('SELECT id FROM projects WHERE id = ?', [key])
      if (!project) throw fail(404, 'Video not found')
      if (req.method === 'DELETE') {
        await save('DELETE FROM scoreboard_adjustments WHERE project_id = ?', [key])
      } else if (req.method === 'PUT') {
        const amount = num(req.body?.amount, -200, 200, 'Points')
        if (amount === 0) throw fail(400, 'Points must not be 0')
        const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) : ''
        await save(
          `INSERT INTO scoreboard_adjustments (project_id, amount, reason, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(project_id) DO UPDATE SET amount = excluded.amount, reason = excluded.reason, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
          [key, amount, reason || null, nowIso(), by])
      } else { res.status(405).json({ error: 'Method not allowed' }); return }
      res.json({ ok: true }); return
    }

    if (kind === 'bonus') {
      if (!MONTH.test(key)) throw fail(400, 'Month must be YYYY-MM')
      if (req.method === 'DELETE') {
        await save('DELETE FROM scoreboard_bonus WHERE month = ?', [key])
      } else if (req.method === 'PUT') {
        const amount = num(req.body?.amount, 0, 1_000_000, 'Bonus')
        await save(
          `INSERT INTO scoreboard_bonus (month, amount, updated_at, updated_by) VALUES (?, ?, ?, ?)
           ON CONFLICT(month) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
          [key, amount, nowIso(), by])
      } else { res.status(405).json({ error: 'Method not allowed' }); return }
      res.json({ ok: true }); return
    }

    res.status(404).json({ error: 'Not found' })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
