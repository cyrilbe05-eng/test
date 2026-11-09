// Carousels (migration 019).
//   PUT /api/project-files/order { project_id, ids: [fileId, …], from? }
//     → saves slide order: ids[i] gets position from + i (from defaults to 0,
//       so a single slide uploaded on its own can say where it goes).
// Clients may order their own project's source images; editors and admins
// order the finished slides (editors only while uploads are open, the same
// rule as deleting a slide).

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../auth.js'
import { dbQuery, dbExecute } from '../db.js'
import { sendError } from './access.js'

const missingColumn = (e: unknown) => /no such column|no column named/i.test((e as Error)?.message ?? '')

export async function handleFileOrder(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'PUT') { res.status(405).json({ error: 'Method not allowed' }); return }
    const { clerkUserId, profile } = await requireAuth(req)
    const { project_id, ids, from } = (req.body ?? {}) as { project_id?: string; ids?: unknown; from?: unknown }
    const base = Number.isInteger(from) && (from as number) >= 0 ? (from as number) : 0
    if (!project_id || !Array.isArray(ids) || !ids.length || ids.length > 100 || !ids.every((x) => typeof x === 'string')) {
      res.status(400).json({ error: 'project_id and ids required' }); return
    }
    const [project] = await dbQuery<{ client_id: string; status: string }>('SELECT client_id, status FROM projects WHERE id = ?', [project_id])
    if (!project) { res.status(404).json({ error: 'Project not found' }); return }

    const files = await dbQuery<{ id: string; file_type: string }>(
      `SELECT id, file_type FROM project_files WHERE project_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
      [project_id, ...ids],
    )
    if (files.length !== ids.length) { res.status(400).json({ error: 'Unknown file' }); return }

    const role = profile.role
    const ok =
      role === 'admin' ||
      (role === 'client' && project.client_id === clerkUserId && files.every((f) => f.file_type !== 'deliverable')) ||
      (role === 'team' && ['pending_assignment', 'in_progress', 'revision_requested'].includes(project.status))
    if (!ok) { res.status(403).json({ error: 'Forbidden' }); return }

    for (const [i, id] of (ids as string[]).entries()) {
      await dbExecute('UPDATE project_files SET sort_order = ? WHERE id = ? AND project_id = ?', [base + i, id, project_id])
    }
    res.json({ ok: true })
  } catch (e) {
    if (missingColumn(e)) { res.status(503).json({ error: 'Carousels need database migration 019' }); return }
    sendError(res, e)
  }
}
