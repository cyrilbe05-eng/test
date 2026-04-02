import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../_helpers/auth'
import { dbQuery, dbExecute, newId, nowIso } from '../_helpers/db'
import type { TeamNote } from '../../src/types'

/**
 * GET  /api/team-notes/[projectId]
 *   - Team: returns own notes for this project
 *   - Admin: returns all notes for this project (with author info)
 *
 * POST /api/team-notes/[projectId]
 *   - Team only: create a new note
 *   Body: { text: string, timestamp_sec?: number | null }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    const projectId = req.query.projectId as string

    if (profile.role === 'client') {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    if (req.method === 'GET') {
      let rows: TeamNote[]

      if (profile.role === 'admin') {
        rows = await dbQuery<TeamNote>(
          `SELECT n.*, p.full_name AS author_name
           FROM team_notes n
           JOIN profiles p ON p.id = n.author_id
           WHERE n.project_id = ?
           ORDER BY n.created_at ASC`,
          [projectId]
        )
      } else {
        rows = await dbQuery<TeamNote>(
          `SELECT n.*, p.full_name AS author_name
           FROM team_notes n
           JOIN profiles p ON p.id = n.author_id
           WHERE n.project_id = ? AND n.author_id = ?
           ORDER BY n.created_at ASC`,
          [projectId, clerkUserId]
        )
      }

      res.json(rows)
      return
    }

    if (req.method === 'POST') {
      requireRole(profile, 'team')

      // Verify the team member is assigned to this project
      const [assignment] = await dbQuery<{ id: string }>(
        'SELECT id FROM project_assignments WHERE project_id = ? AND team_member_id = ?',
        [projectId, clerkUserId]
      )
      if (!assignment) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }

      const { text, timestamp_sec } = req.body
      if (!text?.trim()) {
        res.status(400).json({ error: 'text required' })
        return
      }

      const id = newId()
      const now = nowIso()
      await dbExecute(
        `INSERT INTO team_notes (id, project_id, author_id, timestamp_sec, text, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, projectId, clerkUserId, timestamp_sec ?? null, text.trim(), now]
      )

      const [note] = await dbQuery<TeamNote>('SELECT * FROM team_notes WHERE id = ?', [id])
      res.status(201).json(note)
      return
    }

    if (req.method === 'DELETE') {
      // Team members can delete their own notes; admin can delete any
      const noteId = req.query.noteId as string
      if (!noteId) {
        res.status(400).json({ error: 'noteId query param required' })
        return
      }

      const [note] = await dbQuery<TeamNote>('SELECT * FROM team_notes WHERE id = ?', [noteId])
      if (!note) {
        res.status(404).json({ error: 'Note not found' })
        return
      }

      if (profile.role === 'team' && note.author_id !== clerkUserId) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }

      await dbExecute('DELETE FROM team_notes WHERE id = ?', [noteId])
      res.json({ ok: true })
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
