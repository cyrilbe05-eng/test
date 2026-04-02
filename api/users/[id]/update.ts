import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../../_helpers/auth'
import { dbQuery, dbExecute, nowIso } from '../../_helpers/db'
import type { Profile } from '../../../src/types'

/**
 * PATCH /api/users/[id]
 * Admin-only. Update editable profile fields:
 *   full_name, phone, plan_id, client_id_label, time_saved_hours
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { profile: callerProfile } = await requireAuth(req)
    requireRole(callerProfile, 'admin')

    const targetId = req.query.id as string

    const [target] = await dbQuery<Profile>('SELECT * FROM profiles WHERE id = ?', [targetId])
    if (!target) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    const { full_name, phone, plan_id, client_id_label, time_saved_hours } = req.body

    const updates: string[] = []
    const params: unknown[] = []

    if (full_name !== undefined) {
      updates.push('full_name = ?')
      params.push(String(full_name))
    }
    if (phone !== undefined) {
      updates.push('phone = ?')
      params.push(phone ?? null)
    }
    if (plan_id !== undefined) {
      // Only clients can have a plan
      if (target.role !== 'client') {
        res.status(400).json({ error: 'plan_id can only be set for client accounts' })
        return
      }
      updates.push('plan_id = ?')
      params.push(plan_id ?? null)
    }
    if (client_id_label !== undefined) {
      // Only clients have a client_id_label
      if (target.role !== 'client') {
        res.status(400).json({ error: 'client_id_label can only be set for client accounts' })
        return
      }
      updates.push('client_id_label = ?')
      params.push(client_id_label ?? null)
    }
    if (time_saved_hours !== undefined) {
      updates.push('time_saved_hours = ?')
      params.push(time_saved_hours != null ? Number(time_saved_hours) : null)
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'Nothing to update' })
      return
    }

    updates.push('updated_at = ?')
    params.push(nowIso())
    params.push(targetId)

    await dbExecute(`UPDATE profiles SET ${updates.join(', ')} WHERE id = ?`, params)

    const [updated] = await dbQuery<Profile>('SELECT * FROM profiles WHERE id = ?', [targetId])
    res.json({ ...updated, password_changed: Boolean(updated.password_changed), disabled: Boolean(updated.disabled) })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
