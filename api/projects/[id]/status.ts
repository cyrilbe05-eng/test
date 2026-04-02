import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../../_helpers/auth'
import { dbExecute, dbQuery, nowIso } from '../../_helpers/db'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    requireRole(profile, 'admin', 'team')

    const projectId = req.query.id as string
    const { status } = req.body

    const VALID_STATUSES = ['pending_assignment', 'in_progress', 'in_review', 'admin_approved', 'client_reviewing', 'client_approved', 'revision_requested']
    const TEAM_ALLOWED_STATUSES = ['in_progress', 'in_review']

    if (!status || !VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: 'Invalid status value' })
      return
    }

    // Team members may only update projects they are assigned to, and only to allowed statuses
    if (profile.role === 'team') {
      if (!TEAM_ALLOWED_STATUSES.includes(status)) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
      const assigned = await dbQuery<{ id: string }>(
        'SELECT id FROM project_assignments WHERE project_id = ? AND team_member_id = ?',
        [projectId, clerkUserId]
      )
      if (!assigned[0]) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
    }

    const [project] = await dbQuery<{ id: string }>(
      'SELECT id FROM projects WHERE id = ?',
      [projectId]
    )
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    await dbExecute(
      'UPDATE projects SET status = ?, updated_at = ? WHERE id = ?',
      [status, nowIso(), projectId]
    )

    res.json({ ok: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
