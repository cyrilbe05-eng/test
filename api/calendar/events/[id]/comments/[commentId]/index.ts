import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../../../../../_helpers/auth'
import { dbQuery, dbExecute } from '../../../../../_helpers/db'
import { ok, err, handleError } from '../../../../../_helpers/respond'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    const { id: eventId, commentId } = req.query as { id: string; commentId: string }

    if (req.method === 'DELETE') {
      const [comment] = await dbQuery<{ id: string; author_id: string }>(
        'SELECT id, author_id FROM calendar_event_comments WHERE id = ? AND event_id = ?',
        [commentId, eventId]
      )
      if (!comment) return err(res, 'Comment not found', 404)

      if (comment.author_id !== clerkUserId && profile.role !== 'admin') {
        return err(res, 'Forbidden', 403)
      }

      await dbExecute('DELETE FROM calendar_event_comments WHERE id = ?', [commentId])
      return ok(res, { ok: true })
    }

    return err(res, 'Method not allowed', 405)
  } catch (e) {
    return handleError(res, e)
  }
}
