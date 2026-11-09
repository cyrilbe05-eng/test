// Editor home — GET /api/editor-home (editors).
// What they're working on (with deadline + open revision notes), what is
// with the client, and what's available to take, plus their active count
// against the limit (CARE_CONFIG.editors.maxActiveProjects).

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../auth.js'
import { dbQuery } from '../db.js'
import { sendError } from './access.js'
import { CARE_CONFIG } from './config.js'

type Row = { id: string; title: string; status: string; updated_at: string; client: string | null }

async function requestsFor(editorId: string): Promise<Map<string, string>> {
  try {
    const rows = await dbQuery<{ project_id: string; status: string }>(
      'SELECT project_id, status FROM urgent_requests WHERE editor_id = ? ORDER BY created_at ASC', [editorId])
    return new Map(rows.map((r) => [r.project_id, r.status])) // latest wins
  } catch {
    return new Map() // before migration 016
  }
}

export async function handleEditorHome(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
    const { clerkUserId, profile } = await requireAuth(req)
    requireRole(profile, 'team')

    const mine = await dbQuery<Row & { due_at: string | null; deadline_status: string | null; open_notes: number }>(
      `SELECT p.id, p.title, p.status, p.updated_at, c.full_name AS client,
         (SELECT d.due_at FROM deadlines d WHERE d.project_id = p.id AND d.team_member_id = a.team_member_id ORDER BY d.due_at DESC LIMIT 1) AS due_at,
         (SELECT d.status FROM deadlines d WHERE d.project_id = p.id AND d.team_member_id = a.team_member_id ORDER BY d.due_at DESC LIMIT 1) AS deadline_status,
         (SELECT COUNT(*) FROM timeline_comments t WHERE t.project_id = p.id AND (t.resolved IS NULL OR t.resolved = 0)) AS open_notes
       FROM project_assignments a
       JOIN projects p ON p.id = a.project_id
       LEFT JOIN profiles c ON c.id = p.client_id
       WHERE a.team_member_id = ? AND p.status != 'client_approved'
       ORDER BY p.updated_at DESC`,
      [clerkUserId],
    )
    const available = await dbQuery<Row>(
      `SELECT p.id, p.title, p.status, p.updated_at, c.full_name AS client
       FROM projects p LEFT JOIN profiles c ON c.id = p.client_id
       WHERE p.status = 'pending_assignment'
         AND NOT EXISTS (SELECT 1 FROM project_assignments a WHERE a.project_id = p.id)
       ORDER BY p.created_at ASC LIMIT 30`,
    )
    const requests = await requestsFor(clerkUserId)
    const working = mine.filter((p) => p.status !== 'client_reviewing')

    res.json({
      active: working.length,
      max: CARE_CONFIG.editors.maxActiveProjects,
      working,
      with_client: mine.filter((p) => p.status === 'client_reviewing'),
      available: available.map((p) => ({ ...p, request: requests.get(p.id) ?? null })),
    })
  } catch (e) { sendError(res, e) }
}
