import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_helpers/auth'
import { dbExecute, dbQuery, newId, nowIso } from '../_helpers/db'
import type { ProjectFile } from '../../src/types'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    const { project_id, file_type, storage_key, file_name, file_size, mime_type } = req.body

    if (!project_id || !file_type || !storage_key || !file_name) {
      res.status(400).json({ error: 'project_id, file_type, storage_key, and file_name required' })
      return
    }

    const VALID_FILE_TYPES = ['source_video', 'deliverable', 'attachment']
    if (!VALID_FILE_TYPES.includes(file_type)) {
      res.status(400).json({ error: 'file_type must be source_video, deliverable, or attachment' })
      return
    }

    // Verify caller has access to this project
    if (profile.role === 'client') {
      const [row] = await dbQuery<{ id: string }>('SELECT id FROM projects WHERE id = ? AND client_id = ?', [project_id, clerkUserId])
      if (!row) { res.status(403).json({ error: 'Forbidden' }); return }
    } else if (profile.role === 'team') {
      const [row] = await dbQuery<{ id: string }>('SELECT id FROM project_assignments WHERE project_id = ? AND team_member_id = ?', [project_id, clerkUserId])
      if (!row) { res.status(403).json({ error: 'Forbidden' }); return }
    }
    // admin can upload to any project

    const id = newId()
    const now = nowIso()

    await dbExecute(
      `INSERT INTO project_files (id, project_id, uploader_id, file_type, storage_key, file_name, file_size, mime_type, approved, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [id, project_id, clerkUserId, file_type, storage_key, file_name, file_size ?? null, mime_type ?? null, now]
    )

    const rows = await dbQuery<ProjectFile>('SELECT * FROM project_files WHERE id = ?', [id])
    res.status(201).json({ ...rows[0], approved: false })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
