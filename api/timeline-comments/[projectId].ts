import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_helpers/auth'
import { dbQuery } from '../_helpers/db'
import type { TimelineComment } from '../../src/types'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    const projectId = req.query.projectId as string

    // Access check
    if (profile.role === 'client') {
      const rows = await dbQuery<{ id: string }>(
        'SELECT id FROM projects WHERE id = ? AND client_id = ?',
        [projectId, clerkUserId]
      )
      if (!rows[0]) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
    } else if (profile.role === 'team') {
      const rows = await dbQuery<{ id: string }>(
        'SELECT id FROM project_assignments WHERE project_id = ? AND team_member_id = ?',
        [projectId, clerkUserId]
      )
      if (!rows[0]) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
    }

    const comments = await dbQuery<any>(
      `SELECT tc.*,
        p.full_name  AS profile_full_name,
        p.avatar_url AS profile_avatar_url
       FROM timeline_comments tc
       LEFT JOIN profiles p ON tc.author_id = p.id
       WHERE tc.project_id = ?
       ORDER BY tc.created_at ASC`,
      [projectId]
    )

    const shaped = comments.map(({ profile_full_name, profile_avatar_url, ...c }: any) => ({
      ...c,
      profiles: { full_name: profile_full_name, avatar_url: profile_avatar_url },
    }))

    res.json(shaped)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
