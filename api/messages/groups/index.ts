import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../../_helpers/auth'
import { dbQuery, dbExecute, newId, nowIso } from '../../_helpers/db'

interface GroupRow {
  id: string
  name: string
  created_by: string
  created_at: string
}

interface MemberRow {
  group_id: string
  user_id: string
  full_name: string
  email: string
  role: string
  avatar_url: string | null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    if (req.method === 'GET') {
      let groups: GroupRow[]
      if (profile.role === 'admin') {
        groups = await dbQuery<GroupRow>(
          'SELECT * FROM chat_groups ORDER BY created_at DESC'
        )
      } else {
        groups = await dbQuery<GroupRow>(
          `SELECT g.* FROM chat_groups g
           INNER JOIN chat_group_members m ON m.group_id = g.id AND m.user_id = ?
           ORDER BY g.created_at DESC`,
          [clerkUserId]
        )
      }

      // Fetch members for each group
      if (groups.length === 0) {
        res.json([])
        return
      }
      const placeholders = groups.map(() => '?').join(', ')
      const groupIds = groups.map((g) => g.id)
      const members = await dbQuery<MemberRow>(
        `SELECT m.group_id, m.user_id, p.full_name, p.email, p.role, p.avatar_url
         FROM chat_group_members m
         JOIN profiles p ON p.id = m.user_id
         WHERE m.group_id IN (${placeholders})`,
        groupIds
      )

      const membersByGroup: Record<string, MemberRow[]> = {}
      for (const m of members) {
        if (!membersByGroup[m.group_id]) membersByGroup[m.group_id] = []
        membersByGroup[m.group_id].push(m)
      }

      res.json(
        groups.map((g) => {
          const groupMembers = membersByGroup[g.id] ?? []
          return {
            ...g,
            member_ids: groupMembers.map((m) => m.user_id),
            members: groupMembers.map(({ user_id, full_name, email, role, avatar_url }) => ({
              user_id,
              full_name,
              email,
              role,
              avatar_url,
            })),
          }
        })
      )
      return
    }

    if (req.method === 'POST') {
      requireRole(profile, 'admin')
      const { name, memberIds } = req.body
      if (!name) {
        res.status(400).json({ error: 'name is required' })
        return
      }
      if (!Array.isArray(memberIds) || memberIds.length === 0) {
        res.status(400).json({ error: 'memberIds must be a non-empty array' })
        return
      }

      // Verify all members exist
      const placeholders = memberIds.map(() => '?').join(', ')
      const foundUsers = await dbQuery<{ id: string }>(
        `SELECT id FROM profiles WHERE id IN (${placeholders})`,
        memberIds
      )
      if (foundUsers.length !== memberIds.length) {
        res.status(404).json({ error: 'One or more member IDs not found' })
        return
      }

      const groupId = 'grp_' + newId()
      const created_at = nowIso()
      await dbExecute(
        'INSERT INTO chat_groups (id, name, created_by, created_at) VALUES (?, ?, ?, ?)',
        [groupId, String(name), clerkUserId, created_at]
      )

      for (const userId of memberIds) {
        await dbExecute(
          'INSERT INTO chat_group_members (group_id, user_id) VALUES (?, ?)',
          [groupId, userId]
        )
      }

      const [group] = await dbQuery<GroupRow>(
        'SELECT * FROM chat_groups WHERE id = ?',
        [groupId]
      )
      const members = await dbQuery<MemberRow>(
        `SELECT m.group_id, m.user_id, p.full_name, p.email, p.role, p.avatar_url
         FROM chat_group_members m
         JOIN profiles p ON p.id = m.user_id
         WHERE m.group_id = ?`,
        [groupId]
      )

      res.status(201).json({
        ...group,
        member_ids: members.map((m) => m.user_id),
        members: members.map(({ user_id, full_name, email, role, avatar_url }) => ({
          user_id,
          full_name,
          email,
          role,
          avatar_url,
        })),
      })
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
