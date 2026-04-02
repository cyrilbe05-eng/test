import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../../_helpers/auth'
import { dbExecute } from '../../_helpers/db'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId } = await requireAuth(req)
    const notificationId = req.query.id as string

    await dbExecute(
      'UPDATE notifications SET read = 1 WHERE id = ? AND recipient_id = ?',
      [notificationId, clerkUserId]
    )

    res.json({ ok: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
