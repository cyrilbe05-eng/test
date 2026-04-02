import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_helpers/auth'
import { dbQuery, dbExecute, nowIso } from '../_helpers/db'
import type { Profile } from '../../src/types'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    if (req.method === 'GET') {
      res.json({ ...profile, password_changed: Boolean(profile.password_changed), disabled: Boolean(profile.disabled) })

    } else if (req.method === 'PATCH') {
      const body = req.body as Partial<Pick<Profile, 'password_changed' | 'avatar_url' | 'phone'>>
      const updates: string[] = []
      const params: unknown[] = []

      if (body.password_changed !== undefined) {
        updates.push('password_changed = ?')
        params.push(body.password_changed ? 1 : 0)
      }
      if (body.avatar_url !== undefined) {
        updates.push('avatar_url = ?')
        params.push(body.avatar_url)
      }
      if (body.phone !== undefined) {
        updates.push('phone = ?')
        params.push(body.phone)
      }

      if (updates.length === 0) {
        res.status(400).json({ error: 'Nothing to update' })
        return
      }

      updates.push('updated_at = ?')
      params.push(nowIso())
      params.push(clerkUserId)

      await dbExecute(`UPDATE profiles SET ${updates.join(', ')} WHERE id = ?`, params)

      const rows = await dbQuery<Profile>('SELECT * FROM profiles WHERE id = ?', [clerkUserId])
      const p = rows[0]
      res.json({ ...p, password_changed: Boolean(p.password_changed), disabled: Boolean(p.disabled) })

    } else {
      res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
