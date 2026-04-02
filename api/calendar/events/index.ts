import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../../_helpers/auth'
import { dbQuery, dbExecute, newId, nowIso } from '../../_helpers/db'
import { ok, err, handleError } from '../../_helpers/respond'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { clerkUserId } = await requireAuth(req)

    // ── GET /api/calendar/events ──────────────────────────────────────────────
    if (req.method === 'GET') {
      const [profileRow] = await dbQuery<{ role: string }>('SELECT role FROM profiles WHERE id = ?', [clerkUserId])
      const role = profileRow?.role

      let events: unknown[]
      if (role === 'admin') {
        events = await dbQuery('SELECT * FROM calendar_events ORDER BY date ASC', [])
      } else if (role === 'client') {
        events = await dbQuery(
          `SELECT e.* FROM calendar_events e
           LEFT JOIN calendar_event_participants p ON p.event_id = e.id AND p.profile_id = ?
           WHERE e.owner_id = ? OR p.profile_id = ?
           ORDER BY e.date ASC`,
          [clerkUserId, clerkUserId, clerkUserId]
        )
      } else {
        // team
        events = await dbQuery(
          `SELECT e.* FROM calendar_events e
           LEFT JOIN calendar_event_participants p ON p.event_id = e.id AND p.profile_id = ?
           WHERE e.owner_id = ? OR p.profile_id = ?
           ORDER BY e.date ASC`,
          [clerkUserId, clerkUserId, clerkUserId]
        )
      }

      // Attach participant ids to each event
      const eventIds = (events as { id: string }[]).map((e) => e.id)
      const participants = eventIds.length > 0
        ? await dbQuery<{ event_id: string; profile_id: string; role: string }>(
            `SELECT event_id, profile_id, role FROM calendar_event_participants WHERE event_id IN (${eventIds.map(() => '?').join(',')})`,
            eventIds
          )
        : []

      const enriched = (events as Record<string, unknown>[]).map((e) => ({
        ...e,
        double_down: Boolean(e.double_down),
        assigned_client_ids: participants.filter((p) => p.event_id === e.id && p.role === 'client').map((p) => p.profile_id),
        assigned_team_ids:   participants.filter((p) => p.event_id === e.id && p.role === 'team').map((p) => p.profile_id),
      }))

      return ok(res, enriched)
    }

    // ── POST /api/calendar/events ─────────────────────────────────────────────
    if (req.method === 'POST') {
      const {
        title, date, color, content_type, content_status, comments, double_down,
        inspiration_url, script, caption,
        assigned_client_ids, assigned_team_ids,
      } = req.body as {
        title: string
        date: string
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

      if (!title || !date) {
        return err(res, 'title and date are required', 400)
      }

      const VALID_CONTENT_TYPES = ['Reel', 'Story', 'Carousel', 'Post']
      const VALID_CONTENT_STATUSES = ['Idea', 'Drafting', 'Scheduled']

      if (content_type && !VALID_CONTENT_TYPES.includes(content_type)) {
        return err(res, 'Invalid content_type', 400)
      }
      if (content_status && !VALID_CONTENT_STATUSES.includes(content_status)) {
        return err(res, 'Invalid content_status', 400)
      }

      // Only admin can assign participants — check role
      const [profile] = await dbQuery<{ role: string }>('SELECT role FROM profiles WHERE id = ?', [clerkUserId])
      const isAdmin = profile?.role === 'admin'

      const id = newId()
      const now = nowIso()
      const eventColor = color ?? 'bg-indigo-500'

      await dbExecute(
        `INSERT INTO calendar_events (id, owner_id, title, date, color, content_type, content_status, comments, double_down, inspiration_url, script, caption, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, clerkUserId, title, date, eventColor, content_type ?? null, content_status ?? null, comments ?? null, double_down ? 1 : 0, inspiration_url ?? null, script ?? null, caption ?? null, now, now]
      )

      // Insert participants (admin only)
      if (isAdmin) {
        for (const profileId of (assigned_client_ids ?? [])) {
          await dbExecute(
            'INSERT OR IGNORE INTO calendar_event_participants (event_id, profile_id, role) VALUES (?, ?, ?)',
            [id, profileId, 'client']
          )
        }
        for (const profileId of (assigned_team_ids ?? [])) {
          await dbExecute(
            'INSERT OR IGNORE INTO calendar_event_participants (event_id, profile_id, role) VALUES (?, ?, ?)',
            [id, profileId, 'team']
          )
        }
      }

      const [created] = await dbQuery<Record<string, unknown>>(
        'SELECT * FROM calendar_events WHERE id = ?',
        [id]
      )

      return ok(res, { ...created, double_down: Boolean(created.double_down) }, 201)
    }

    return err(res, 'Method not allowed', 405)
  } catch (e) {
    return handleError(res, e)
  }
}
