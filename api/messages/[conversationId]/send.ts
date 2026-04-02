import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../../_helpers/auth'
import { dbQuery, dbExecute, newId, nowIso } from '../../_helpers/db'

interface ConnectionRow {
  id: string
  user_a: string
  user_b: string
}

interface MessageRow {
  id: string
  connection_id: string | null
  group_id: string | null
  sender_id: string
  text: string
  created_at: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    const conversationId = req.query.conversationId as string

    const { text } = req.body
    if (!text || typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: 'text is required' })
      return
    }

    // Determine if conversationId refers to a connection or a group
    const [connection] = await dbQuery<ConnectionRow>(
      'SELECT id, user_a, user_b FROM chat_connections WHERE id = ?',
      [conversationId]
    )

    let isConnection = false
    let isGroup = false

    if (connection) {
      isConnection = true
      // Verify participant (or admin)
      if (profile.role !== 'admin') {
        if (connection.user_a !== clerkUserId && connection.user_b !== clerkUserId) {
          res.status(403).json({ error: 'Forbidden' })
          return
        }
      }
    } else {
      // Try group
      const [group] = await dbQuery<{ id: string }>(
        'SELECT id FROM chat_groups WHERE id = ?',
        [conversationId]
      )
      if (!group) {
        res.status(404).json({ error: 'Conversation not found' })
        return
      }
      isGroup = true
      // Verify participant (or admin)
      if (profile.role !== 'admin') {
        const [membership] = await dbQuery<{ user_id: string }>(
          'SELECT user_id FROM chat_group_members WHERE group_id = ? AND user_id = ?',
          [conversationId, clerkUserId]
        )
        if (!membership) {
          res.status(403).json({ error: 'Forbidden' })
          return
        }
      }
    }

    const messageId = 'msg_' + newId()
    const created_at = nowIso()
    const connection_id = isConnection ? conversationId : null
    const group_id = isGroup ? conversationId : null

    await dbExecute(
      'INSERT INTO chat_messages (id, connection_id, group_id, sender_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [messageId, connection_id, group_id, clerkUserId, text.trim(), created_at]
    )

    const [message] = await dbQuery<MessageRow>(
      'SELECT * FROM chat_messages WHERE id = ?',
      [messageId]
    )

    res.status(201).json(message)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
