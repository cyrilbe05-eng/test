import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../_helpers/auth'
import { dbQuery, dbExecute, newId, nowIso } from '../_helpers/db'
import type { Plan } from '../../src/types'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { profile } = await requireAuth(req)

    // GET — any authenticated user can read plans (needed for CreateUserModal)
    if (req.method === 'GET') {
      const plans = await dbQuery<Plan>('SELECT * FROM plans ORDER BY max_deliverables ASC')
      res.json(plans)
      return
    }

    // Mutations require admin
    requireRole(profile, 'admin')

    if (req.method === 'POST') {
      const { name, max_deliverables, max_client_revisions, storage_limit_mb, max_active_projects } = req.body
      if (!name || max_deliverables == null || max_client_revisions == null || storage_limit_mb == null) {
        res.status(400).json({ error: 'name, max_deliverables, max_client_revisions, storage_limit_mb required' })
        return
      }
      const id = 'plan_' + newId()
      await dbExecute(
        'INSERT INTO plans (id, name, max_deliverables, max_client_revisions, storage_limit_mb, max_active_projects, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, String(name), Number(max_deliverables), Number(max_client_revisions), Number(storage_limit_mb), max_active_projects != null ? Number(max_active_projects) : -1, nowIso()]
      )
      const [plan] = await dbQuery<Plan>('SELECT * FROM plans WHERE id = ?', [id])
      res.status(201).json(plan)
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
