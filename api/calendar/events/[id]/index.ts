import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../../../_helpers/auth'
import { dbQuery, dbExecute, nowIso } from '../../../_helpers/db'
import { ok, err, handleError } from '../../../_helpers/respond'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    const { id } = req.query as { id: string }

    // Fetch the event and verify ownership (admins can edit/delete any event)
    const [event] = await dbQuery<{ id: string; owner_id: string }>(
      'SELECT * FROM calendar_events WHERE id = ?',
      [id]
    )

    if (!event) {
      return err(res, 'Event not found', 404)
    }

    if (event.owner_id !== clerkUserId && profile.role !== 'admin') {
      return err(res, 'Forbidden', 403)
    }

    // ── PATCH /api/calendar/events/:id ────────────────────────────────────────
    if (req.method === 'PATCH') {
      const {
        title, date, color, content_type, content_status, comments, double_down,
        inspiration_url, script, caption,
        assigned_client_ids, assigned_team_ids,
      } = req.body as {
        title?: string
        date?: string
        color?: string
        content_type?: string | null
        content_status?: string | null
        comments?: string | null
        double_down?: boolean
        inspiration_url?: string | null
        script?: string | null
        caption?: string | null
        assigned_client_ids?: string[]
        assigned_team_ids?: string[]
      }

      const VALID_CONTENT_TYPES = ['Reel', 'Story', 'Carousel', 'Post']
      const VALID_CONTENT_STATUSES = ['Idea', 'Drafting', 'Scheduled']

      if (content_type !== undefined && content_type !== null && !VALID_CONTENT_TYPES.includes(content_type)) {
        return err(res, 'Invalid content_type', 400)
      }
      if (content_status !== undefined && content_status !== null && !VALID_CONTENT_STATUSES.includes(content_status)) {
        return err(res, 'Invalid content_status', 400)
      }

      const fields: string[] = []
      const values: unknown[] = []

      if (title           !== undefined) { fields.push('title = ?');           values.push(title) }
      if (date            !== undefined) { fields.push('date = ?');            values.push(date) }
      if (color           !== undefined) { fields.push('color = ?');           values.push(color) }
      if (content_type    !== undefined) { fields.push('content_type = ?');    values.push(content_type ?? null) }
      if (content_status  !== undefined) { fields.push('content_status = ?');  values.push(content_status ?? null) }
      if (comments        !== undefined) { fields.push('comments = ?');        values.push(comments ?? null) }
      if (double_down     !== undefined) { fields.push('double_down = ?');     values.push(double_down ? 1 : 0) }
      if (inspiration_url !== undefined) { fields.push('inspiration_url = ?'); values.push(inspiration_url ?? null) }
      if (script          !== undefined) { fields.push('script = ?');          values.push(script ?? null) }
      if (caption         !== undefined) { fields.push('caption = ?');         values.push(caption ?? null) }

      if (fields.length === 0 && assigned_client_ids === undefined && assigned_team_ids === undefined) {
        return err(res, 'No fields to update', 400)
      }

      if (fields.length > 0) {
        fields.push('updated_at = ?')
        values.push(nowIso())
        values.push(id)
        await dbExecute(`UPDATE calendar_events SET ${fields.join(', ')} WHERE id = ?`, values)
      }

      // Update participants (admin only)
      if (assigned_client_ids !== undefined || assigned_team_ids !== undefined) {
        if (profile.role === 'admin') {
          // Replace all participants for updated roles
          if (assigned_client_ids !== undefined) {
            await dbExecute('DELETE FROM calendar_event_participants WHERE event_id = ? AND role = ?', [id, 'client'])
            for (const profileId of assigned_client_ids) {
              await dbExecute(
                'INSERT OR IGNORE INTO calendar_event_participants (event_id, profile_id, role) VALUES (?, ?, ?)',
                [id, profileId, 'client']
              )
            }
          }
          if (assigned_team_ids !== undefined) {
            await dbExecute('DELETE FROM calendar_event_participants WHERE event_id = ? AND role = ?', [id, 'team'])
            for (const profileId of assigned_team_ids) {
              await dbExecute(
                'INSERT OR IGNORE INTO calendar_event_participants (event_id, profile_id, role) VALUES (?, ?, ?)',
                [id, profileId, 'team']
              )
            }
          }
        }
      }

      const [updated] = await dbQuery<Record<string, unknown>>('SELECT * FROM calendar_events WHERE id = ?', [id])
      return ok(res, { ...updated, double_down: Boolean(updated.double_down) })
    }

    // ── DELETE /api/calendar/events/:id ───────────────────────────────────────
    if (req.method === 'DELETE') {
      await dbExecute('DELETE FROM calendar_events WHERE id = ?', [id])
      return ok(res, { deleted: true })
    }

    return err(res, 'Method not allowed', 405)
  } catch (e) {
    return handleError(res, e)
  }
}
