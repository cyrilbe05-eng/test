import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../../_helpers/auth'
import { dbExecute, dbQuery, newId, nowIso } from '../../_helpers/db'

interface FileRow { project_id: string; file_type: string }
interface ProjectRow { status: string; client_id: string; title: string }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { profile } = await requireAuth(req)
    requireRole(profile, 'admin')

    const fileId = req.query.id as string

    // Fetch the file to know its project
    const [file] = await dbQuery<FileRow>(
      'SELECT project_id, file_type FROM project_files WHERE id = ?',
      [fileId]
    )
    if (!file) {
      res.status(404).json({ error: 'File not found' })
      return
    }

    await dbExecute('UPDATE project_files SET approved = 1 WHERE id = ?', [fileId])

    // Auto-advance project to client_reviewing when a deliverable is approved
    // and the project is currently in admin_approved state
    if (file.file_type === 'deliverable') {
      const [project] = await dbQuery<ProjectRow>(
        'SELECT status, client_id, title FROM projects WHERE id = ?',
        [file.project_id]
      )
      if (project?.status === 'admin_approved') {
        const now = nowIso()
        await dbExecute(
          'UPDATE projects SET status = ?, updated_at = ? WHERE id = ?',
          ['client_reviewing', now, file.project_id]
        )
        // Notify the client that their video is ready to review
        await dbExecute(
          'INSERT INTO notifications (id, recipient_id, project_id, type, message, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
          [
            newId(),
            project.client_id,
            file.project_id,
            'video_ready_for_review',
            `Your video for "${project.title}" is ready for review`,
            now,
          ]
        )
      }
    }

    res.json({ ok: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
