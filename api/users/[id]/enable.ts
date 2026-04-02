import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../../_helpers/auth'
import { dbExecute, dbQuery, nowIso } from '../../_helpers/db'
import type { Profile } from '../../../src/types'

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

    await dbExecute(
      'UPDATE profiles SET disabled = 0, updated_at = ? WHERE id = ?',
      [nowIso(), targetId]
    )

    res.json({ ok: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
