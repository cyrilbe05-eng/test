import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole, createClerkAdmin } from '../../_helpers/auth'
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

    const rows = await dbQuery<Profile>('SELECT * FROM profiles WHERE id = ?', [targetId])
    if (!rows[0]) {
      res.status(404).json({ error: 'User not found' })
      return
    }
    if (rows[0].role === 'admin') {
      res.status(403).json({ error: 'Cannot disable an admin account' })
      return
    }

    // Disable in D1
    await dbExecute(
      'UPDATE profiles SET disabled = 1, updated_at = ? WHERE id = ?',
      [nowIso(), targetId]
    )

    // Revoke all Clerk sessions for this user
    const clerk = createClerkAdmin()
    const sessions = await clerk.sessions.getSessionList({ userId: targetId, status: 'active' })
    await Promise.all(sessions.data.map((s) => clerk.sessions.revokeSession(s.id)))

    res.json({ ok: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
