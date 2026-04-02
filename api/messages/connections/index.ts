import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../../_helpers/auth'
import { dbQuery, dbExecute, newId, nowIso } from '../../_helpers/db'

interface ConnectionRow {
  id: string
  user_a: string
  user_b: string
  created_at: string
  user_a_full_name: string
  user_a_email: string
  user_a_role: string
  user_a_avatar_url: string | null
  user_b_full_name: string
  user_b_email: string
  user_b_role: string
  user_b_avatar_url: string | null
}

function shapeConnection(row: ConnectionRow) {
  const { user_a_full_name, user_a_email, user_a_role, user_a_avatar_url,
          user_b_full_name, user_b_email, user_b_role, user_b_avatar_url,
          ...rest } = row
  return {
    ...rest,
    profile_a: { full_name: user_a_full_name, email: user_a_email, role: user_a_role, avatar_url: user_a_avatar_url },
    profile_b: { full_name: user_b_full_name, email: user_b_email, role: user_b_role, avatar_url: user_b_avatar_url },
  }
}

const CONNECTION_SELECT = `
  SELECT
    c.id, c.user_a, c.user_b, c.created_at,
    pa.full_name  AS user_a_full_name,
    pa.email      AS user_a_email,
    pa.role       AS user_a_role,
    pa.avatar_url AS user_a_avatar_url,
    pb.full_name  AS user_b_full_name,
    pb.email      AS user_b_email,
    pb.role       AS user_b_role,
    pb.avatar_url AS user_b_avatar_url
  FROM chat_connections c
  JOIN profiles pa ON pa.id = c.user_a
  JOIN profiles pb ON pb.id = c.user_b
`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    if (req.method === 'GET') {
      let rows: ConnectionRow[]
      if (profile.role === 'admin') {
        rows = await dbQuery<ConnectionRow>(
          CONNECTION_SELECT + ' ORDER BY c.created_at DESC'
        )
      } else {
        rows = await dbQuery<ConnectionRow>(
          CONNECTION_SELECT + ' WHERE c.user_a = ? OR c.user_b = ? ORDER BY c.created_at DESC',
          [clerkUserId, clerkUserId]
        )
      }
      res.json(rows.map(shapeConnection))
      return
    }

    if (req.method === 'POST') {
      requireRole(profile, 'admin')
      const { userA, userB } = req.body
      if (!userA || !userB) {
        res.status(400).json({ error: 'userA and userB are required' })
        return
      }
      if (userA === userB) {
        res.status(400).json({ error: 'userA and userB must be different users' })
        return
      }

      // Enforce canonical ordering so the UNIQUE(user_a, user_b) constraint is reliable
      const [a, b] = [userA, userB].sort()

      // Check both users exist
      const users = await dbQuery<{ id: string }>(
        'SELECT id FROM profiles WHERE id IN (?, ?)',
        [a, b]
      )
      if (users.length < 2) {
        res.status(404).json({ error: 'One or both users not found' })
        return
      }

      const id = 'conn_' + newId()
      const created_at = nowIso()
      try {
        await dbExecute(
          'INSERT INTO chat_connections (id, user_a, user_b, created_at) VALUES (?, ?, ?, ?)',
          [id, a, b, created_at]
        )
      } catch (insertErr: any) {
        if (insertErr?.message?.includes('UNIQUE')) {
          res.status(409).json({ error: 'Connection already exists between these users' })
          return
        }
        throw insertErr
      }

      const [conn] = await dbQuery<ConnectionRow>(
        CONNECTION_SELECT + ' WHERE c.id = ?',
        [id]
      )
      res.status(201).json(shapeConnection(conn))
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
