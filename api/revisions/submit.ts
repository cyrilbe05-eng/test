import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../_helpers/auth'
import { dbQuery, dbExecute, newId, nowIso } from '../_helpers/db'
import type { Project, Profile } from '../../src/types'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    requireRole(profile, 'client')

    const { project_id } = req.body
    if (!project_id) {
      res.status(400).json({ error: 'project_id required' })
      return
    }

    const projects = await dbQuery<Project>(
      'SELECT * FROM projects WHERE id = ? AND client_id = ?',
      [project_id, clerkUserId]
    )
    const project = projects[0]
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    // Only allow revisions when the project is in client_reviewing
    if (project.status !== 'client_reviewing') {
      res.status(403).json({ error: 'Revisions can only be requested while the project is in review' })
      return
    }

    // Enforce revision cap
    if (
      project.max_client_revisions !== -1 &&
      project.client_revision_count >= project.max_client_revisions
    ) {
      res.status(403).json({ error: 'revision_limit_reached' })
      return
    }

    const now = nowIso()

    // Increment revision count + update status
    await dbExecute(
      'UPDATE projects SET status = ?, client_revision_count = ?, updated_at = ? WHERE id = ?',
      ['revision_requested', project.client_revision_count + 1, now, project_id]
    )

    // Notify admins + assigned team
    const admins = await dbQuery<{ id: string }>('SELECT id FROM profiles WHERE role = ? AND disabled = 0', ['admin'])
    const assignments = await dbQuery<{ team_member_id: string }>(
      'SELECT team_member_id FROM project_assignments WHERE project_id = ?',
      [project_id]
    )

    const recipients = [
      ...admins.map((a) => a.id),
      ...assignments.map((a) => a.team_member_id),
    ]

    for (const recipient_id of recipients) {
      await dbExecute(
        'INSERT INTO notifications (id, recipient_id, project_id, type, message, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
        [newId(), recipient_id, project_id, 'revision_requested', `Client requested a revision on project "${project.title}"`, now]
      )
    }

    res.json({ ok: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
