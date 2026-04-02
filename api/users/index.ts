import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../_helpers/auth'
import { dbQuery } from '../_helpers/db'
import type { Profile } from '../../src/types'

interface UserRow extends Profile {
  plan_name: string | null
  storage_limit_mb: number | null
  used_bytes: number
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { profile } = await requireAuth(req)
    requireRole(profile, 'admin')

    const users = await dbQuery<UserRow>(
      `SELECT p.*,
              pl.name               AS plan_name,
              pl.storage_limit_mb,
              COALESCE((
                SELECT SUM(pf.file_size)
                FROM project_files pf
                JOIN projects pr ON pr.id = pf.project_id
                WHERE pr.client_id = p.id
              ), 0) AS used_bytes
       FROM profiles p
       LEFT JOIN plans pl ON p.plan_id = pl.id
       ORDER BY p.created_at DESC`
    )

    const mapped = users.map(({ plan_name, storage_limit_mb, ...u }) => ({
      ...u,
      password_changed: Boolean(u.password_changed),
      disabled: Boolean(u.disabled),
      plans: plan_name ? { name: plan_name, storage_limit_mb: storage_limit_mb ?? -1 } : null,
    }))

    res.json(mapped)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
