import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_helpers/auth'
import { dbQuery } from '../_helpers/db'
import type { Notification } from '../../src/types'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId } = await requireAuth(req)

    const notifications = await dbQuery<Notification>(
      `SELECT * FROM notifications WHERE recipient_id = ? ORDER BY created_at DESC LIMIT 50`,
      [clerkUserId]
    )

    const shaped = notifications.map((n) => ({ ...n, read: Boolean(n.read) }))
    res.json(shaped)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
