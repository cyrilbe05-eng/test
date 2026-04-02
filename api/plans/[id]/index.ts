import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../../_helpers/auth'
import { dbQuery, dbExecute } from '../../_helpers/db'
import type { Plan } from '../../../src/types'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { profile } = await requireAuth(req)

    const planId = req.query.id as string

    if (req.method === 'GET') {
      const [plan] = await dbQuery<Plan>('SELECT * FROM plans WHERE id = ?', [planId])
      if (!plan) { res.status(404).json({ error: 'Plan not found' }); return }
      res.json(plan)
      return
    }

    requireRole(profile, 'admin')

    if (req.method === 'PUT') {
      const { name, max_deliverables, max_client_revisions, storage_limit_mb, max_active_projects } = req.body
      if (!name || max_deliverables == null || max_client_revisions == null || storage_limit_mb == null) {
        res.status(400).json({ error: 'name, max_deliverables, max_client_revisions, storage_limit_mb required' })
        return
      }
      await dbExecute(
        'UPDATE plans SET name = ?, max_deliverables = ?, max_client_revisions = ?, storage_limit_mb = ?, max_active_projects = ? WHERE id = ?',
        [String(name), Number(max_deliverables), Number(max_client_revisions), Number(storage_limit_mb), max_active_projects != null ? Number(max_active_projects) : -1, planId]
      )
      const [plan] = await dbQuery<Plan>('SELECT * FROM plans WHERE id = ?', [planId])
      if (!plan) { res.status(404).json({ error: 'Plan not found' }); return }
      res.json(plan)
      return
    }

    if (req.method === 'DELETE') {
      // Check if any clients are on this plan before deleting
      const [row] = await dbQuery<{ count: number }>(
        'SELECT COUNT(*) AS count FROM profiles WHERE plan_id = ? AND role = ?',
        [planId, 'client']
      )
      if (row?.count > 0) {
        res.status(409).json({ error: `Cannot delete — ${row.count} client(s) are on this plan. Reassign them first.` })
        return
      }
      await dbExecute('DELETE FROM plans WHERE id = ?', [planId])
      res.json({ ok: true })
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
