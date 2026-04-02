import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_helpers/auth'
import { dbQuery } from '../_helpers/db'
import type { ProjectAssignment } from '../../src/types'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    const projectId = req.query.projectId as string

    // Team members can only see assignments for their own projects
    if (profile.role === 'team') {
      const own = await dbQuery<{ id: string }>(
        'SELECT id FROM project_assignments WHERE project_id = ? AND team_member_id = ?',
        [projectId, clerkUserId]
      )
      if (!own[0]) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
    } else if (profile.role === 'client') {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    const rows = await dbQuery<any>(
      `SELECT pa.*,
        p.id         AS profile_id,
        p.full_name  AS profile_full_name,
        p.email      AS profile_email,
        p.avatar_url AS profile_avatar_url
       FROM project_assignments pa
       LEFT JOIN profiles p ON pa.team_member_id = p.id
       WHERE pa.project_id = ?`,
      [projectId]
    )

    const shaped = rows.map(({ profile_id, profile_full_name, profile_email, profile_avatar_url, ...a }: any) => ({
      ...a,
      profiles: {
        id: profile_id,
        full_name: profile_full_name,
        email: profile_email,
        avatar_url: profile_avatar_url,
      },
    }))

    res.json(shaped)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
