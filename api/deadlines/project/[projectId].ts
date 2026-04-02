import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../../_helpers/auth'
import { dbQuery } from '../../_helpers/db'
import type { Deadline } from '../../../src/types'

interface DeadlineRow extends Deadline {
  member_full_name: string
  member_email: string
  project_title: string
}

/**
 * GET /api/deadlines/project/[projectId]
 * Returns all deadlines for a project.
 * - Admin: all deadlines
 * - Team: only their own deadline for this project
 * - Client: 403
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    const projectId = req.query.projectId as string

    if (profile.role === 'client') {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    let rows: DeadlineRow[]

    if (profile.role === 'admin') {
      rows = await dbQuery<DeadlineRow>(
        `SELECT d.*,
                p.full_name AS member_full_name,
                p.email     AS member_email,
                pr.title    AS project_title
         FROM deadlines d
         JOIN profiles p  ON p.id  = d.team_member_id
         JOIN projects pr ON pr.id = d.project_id
         WHERE d.project_id = ?
         ORDER BY d.due_at ASC`,
        [projectId]
      )
    } else {
      // Team member — only their own deadline
      rows = await dbQuery<DeadlineRow>(
        `SELECT d.*,
                p.full_name AS member_full_name,
                p.email     AS member_email,
                pr.title    AS project_title
         FROM deadlines d
         JOIN profiles p  ON p.id  = d.team_member_id
         JOIN projects pr ON pr.id = d.project_id
         WHERE d.project_id = ? AND d.team_member_id = ?
         ORDER BY d.due_at ASC`,
        [projectId, clerkUserId]
      )
    }

    res.json(rows)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
