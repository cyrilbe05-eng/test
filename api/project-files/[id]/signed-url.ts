import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../../_helpers/auth'
import { dbQuery } from '../../_helpers/db'
import { getPresignedDownloadUrl } from '../../_helpers/r2'
import type { ProjectFile, Project } from '../../../src/types'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    const fileId = req.query.id as string
    const rows = await dbQuery<ProjectFile>('SELECT * FROM project_files WHERE id = ?', [fileId])

    if (!rows[0]) {
      res.status(404).json({ error: 'File not found' })
      return
    }

    const file = rows[0]

    // Verify the caller has access to this file's project
    if (profile.role === 'admin') {
      // admins can access all project files
    } else if (profile.role === 'client') {
      // client must own the project
      const projects = await dbQuery<Project>(
        'SELECT id FROM projects WHERE id = ? AND client_id = ?',
        [file.project_id, clerkUserId]
      )
      if (!projects[0]) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
    } else if (profile.role === 'team') {
      // team member must be assigned to the project
      const assigned = await dbQuery<{ id: string }>(
        'SELECT id FROM project_assignments WHERE project_id = ? AND team_member_id = ?',
        [file.project_id, clerkUserId]
      )
      if (!assigned[0]) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
    } else {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    const signedUrl = await getPresignedDownloadUrl(file.storage_key)
    res.json({ signedUrl })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
