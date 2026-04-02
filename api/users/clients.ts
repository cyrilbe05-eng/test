import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../_helpers/auth'
import { dbQuery } from '../_helpers/db'
import type { Profile } from '../../src/types'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { profile } = await requireAuth(req)
    requireRole(profile, 'admin')

    const clients = await dbQuery<Profile>(
      'SELECT * FROM profiles WHERE role = ? AND disabled = 0 ORDER BY full_name ASC',
      ['client']
    )

    const shaped = clients.map((c) => ({
      ...c,
      password_changed: Boolean(c.password_changed),
      disabled: Boolean(c.disabled),
    }))

    res.json(shaped)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
