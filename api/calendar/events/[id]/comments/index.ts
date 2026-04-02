import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../../../../_helpers/auth'
import { dbQuery, dbExecute, newId, nowIso } from '../../../../_helpers/db'
import { ok, err, handleError } from '../../../../_helpers/respond'

interface CommentRow {
  id: string
  event_id: string
  author_id: string
  text: string
  created_at: string
  author_name: string
  author_role: string
  author_avatar: string | null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { clerkUserId } = await requireAuth(req)
    const { id: eventId } = req.query as { id: string }

    // Verify the event exists and the caller is the owner or a participant
    const [event] = await dbQuery<{ id: string; owner_id: string }>(
      'SELECT id, owner_id FROM calendar_events WHERE id = ?',
      [eventId]
    )
    if (!event) return err(res, 'Event not found', 404)

    if (event.owner_id !== clerkUserId) {
      const [participant] = await dbQuery<{ profile_id: string }>(
        'SELECT profile_id FROM calendar_event_participants WHERE event_id = ? AND profile_id = ?',
        [eventId, clerkUserId]
      )
      if (!participant) return err(res, 'Forbidden', 403)
    }

    // ── GET /api/calendar/events/:id/comments ──────────────────────────────────
    if (req.method === 'GET') {
      const comments = await dbQuery<CommentRow>(
        `SELECT c.id, c.event_id, c.author_id, c.text, c.created_at,
                p.full_name AS author_name, p.role AS author_role, p.avatar_url AS author_avatar
         FROM calendar_event_comments c
         JOIN profiles p ON p.id = c.author_id
         WHERE c.event_id = ?
         ORDER BY c.created_at ASC`,
        [eventId]
      )
      return ok(res, comments)
    }

    // ── POST /api/calendar/events/:id/comments ────────────────────────────────
    if (req.method === 'POST') {
      const { text } = req.body as { text: string }
      if (!text?.trim()) return err(res, 'text is required', 400)

      const id = newId()
      const now = nowIso()

      await dbExecute(
        'INSERT INTO calendar_event_comments (id, event_id, author_id, text, created_at) VALUES (?, ?, ?, ?, ?)',
        [id, eventId, clerkUserId, text.trim(), now]
      )

      const [created] = await dbQuery<CommentRow>(
        `SELECT c.id, c.event_id, c.author_id, c.text, c.created_at,
                p.full_name AS author_name, p.role AS author_role, p.avatar_url AS author_avatar
         FROM calendar_event_comments c
         JOIN profiles p ON p.id = c.author_id
         WHERE c.id = ?`,
        [id]
      )
      return ok(res, created, 201)
    }

    return err(res, 'Method not allowed', 405)
  } catch (e) {
    return handleError(res, e)
  }
}
