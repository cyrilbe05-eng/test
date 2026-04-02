import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../../_helpers/auth'
import { dbQuery } from '../../_helpers/db'
import type { ProjectFile } from '../../../src/types'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    const projectId = req.query.projectId as string

    // Role-based access check
    if (profile.role === 'client') {
      const projectRows = await dbQuery<{ id: string }>(
        'SELECT id FROM projects WHERE id = ? AND client_id = ?',
        [projectId, clerkUserId]
      )
      if (!projectRows[0]) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
    } else if (profile.role === 'team') {
      const assignRows = await dbQuery<{ id: string }>(
        'SELECT id FROM project_assignments WHERE project_id = ? AND team_member_id = ?',
        [projectId, clerkUserId]
      )
      if (!assignRows[0]) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
    }

    const files = await dbQuery<ProjectFile & { uploader_full_name: string }>(
      `SELECT pf.*, p.full_name AS uploader_full_name
       FROM project_files pf
       LEFT JOIN profiles p ON pf.uploader_id = p.id
       WHERE pf.project_id = ?
       ORDER BY pf.created_at DESC`,
      [projectId]
    )

    const shaped = files.map(({ uploader_full_name, ...f }: any) => ({
      ...f,
      approved: Boolean(f.approved),
      profiles: { full_name: uploader_full_name },
    }))

    res.json(shaped)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
