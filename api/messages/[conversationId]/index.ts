import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../../_helpers/auth'
import { dbQuery, dbExecute, nowIso } from '../../_helpers/db'

interface ConnectionRow {
  id: string
  user_a: string
  user_b: string
}

interface GroupMemberRow {
  user_id: string
}

interface MessageRow {
  id: string
  connection_id: string | null
  group_id: string | null
  sender_id: string
  text: string
  created_at: string
  sender_full_name: string
  sender_role: string
}

interface ReadReceiptRow {
  message_id: string
  user_id: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    const conversationId = req.query.conversationId as string

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
        const [membership] = await dbQuery<GroupMemberRow>(
          'SELECT user_id FROM chat_group_members WHERE group_id = ? AND user_id = ?',
          [conversationId, clerkUserId]
        )
        if (!membership) {
          res.status(403).json({ error: 'Forbidden' })
          return
        }
      }
    }

    // Fetch messages with sender info
    const whereClause = isConnection ? 'cm.connection_id = ?' : 'cm.group_id = ?'
    const messages = await dbQuery<MessageRow>(
      `SELECT
        cm.id, cm.connection_id, cm.group_id, cm.sender_id, cm.text, cm.created_at,
        p.full_name AS sender_full_name,
        p.role      AS sender_role
       FROM chat_messages cm
       JOIN profiles p ON p.id = cm.sender_id
       WHERE ${whereClause}
       ORDER BY cm.created_at ASC`,
      [conversationId]
    )

    // Fetch read receipts for all returned messages
    let readReceipts: ReadReceiptRow[] = []
    if (messages.length > 0) {
      const msgIds = messages.map((m) => m.id)
      const placeholders = msgIds.map(() => '?').join(', ')
      readReceipts = await dbQuery<ReadReceiptRow>(
        `SELECT message_id, user_id FROM chat_read_receipts WHERE message_id IN (${placeholders})`,
        msgIds
      )
    }

    // Group read receipts by message_id
    const readByMap: Record<string, string[]> = {}
    for (const r of readReceipts) {
      if (!readByMap[r.message_id]) readByMap[r.message_id] = []
      readByMap[r.message_id].push(r.user_id)
    }

    // Mark all messages as read for the current user (upsert)
    const readAt = nowIso()
    for (const msg of messages) {
      // Only upsert if not already in the fetched receipts for this user
      const alreadyRead = (readByMap[msg.id] ?? []).includes(clerkUserId)
      if (!alreadyRead) {
        await dbExecute(
          `INSERT OR IGNORE INTO chat_read_receipts (message_id, user_id, read_at) VALUES (?, ?, ?)`,
          [msg.id, clerkUserId, readAt]
        )
        // Update the in-memory map so the response reflects the new read
        if (!readByMap[msg.id]) readByMap[msg.id] = []
        readByMap[msg.id].push(clerkUserId)
      }
    }

    const result = messages.map(({ sender_full_name, sender_role, ...msg }) => ({
      ...msg,
      sender: {
        full_name: sender_full_name,
        role: sender_role,
      },
      read_by: readByMap[msg.id] ?? [],
    }))

    res.json(result)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
