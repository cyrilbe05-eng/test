import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../../_helpers/auth'
import { dbExecute, dbQuery, newId, nowIso } from '../../_helpers/db'
import type { Project } from '../../../src/types'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    requireRole(profile, 'admin')

    const projectId = req.query.id as string
    const { team_member_id } = req.body

    if (!team_member_id) {
      res.status(400).json({ error: 'team_member_id required' })
      return
    }

    // Validate the target is an enabled team member
    const [teamMember] = await dbQuery<{ role: string; disabled: number; full_name: string }>(
      'SELECT role, disabled, full_name FROM profiles WHERE id = ?',
      [team_member_id]
    )
    if (!teamMember) {
      res.status(404).json({ error: 'Team member not found' })
      return
    }
    if (teamMember.role !== 'team') {
      res.status(400).json({ error: 'Target user is not a team member' })
      return
    }
    if (teamMember.disabled) {
      res.status(400).json({ error: 'Team member is disabled' })
      return
    }

    const now = nowIso()
    const assignmentId = newId()

    // Insert assignment (ignore if already exists)
    const result = await dbExecute(
      `INSERT OR IGNORE INTO project_assignments (id, project_id, team_member_id, assigned_by, assigned_at)
       VALUES (?, ?, ?, ?, ?)`,
      [assignmentId, projectId, team_member_id, clerkUserId, now]
    )

    // Only create a deadline if the assignment was actually inserted (not already existing)
    if (result.changes > 0) {
      // Auto-create deadline: due_at = assigned_at + 48 hours
      const due = new Date(new Date(now).getTime() + 48 * 60 * 60 * 1000).toISOString()
      await dbExecute(
        `INSERT OR IGNORE INTO deadlines (id, project_id, team_member_id, assignment_id, due_at, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
        [newId(), projectId, team_member_id, assignmentId, due, now]
      )
    }

    // Advance project status to in_progress if still pending
    const projects = await dbQuery<Project>('SELECT * FROM projects WHERE id = ?', [projectId])
    if (projects[0]?.status === 'pending_assignment') {
      await dbExecute(
        'UPDATE projects SET status = ?, updated_at = ? WHERE id = ?',
        ['in_progress', now, projectId]
      )
    }

    // Notify the team member of their new assignment
    if (result.changes > 0 && projects[0]) {
      await dbExecute(
        'INSERT INTO notifications (id, recipient_id, project_id, type, message, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
        [newId(), team_member_id, projectId, 'team_assigned', `You have been assigned to "${projects[0].title}"`, now]
      )
    }

    res.json({ ok: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
