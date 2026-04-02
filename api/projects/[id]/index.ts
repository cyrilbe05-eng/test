import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../../_helpers/auth'
import { dbQuery } from '../../_helpers/db'
import type { Project } from '../../../src/types'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    const projectId = req.query.id as string

    const rows = await dbQuery<any>(
      `SELECT pr.*,
        p.full_name  AS profile_full_name,
        p.email      AS profile_email,
        p.avatar_url AS profile_avatar_url,
        p.plan_id    AS profile_plan_id
       FROM projects pr
       LEFT JOIN profiles p ON pr.client_id = p.id
       WHERE pr.id = ?`,
      [projectId]
    )

    const row = rows[0]
    if (!row) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    // Role-based access check
    if (profile.role === 'client' && row.client_id !== clerkUserId) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    if (profile.role === 'team') {
      const assignments = await dbQuery<{ id: string }>(
        'SELECT id FROM project_assignments WHERE project_id = ? AND team_member_id = ?',
        [projectId, clerkUserId]
      )
      if (!assignments[0]) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
    }

    const { profile_full_name, profile_email, profile_avatar_url, profile_plan_id, ...project } = row
    res.json({
      ...project,
      profiles: {
        full_name: profile_full_name,
        email: profile_email,
        avatar_url: profile_avatar_url,
        plan_id: profile_plan_id,
      },
    })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
