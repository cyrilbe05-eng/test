import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../_helpers/auth'
import { dbQuery, dbExecute, newId, nowIso } from '../_helpers/db'
import type { Plan, Project } from '../../src/types'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    requireRole(profile, 'client')

    const { title, description, inspiration_url, video_script, instructions } = req.body
    if (!title) {
      res.status(400).json({ error: 'title required' })
      return
    }

    // Snapshot plan limits and enforce active project cap
    let maxDeliverables = 1
    let maxRevisions = 2

    if (profile.plan_id) {
      const plans = await dbQuery<Plan>('SELECT * FROM plans WHERE id = ?', [profile.plan_id])
      if (plans[0]) {
        maxDeliverables = plans[0].max_deliverables
        maxRevisions = plans[0].max_client_revisions

        if (plans[0].max_active_projects !== -1) {
          const [countRow] = await dbQuery<{ count: number }>(
            `SELECT COUNT(*) AS count FROM projects
             WHERE client_id = ? AND status NOT IN ('client_approved')`,
            [clerkUserId]
          )
          if ((countRow?.count ?? 0) >= plans[0].max_active_projects) {
            res.status(403).json({ error: 'active_project_limit_reached' })
            return
          }
        }
      }
    }

    const id = newId()
    const now = nowIso()

    await dbExecute(
      `INSERT INTO projects
         (id, client_id, title, description, inspiration_url, video_script, instructions,
          status, max_deliverables, max_client_revisions, client_revision_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_assignment', ?, ?, 0, ?, ?)`,
      [
        id, clerkUserId, title,
        description ?? null,
        inspiration_url ?? null,
        video_script ?? null,
        instructions ?? null,
        maxDeliverables, maxRevisions,
        now, now,
      ]
    )

    const rows = await dbQuery<Project>('SELECT * FROM projects WHERE id = ?', [id])
    res.status(201).json(rows[0])
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
