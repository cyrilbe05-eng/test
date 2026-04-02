import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../../../_helpers/auth'
import { dbQuery, dbExecute } from '../../../_helpers/db'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { profile } = await requireAuth(req)
    requireRole(profile, 'admin')

    const connectionId = req.query.id as string

    const [conn] = await dbQuery<{ id: string }>(
      'SELECT id FROM chat_connections WHERE id = ?',
      [connectionId]
    )
    if (!conn) {
      res.status(404).json({ error: 'Connection not found' })
      return
    }

    // Messages are deleted via ON DELETE CASCADE on chat_messages.connection_id
    await dbExecute('DELETE FROM chat_connections WHERE id = ?', [connectionId])

    res.json({ ok: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
