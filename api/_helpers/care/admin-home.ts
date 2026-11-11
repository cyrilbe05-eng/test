// Admin home — GET /api/admin/home (admins).
// What needs an admin now: editors' urgent requests, videos to review,
// projects nobody has taken, late work, and every editor's load against the
// limit (CARE_CONFIG.editors.maxActiveProjects).

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../auth.js'
import { dbQuery } from '../db.js'
import { sendError } from './access.js'
import { CARE_CONFIG } from './config.js'

const NOT_ACTIVE = "('client_reviewing', 'client_approved')"

export async function handleAdminHome(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
    const { profile } = await requireAuth(req)
    requireRole(profile, 'admin')
    const now = new Date().toISOString()

    const [toReview, unassigned, late, editors] = await Promise.all([
      dbQuery(
        `SELECT p.id, p.title, p.updated_at, c.full_name AS client,
           (SELECT GROUP_CONCAT(e.full_name, ', ') FROM project_assignments a JOIN profiles e ON e.id = a.team_member_id WHERE a.project_id = p.id) AS editors
         FROM projects p LEFT JOIN profiles c ON c.id = p.client_id
         WHERE p.status = 'in_review' ORDER BY p.updated_at ASC`),
      dbQuery(
        `SELECT p.id, p.title, p.created_at, c.full_name AS client
         FROM projects p LEFT JOIN profiles c ON c.id = p.client_id
         WHERE p.status = 'pending_assignment' AND NOT EXISTS (SELECT 1 FROM project_assignments a WHERE a.project_id = p.id)
         ORDER BY p.created_at ASC`),
      // Latest deadline per (project, editor), on work still with the editor.
      dbQuery(
        `SELECT p.id, p.title, e.full_name AS editor, d.due_at
         FROM deadlines d
         JOIN projects p ON p.id = d.project_id
         JOIN profiles e ON e.id = d.team_member_id
         WHERE p.status IN ('pending_assignment', 'in_progress', 'revision_requested')
           AND (d.status = 'missed' OR (d.status = 'pending' AND d.due_at < ?))
           AND EXISTS (SELECT 1 FROM project_assignments a WHERE a.project_id = d.project_id AND a.team_member_id = d.team_member_id)
           AND d.due_at = (SELECT MAX(d2.due_at) FROM deadlines d2 WHERE d2.project_id = d.project_id AND d2.team_member_id = d.team_member_id)
         ORDER BY d.due_at ASC`, [now]),
      dbQuery(
        `SELECT e.id, e.full_name AS name,
           (SELECT COUNT(DISTINCT p.id) FROM project_assignments a JOIN projects p ON p.id = a.project_id
            WHERE a.team_member_id = e.id AND p.status NOT IN ${NOT_ACTIVE}) AS active
         FROM profiles e
         WHERE e.role = 'team' AND (e.team_role IS NULL OR e.team_role != 'copywriter') AND e.disabled = 0
         ORDER BY active DESC, e.full_name ASC`),
    ])

    // Every "Submit for Review" by an editor in the last 8 days (the page
    // groups them by the admin's local day). A resubmission after a revision
    // counts too — it's another video sent for review.
    const since = new Date(Date.now() - 8 * 86_400_000).toISOString()
    let submitted: { editor_id: string; at: string }[] = []
    try {
      submitted = await dbQuery(
        `SELECT h.actor_id AS editor_id, h.created_at AS at
         FROM status_history h JOIN profiles e ON e.id = h.actor_id
         WHERE h.new_status = 'in_review' AND e.role = 'team'
           AND (e.team_role IS NULL OR e.team_role != 'copywriter') AND h.created_at >= ?`, [since])
    } catch { /* no status history yet */ }

    res.json({ max: CARE_CONFIG.editors.maxActiveProjects, to_review: toReview, unassigned, late, editors, submitted })
  } catch (e) { sendError(res, e) }
}
