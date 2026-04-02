import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_helpers/auth'
import { dbExecute, dbQuery, newId, nowIso } from '../_helpers/db'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    const { project_id, timestamp_sec, comment_text, revision_round } = req.body

    if (!project_id || !comment_text) {
      res.status(400).json({ error: 'project_id and comment_text required' })
      return
    }

    // Verify the caller has access to this project
    if (profile.role === 'client') {
      const projects = await dbQuery<{ id: string }>(
        'SELECT id FROM projects WHERE id = ? AND client_id = ?',
        [project_id, clerkUserId]
      )
      if (!projects[0]) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
    } else if (profile.role === 'team') {
      const assigned = await dbQuery<{ id: string }>(
        'SELECT id FROM project_assignments WHERE project_id = ? AND team_member_id = ?',
        [project_id, clerkUserId]
      )
      if (!assigned[0]) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
    } else {
      // admin — verify project exists
      const [proj] = await dbQuery<{ id: string }>('SELECT id FROM projects WHERE id = ?', [project_id])
      if (!proj) {
        res.status(404).json({ error: 'Project not found' })
        return
      }
    }

    // author_role is always derived from the authenticated profile, never from the request body
    const author_role = profile.role

    const id = newId()
    const now = nowIso()

    await dbExecute(
      `INSERT INTO timeline_comments (id, project_id, author_id, author_role, timestamp_sec, comment_text, revision_round, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, project_id, clerkUserId, author_role, timestamp_sec ?? null, comment_text, revision_round ?? 1, now]
    )

    res.status(201).json({ id, project_id, author_id: clerkUserId, author_role, timestamp_sec: timestamp_sec ?? null, comment_text, revision_round: revision_round ?? 1, created_at: now })

  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
