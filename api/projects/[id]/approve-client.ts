import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../../_helpers/auth'
import { dbQuery, dbExecute, nowIso } from '../../_helpers/db'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    requireRole(profile, 'client')

    const projectId = req.query.id as string
    const { file_id } = req.body

    // Verify project belongs to this client
    const projects = await dbQuery<{ id: string }>(
      'SELECT id FROM projects WHERE id = ? AND client_id = ?',
      [projectId, clerkUserId]
    )
    if (!projects[0]) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    const now = nowIso()

    if (file_id) {
      const files = await dbQuery<{ id: string }>(
        'SELECT id FROM project_files WHERE id = ? AND project_id = ?',
        [file_id, projectId]
      )
      if (!files[0]) {
        res.status(404).json({ error: 'File not found in this project' })
        return
      }
      await dbExecute(
        'UPDATE project_files SET approved = 1 WHERE id = ? AND project_id = ?',
        [file_id, projectId]
      )
    }

    await dbExecute(
      'UPDATE projects SET status = ?, updated_at = ? WHERE id = ? AND client_id = ?',
      ['client_approved', now, projectId, clerkUserId]
    )

    res.json({ ok: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
