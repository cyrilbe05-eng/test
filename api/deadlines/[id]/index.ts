import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../../_helpers/auth'
import { dbQuery, dbExecute, nowIso } from '../../_helpers/db'
import type { Deadline } from '../../../src/types'

/**
 * PATCH /api/deadlines/[id]
 * Admin-only.
 * Accepts:
 *   { due_at: string }         — reschedule
 *   { status: 'met'|'missed' } — resolve
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { profile } = await requireAuth(req)
    requireRole(profile, 'admin')

    const deadlineId = req.query.id as string

    const [dl] = await dbQuery<Deadline>('SELECT * FROM deadlines WHERE id = ?', [deadlineId])
    if (!dl) {
      res.status(404).json({ error: 'Deadline not found' })
      return
    }

    const { due_at, status } = req.body
    const updates: string[] = []
    const params: unknown[] = []

    if (due_at !== undefined) {
      // Validate ISO string
      if (isNaN(Date.parse(due_at))) {
        res.status(400).json({ error: 'due_at must be a valid ISO datetime string' })
        return
      }
      updates.push('due_at = ?')
      params.push(new Date(due_at).toISOString())
    }

    if (status !== undefined) {
      if (!['met', 'missed', 'pending'].includes(status)) {
        res.status(400).json({ error: 'status must be met, missed, or pending' })
        return
      }
      updates.push('status = ?')
      params.push(status)
      updates.push('resolved_at = ?')
      params.push(status === 'pending' ? null : nowIso())
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'Nothing to update' })
      return
    }

    params.push(deadlineId)
    await dbExecute(`UPDATE deadlines SET ${updates.join(', ')} WHERE id = ?`, params)

    const [updated] = await dbQuery<Deadline>('SELECT * FROM deadlines WHERE id = ?', [deadlineId])
    res.json(updated)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
