// Shared access + error handling for the admin-only Client Care and Editor
// Performance endpoints.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../auth.js'
import { processPendingRevisions } from './sop.js'

/** Full admins only: clients, editors AND managers are refused. */
export async function requireCareAdmin(req: VercelRequest) {
  const auth = await requireAuth(req)
  requireRole(auth.profile, 'admin')
  if ((auth.profile as any).admin_role === 'manager') {
    throw Object.assign(new Error('Client Care is available to full admins only'), { status: 403 })
  }
  return auth
}

export function sendError(res: VercelResponse, e: any) {
  const msg: string = e?.message ?? 'Internal error'
  if (/no such table|no such column/i.test(msg)) {
    res.status(500).json({ error: 'Client Care needs database migration 011 — run db/migrations/011_client_care.sql' })
    return
  }
  res.status(e?.status ?? 500).json({ error: msg })
}

/** Categorise/merge any new revision notes before showing data. Best-effort:
 *  a failure here is logged and never stops the pages. */
export async function processRevisionsSafely(clientId?: string) {
  try { await processPendingRevisions({ clientId }) } catch (e: any) {
    console.warn('[care] revision processing skipped:', e?.message)
  }
}
