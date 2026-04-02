import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../_helpers/auth'
import { dbQuery } from '../_helpers/db'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { profile } = await requireAuth(req)
    requireRole(profile, 'admin')

    const rows = await dbQuery<any>(
      `SELECT pa.team_member_id, p.full_name AS profile_full_name
       FROM project_assignments pa
       LEFT JOIN profiles p ON pa.team_member_id = p.id`
    )

    const shaped = rows.map(({ profile_full_name, ...a }: any) => ({
      ...a,
      profiles: { full_name: profile_full_name },
    }))

    res.json(shaped)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
