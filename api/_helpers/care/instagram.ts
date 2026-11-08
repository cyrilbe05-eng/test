// Instagram accounts per client (migration 012).
//
//   PUT /api/admin/care/clients/:id/instagram   full admins — replace the list
//       (mounted in care/routes.ts; used by Create user and the Client panel)
//   GET /api/instagram/project/:projectId       admins + editors — the handles
//       of that project's client (shown on the editor's project page)

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../auth.js'
import { dbQuery, dbExecute, newId } from '../db.js'
import { parseInstagramList, MAX_INSTAGRAM_ACCOUNTS } from '../../../src/lib/instagram.js'

/** client_id → handles (in display order). Empty if the table isn't there yet. */
export async function loadInstagramHandles(clientId?: string): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  try {
    const rows = await dbQuery<{ client_id: string; handle: string }>(
      `SELECT client_id, handle FROM client_instagram_accounts${clientId ? ' WHERE client_id = ?' : ''}
       ORDER BY position ASC, created_at ASC`,
      clientId ? [clientId] : [],
    )
    for (const r of rows) (map.get(r.client_id) ?? map.set(r.client_id, []).get(r.client_id)!).push(r.handle)
  } catch (e: any) {
    console.warn('[care] instagram accounts unavailable:', e?.message)
  }
  return map
}

/** Validate then replace a client's whole list (simplest for add/remove/reorder). */
export async function replaceInstagramHandles(clientId: string, body: unknown): Promise<void> {
  const raw = (body as any)?.handles
  if (!Array.isArray(raw) || raw.some((h) => typeof h !== 'string')) {
    throw Object.assign(new Error('handles must be a list of Instagram usernames'), { status: 400 })
  }
  const { handles, invalid } = parseInstagramList(raw)
  if (invalid.length) {
    throw Object.assign(new Error(`Not a valid Instagram username: ${invalid.join(', ')}`), { status: 400 })
  }
  if (handles.length > MAX_INSTAGRAM_ACCOUNTS) {
    throw Object.assign(new Error(`At most ${MAX_INSTAGRAM_ACCOUNTS} Instagram accounts per client`), { status: 400 })
  }
  await dbExecute('DELETE FROM client_instagram_accounts WHERE client_id = ?', [clientId])
  for (const [i, handle] of handles.entries()) {
    await dbExecute(
      'INSERT INTO client_instagram_accounts (id, client_id, handle, position) VALUES (?, ?, ?, ?)',
      [newId(), clientId, handle, i],
    )
  }
}

/** Router entry for /api/instagram/... (read-only, admins + editors). */
export async function handleInstagramRoute(req: VercelRequest, res: VercelResponse, rest: string[]) {
  if (!(rest.length === 2 && rest[0] === 'project')) { res.status(404).json({ error: 'Not found' }); return }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { profile } = await requireAuth(req)
    requireRole(profile, 'admin', 'team')
    const [project] = await dbQuery<{ client_id: string; client_name: string | null }>(
      `SELECT pr.client_id, p.full_name AS client_name
       FROM projects pr LEFT JOIN profiles p ON p.id = pr.client_id WHERE pr.id = ?`,
      [rest[1]],
    )
    if (!project) { res.status(404).json({ error: 'Project not found' }); return }
    const handles = (await loadInstagramHandles(project.client_id)).get(project.client_id) ?? []
    res.json({ client_id: project.client_id, client_name: project.client_name, handles })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
