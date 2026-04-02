import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_helpers/auth'
import { dbExecute } from '../_helpers/db'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId } = await requireAuth(req)

    await dbExecute(
      'UPDATE notifications SET read = 1 WHERE recipient_id = ? AND read = 0',
      [clerkUserId]
    )

    res.json({ ok: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
