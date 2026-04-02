import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_helpers/auth'
import { dbQuery } from '../_helpers/db'
import type { Project } from '../../src/types'

type ProjectWithProfile = Project & {
  profiles: { full_name: string; email: string; avatar_url: string | null }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    let rows: ProjectWithProfile[]

    if (profile.role === 'admin') {
      rows = await dbQuery<ProjectWithProfile>(
        `SELECT pr.*,
          p.full_name  AS profile_full_name,
          p.email      AS profile_email,
          p.avatar_url AS profile_avatar_url
         FROM projects pr
         LEFT JOIN profiles p ON pr.client_id = p.id
         ORDER BY pr.created_at DESC`
      )
    } else if (profile.role === 'client') {
      rows = await dbQuery<ProjectWithProfile>(
        `SELECT pr.*,
          p.full_name  AS profile_full_name,
          p.email      AS profile_email,
          p.avatar_url AS profile_avatar_url
         FROM projects pr
         LEFT JOIN profiles p ON pr.client_id = p.id
         WHERE pr.client_id = ?
         ORDER BY pr.created_at DESC`,
        [clerkUserId]
      )
    } else {
      // team — only assigned projects
      rows = await dbQuery<ProjectWithProfile>(
        `SELECT pr.*,
          p.full_name  AS profile_full_name,
          p.email      AS profile_email,
          p.avatar_url AS profile_avatar_url
         FROM projects pr
         LEFT JOIN profiles p ON pr.client_id = p.id
         INNER JOIN project_assignments pa ON pa.project_id = pr.id AND pa.team_member_id = ?
         ORDER BY pr.created_at DESC`,
        [clerkUserId]
      )
    }

    // Reshape flat columns into nested profiles object
    const shaped = rows.map(({ profile_full_name, profile_email, profile_avatar_url, ...rest }: any) => ({
      ...rest,
      profiles: {
        full_name: profile_full_name,
        email: profile_email,
        avatar_url: profile_avatar_url,
      },
    }))

    res.json(shaped)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
