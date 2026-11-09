// Past clients: archive (default), restore, permanent delete (migration 017).
//
//   POST   /api/admin/clients/:id/archive   admins — hidden everywhere, can't log in
//   POST   /api/admin/clients/:id/restore   admins — back to normal
//   DELETE /api/admin/clients/:id           FULL admins, archived clients only,
//                                           body { confirm_name } = their exact name
//
// Archive keeps every video and file, so stats stay correct. "Hidden" works
// through the existing disabled flag: Client Care, Plans, the client pickers
// and login already skip disabled accounts.
//
// Permanent delete removes the client and everything that is theirs — see
// the list in deleteClient(). Database first, then the files in R2 (a failed
// file delete only leaves an orphan file, never broken data).

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../auth.js'
import { dbQuery, dbExecute, nowIso } from '../db.js'
import { deleteObject } from '../r2.js'
import { sendError } from './access.js'

type Client = { id: string; full_name: string; role: string; archived_at: string | null }

async function loadClient(id: string): Promise<Client> {
  const [c] = await dbQuery<Client>('SELECT id, full_name, role, archived_at FROM profiles WHERE id = ?', [id])
  if (!c || c.role !== 'client') throw Object.assign(new Error('Client not found'), { status: 404 })
  return c
}

const inList = (n: number) => Array(n).fill('?').join(',')

/** Every R2 key that belongs to this client. */
async function clientKeys(clientId: string, projectIds: string[]): Promise<string[]> {
  const keys: string[] = []
  if (projectIds.length) {
    const files = await dbQuery<{ storage_key: string; preview_storage_key: string | null }>(
      `SELECT storage_key, preview_storage_key FROM project_files WHERE project_id IN (${inList(projectIds.length)})`, projectIds)
    for (const f of files) { keys.push(f.storage_key); if (f.preview_storage_key) keys.push(f.preview_storage_key) }
  }
  const gallery = await dbQuery<Record<string, string | null>>('SELECT * FROM gallery_files WHERE owner_id = ?', [clientId])
  for (const g of gallery) { if (g.storage_key) keys.push(g.storage_key); if (g.thumb_key) keys.push(g.thumb_key) }
  try {
    const answers = await dbQuery<{ answer: string }>(
      `SELECT a.answer FROM onboarding_answers a JOIN onboarding_questions q ON q.id = a.question_id
       WHERE a.client_id = ? AND q.type = 'file' AND a.answer IS NOT NULL`, [clientId])
    for (const a of answers) {
      try { for (const f of JSON.parse(a.answer) as { key?: string }[]) if (f?.key) keys.push(f.key) } catch { /* not a list */ }
    }
  } catch { /* onboarding not migrated */ }
  return [...new Set(keys.filter(Boolean))]
}

/**
 * Permanently delete a client. Database: the account; all their projects and
 * each project's files list, comments, editor assignments, deadlines, status
 * history, team notes, revision log and urgent requests; their gallery and
 * folders; calendar entries; Client Care record, contacts log, contracts,
 * production plan, SOP rules, onboarding answers + checklist, Instagram
 * accounts, copywriter assignments; their notifications and those about
 * their projects; their messages (direct and group). R2: every project file
 * (raw footage, deliveries, supporting files, review copies), gallery files,
 * thumbnails and onboarding uploads.
 */
async function deleteClient(clientId: string): Promise<{ projects: number; files: number }> {
  const projectIds = (await dbQuery<{ id: string }>('SELECT id FROM projects WHERE client_id = ?', [clientId])).map((p) => p.id)
  const keys = await clientKeys(clientId, projectIds)

  if (projectIds.length) {
    const q = inList(projectIds.length)
    // No ON DELETE CASCADE from notifications → projects.
    await dbExecute(`DELETE FROM notifications WHERE project_id IN (${q})`, projectIds)
    await dbExecute(`UPDATE calendar_events SET project_id = NULL WHERE project_id IN (${q})`, projectIds)
  }
  await dbExecute('DELETE FROM notifications WHERE recipient_id = ?', [clientId])
  // Rows that point at the client without a cascade (anywhere they appear).
  await dbExecute('DELETE FROM timeline_comments WHERE author_id = ? OR resolved_by = ?', [clientId, clientId])
  await dbExecute('DELETE FROM status_history WHERE actor_id = ?', [clientId])
  await dbExecute('DELETE FROM chat_messages WHERE sender_id = ?', [clientId])
  await dbExecute('DELETE FROM chat_groups WHERE created_by = ?', [clientId])
  // Projects: cascades to files list, comments, assignments, deadlines,
  // status history, team notes, revision log, urgent requests.
  for (const id of projectIds) await dbExecute('DELETE FROM projects WHERE id = ?', [id])
  await dbExecute('DELETE FROM project_files WHERE uploader_id = ?', [clientId])
  // The account: cascades to gallery, calendar, Client Care tables,
  // contracts, plans, onboarding, Instagram, direct-message threads.
  await dbExecute('DELETE FROM profiles WHERE id = ?', [clientId])

  await Promise.allSettled(keys.map((k) => deleteObject(k)))
  return { projects: projectIds.length, files: keys.length }
}

export async function handleClientArchiveRoute(req: VercelRequest, res: VercelResponse, rest: string[]) {
  try {
    const { profile } = await requireAuth(req)
    requireRole(profile, 'admin')
    const id = rest[0]
    const c = await loadClient(id)

    if (req.method === 'POST' && rest[1] === 'archive') {
      await dbExecute('UPDATE profiles SET archived_at = ?, disabled = 1, updated_at = ? WHERE id = ?', [nowIso(), nowIso(), id])
      res.json({ ok: true }); return
    }
    if (req.method === 'POST' && rest[1] === 'restore') {
      await dbExecute('UPDATE profiles SET archived_at = NULL, disabled = 0, updated_at = ? WHERE id = ?', [nowIso(), id])
      res.json({ ok: true }); return
    }
    if (req.method === 'DELETE' && rest.length === 1) {
      if (profile.admin_role === 'manager') { res.status(403).json({ error: 'Only full admins can delete clients' }); return }
      if (!c.archived_at) { res.status(400).json({ error: 'Archive the client first' }); return }
      const typed = String((req.body as { confirm_name?: string })?.confirm_name ?? '').trim()
      if (typed !== c.full_name.trim()) { res.status(400).json({ error: 'Name does not match' }); return }
      res.json({ ok: true, ...(await deleteClient(id)) }); return
    }
    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) { sendError(res, e) }
}
