// Editor active-project limit + "Request urgent" (migration 016).
//
// An editor can hold at most CARE_CONFIG.editors.maxActiveProjects projects
// at once. "Active" = assigned to them and not yet with the client
// (client_reviewing) or approved (client_approved). At the limit they can't
// claim another one, but they can ask admins for one urgent exception:
//   POST /api/projects/:id/urgent           editor — ask for this project
//   GET  /api/editor-limit?project=:id       editor — their count + request
//   GET  /api/admin/urgent-requests          admins — recent requests (bell)
//   POST /api/admin/urgent-requests/:id      admins — { decision: approve|decline }
// An approved request lets that editor claim that one project (then "used").
// Admins assigning editors themselves are never limited. Copywriters neither.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../auth.js'
import { dbQuery, dbExecute, newId, nowIso } from '../db.js'
import { sendEmailNotifications, projectUrl } from '../email.js'
import { sendError } from './access.js'
import { CARE_CONFIG } from './config.js'

const NOT_ACTIVE = ['client_reviewing', 'client_approved']
type Who = { role: string; team_role?: string | null }
export const isEditor = (p: Who) => p.role === 'team' && p.team_role !== 'copywriter'

export async function activeCount(editorId: string, exceptProjectId?: string): Promise<number> {
  const [row] = await dbQuery<{ n: number }>(
    `SELECT COUNT(DISTINCT p.id) AS n FROM project_assignments a JOIN projects p ON p.id = a.project_id
     WHERE a.team_member_id = ? AND p.status NOT IN (${NOT_ACTIVE.map(() => '?').join(',')})
       ${exceptProjectId ? 'AND p.id != ?' : ''}`,
    [editorId, ...NOT_ACTIVE, ...(exceptProjectId ? [exceptProjectId] : [])],
  )
  return row?.n ?? 0
}

async function latestRequest(editorId: string, projectId: string) {
  try {
    const [r] = await dbQuery<{ id: string; status: string }>(
      'SELECT id, status FROM urgent_requests WHERE editor_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 1',
      [editorId, projectId],
    )
    return r ?? null
  } catch (e) {
    // Before migration 016 runs: no requests yet — claiming must keep working.
    if (/no such table/i.test((e as Error)?.message ?? '')) return null
    throw e
  }
}

/**
 * May this person take this project? Editors under the limit, or holding an
 * approved urgent request for it. Everyone else (copywriters…) always may.
 */
export async function mayTake(profile: Who, userId: string, projectId: string): Promise<{ ok: boolean; requestId?: string }> {
  if (!isEditor(profile)) return { ok: true }
  if ((await activeCount(userId, projectId)) < CARE_CONFIG.editors.maxActiveProjects) return { ok: true }
  const r = await latestRequest(userId, projectId)
  return r?.status === 'approved' ? { ok: true, requestId: r.id } : { ok: false }
}

export async function markUsed(requestId: string | undefined) {
  if (requestId) await dbExecute("UPDATE urgent_requests SET status = 'used' WHERE id = ? AND status = 'approved'", [requestId])
}

async function notify(recipients: string[], projectId: string, message: string, role: 'admin' | 'team') {
  const now = nowIso()
  // 'status_changed' — the notifications table only allows its original types.
  await Promise.all(recipients.map((id) => dbExecute(
    'INSERT INTO notifications (id, recipient_id, project_id, type, message, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
    [newId(), id, projectId, 'status_changed', message, now],
  )))
  await sendEmailNotifications(recipients.map((recipientId) => ({
    recipientId, subject: message, text: `${message}\n\n${projectUrl(projectId, role)}`,
  })))
}

export const URGENT_PREFIX = 'Urgent request:'

/** POST /api/projects/:id/urgent */
export async function handleRequestUrgent(req: VercelRequest, res: VercelResponse, projectId: string) {
  try {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
    const { clerkUserId, profile } = await requireAuth(req)
    requireRole(profile, 'team')
    if (!isEditor(profile)) { res.status(403).json({ error: 'Editors only' }); return }
    const [project] = await dbQuery<{ id: string; title: string }>('SELECT id, title FROM projects WHERE id = ?', [projectId])
    if (!project) { res.status(404).json({ error: 'Project not found' }); return }
    const prev = await latestRequest(clerkUserId, projectId)
    if (prev?.status === 'pending' || prev?.status === 'approved') { res.json({ status: prev.status }); return }
    await dbExecute('INSERT INTO urgent_requests (id, project_id, editor_id, status, created_at) VALUES (?, ?, ?, ?, ?)',
      [newId(), projectId, clerkUserId, 'pending', nowIso()])
    const admins = await dbQuery<{ id: string }>("SELECT id FROM profiles WHERE role = 'admin' AND disabled = 0")
    await notify(admins.map((a) => a.id), projectId, `${URGENT_PREFIX} ${profile.full_name} wants "${project.title}"`, 'admin')
    res.json({ status: 'pending' })
  } catch (e) { sendError(res, e) }
}

/** GET /api/editor-limit?project=:id */
export async function handleEditorLimit(req: VercelRequest, res: VercelResponse) {
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    requireRole(profile, 'team')
    const projectId = String(req.query.project ?? '')
    const max = CARE_CONFIG.editors.maxActiveProjects
    if (!isEditor(profile)) { res.json({ editor: false, active: 0, max, limited: false, request: null }); return }
    const active = await activeCount(clerkUserId, projectId || undefined)
    const r = projectId ? await latestRequest(clerkUserId, projectId) : null
    res.json({ editor: true, active, max, limited: active >= max, request: r?.status ?? null })
  } catch (e) { sendError(res, e) }
}

/** /api/admin/urgent-requests[/:id] */
export async function handleUrgentAdmin(req: VercelRequest, res: VercelResponse, rest: string[]) {
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    requireRole(profile, 'admin')
    if (req.method === 'GET' && rest.length === 0) {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
      res.json(await dbQuery(
        `SELECT r.id, r.project_id, r.editor_id, r.status, r.created_at, p.title AS project_title, e.full_name AS editor_name
         FROM urgent_requests r JOIN projects p ON p.id = r.project_id JOIN profiles e ON e.id = r.editor_id
         WHERE r.created_at >= ? ORDER BY r.created_at DESC`, [since]))
      return
    }
    if (req.method === 'POST' && rest.length === 1) {
      const decision = (req.body as { decision?: string })?.decision
      if (decision !== 'approve' && decision !== 'decline') { res.status(400).json({ error: 'decision must be approve or decline' }); return }
      const [r] = await dbQuery<{ id: string; status: string; project_id: string; editor_id: string }>(
        'SELECT id, status, project_id, editor_id FROM urgent_requests WHERE id = ?', [rest[0]])
      if (!r) { res.status(404).json({ error: 'Request not found' }); return }
      if (r.status !== 'pending') { res.status(409).json({ error: 'Already decided', status: r.status }); return }
      const status = decision === 'approve' ? 'approved' : 'declined'
      await dbExecute('UPDATE urgent_requests SET status = ?, decided_by = ?, decided_at = ? WHERE id = ? AND status = ?',
        [status, clerkUserId, nowIso(), r.id, 'pending'])
      const [p] = await dbQuery<{ title: string }>('SELECT title FROM projects WHERE id = ?', [r.project_id])
      await notify([r.editor_id], r.project_id, `Urgent request ${status}: "${p?.title ?? ''}"`, 'team')
      res.json({ status })
      return
    }
    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) { sendError(res, e) }
}
