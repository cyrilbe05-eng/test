import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../../../_helpers/auth'
import { dbQuery, dbExecute } from '../../../_helpers/db'

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

async function fetchGroupWithMembers(groupId: string) {
  const [group] = await dbQuery<GroupRow>(
    'SELECT * FROM chat_groups WHERE id = ?',
    [groupId]
  )
  if (!group) return null

  const members = await dbQuery<MemberRow>(
    `SELECT m.group_id, m.user_id, p.full_name, p.email, p.role, p.avatar_url
     FROM chat_group_members m
     JOIN profiles p ON p.id = m.user_id
     WHERE m.group_id = ?`,
    [groupId]
  )

  return {
    ...group,
    member_ids: members.map((m) => m.user_id),
    members: members.map(({ user_id, full_name, email, role, avatar_url }) => ({
      user_id,
      full_name,
      email,
      role,
      avatar_url,
    })),
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    const groupId = req.query.id as string

    if (req.method === 'GET') {
      const group = await fetchGroupWithMembers(groupId)
      if (!group) {
        res.status(404).json({ error: 'Group not found' })
        return
      }

      // Non-admins must be a member
      if (profile.role !== 'admin') {
        const isMember = group.members.some((m) => m.user_id === clerkUserId)
        if (!isMember) {
          res.status(403).json({ error: 'Forbidden' })
          return
        }
      }

      res.json(group)
      return
    }

    if (req.method === 'DELETE') {
      requireRole(profile, 'admin')

      const [existing] = await dbQuery<{ id: string }>(
        'SELECT id FROM chat_groups WHERE id = ?',
        [groupId]
      )
      if (!existing) {
        res.status(404).json({ error: 'Group not found' })
        return
      }

      // Members and messages deleted via ON DELETE CASCADE
      await dbExecute('DELETE FROM chat_groups WHERE id = ?', [groupId])
      res.json({ ok: true })
      return
    }

    if (req.method === 'PATCH') {
      requireRole(profile, 'admin')

      const [existing] = await dbQuery<GroupRow>(
        'SELECT * FROM chat_groups WHERE id = ?',
        [groupId]
      )
      if (!existing) {
        res.status(404).json({ error: 'Group not found' })
        return
      }

      const { name, memberIds } = req.body

      if (name !== undefined) {
        if (!name || typeof name !== 'string') {
          res.status(400).json({ error: 'name must be a non-empty string' })
          return
        }
        await dbExecute(
          'UPDATE chat_groups SET name = ? WHERE id = ?',
          [String(name), groupId]
        )
      }

      if (memberIds !== undefined) {
        if (!Array.isArray(memberIds) || memberIds.length === 0) {
          res.status(400).json({ error: 'memberIds must be a non-empty array' })
          return
        }

        // Verify all new members exist
        const placeholders = memberIds.map(() => '?').join(', ')
        const foundUsers = await dbQuery<{ id: string }>(
          `SELECT id FROM profiles WHERE id IN (${placeholders})`,
          memberIds
        )
        if (foundUsers.length !== memberIds.length) {
          res.status(404).json({ error: 'One or more member IDs not found' })
          return
        }

        // Replace members: fetch existing for rollback, delete all, re-insert
        const existing = await dbQuery<{ user_id: string }>(
          'SELECT user_id FROM chat_group_members WHERE group_id = ?',
          [groupId]
        )
        await dbExecute('DELETE FROM chat_group_members WHERE group_id = ?', [groupId])
        try {
          for (const userId of memberIds) {
            await dbExecute(
              'INSERT INTO chat_group_members (group_id, user_id) VALUES (?, ?)',
              [groupId, userId]
            )
          }
        } catch (insertErr) {
          // Restore original members on failure
          for (const row of existing) {
            await dbExecute(
              'INSERT OR IGNORE INTO chat_group_members (group_id, user_id) VALUES (?, ?)',
              [groupId, row.user_id]
            ).catch(() => {})
          }
          throw insertErr
        }
      }

      const updated = await fetchGroupWithMembers(groupId)
      res.json(updated)
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
