import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_helpers/auth'
import { dbQuery } from '../_helpers/db'
import type { CalendarEvent, Deadline, Project } from '../../src/types'

interface DeadlineRow extends Deadline {
  project_title: string
  member_full_name: string
}

interface ProjectRow {
  id: string
  title: string
  status: string
  created_at: string
  updated_at: string
  client_id: string
}

/**
 * GET /api/calendar
 * Returns calendar events for the authenticated user.
 * - Admin: all project lifecycle events + all deadlines
 * - Team:  assigned project events + own deadlines
 * - Client: own project events only (no deadlines)
 *
 * Optional query params:
 *   ?from=YYYY-MM-DD  (filter events on or after this date)
 *   ?to=YYYY-MM-DD    (filter events on or before this date)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    const from = req.query.from as string | undefined
    const to   = req.query.to   as string | undefined

    // ── Fetch relevant projects ───────────────────────────────────────────────
    let projects: ProjectRow[]
    if (profile.role === 'admin') {
      projects = await dbQuery<ProjectRow>('SELECT id, title, status, created_at, updated_at, client_id FROM projects ORDER BY created_at ASC')
    } else if (profile.role === 'client') {
      projects = await dbQuery<ProjectRow>(
        'SELECT id, title, status, created_at, updated_at, client_id FROM projects WHERE client_id = ? ORDER BY created_at ASC',
        [clerkUserId]
      )
    } else {
      // Team — assigned projects only
      projects = await dbQuery<ProjectRow>(
        `SELECT pr.id, pr.title, pr.status, pr.created_at, pr.updated_at, pr.client_id
         FROM projects pr
         INNER JOIN project_assignments pa ON pa.project_id = pr.id AND pa.team_member_id = ?
         ORDER BY pr.created_at ASC`,
        [clerkUserId]
      )
    }

    const events: CalendarEvent[] = []

    // ── Static project lifecycle events ──────────────────────────────────────
    for (const p of projects) {
      // project_created
      events.push({
        id: `ce-created-${p.id}`,
        project_id: p.id,
        type: 'project_created',
        title: `${p.title} — Created`,
        date: p.created_at.slice(0, 10),
        color: 'bg-blue-500',
        created_at: p.created_at,
      })

      // project_approved
      if (p.status === 'client_approved') {
        events.push({
          id: `ce-approved-${p.id}`,
          project_id: p.id,
          type: 'project_approved',
          title: `${p.title} — Approved ✓`,
          date: p.updated_at.slice(0, 10),
          color: 'bg-green-500',
          created_at: p.updated_at,
        })
      }
    }

    // ── Deadline events (admin + team only) ───────────────────────────────────
    if (profile.role !== 'client') {
      let deadlineRows: DeadlineRow[]
      const projectIds = projects.map((p) => p.id)

      if (projectIds.length === 0) {
        deadlineRows = []
      } else if (profile.role === 'admin') {
        deadlineRows = await dbQuery<DeadlineRow>(
          `SELECT d.*, pr.title AS project_title, p.full_name AS member_full_name
           FROM deadlines d
           JOIN projects pr ON pr.id = d.project_id
           JOIN profiles p  ON p.id  = d.team_member_id
           ORDER BY d.due_at ASC`
        )
      } else {
        deadlineRows = await dbQuery<DeadlineRow>(
          `SELECT d.*, pr.title AS project_title, p.full_name AS member_full_name
           FROM deadlines d
           JOIN projects pr ON pr.id = d.project_id
           JOIN profiles p  ON p.id  = d.team_member_id
           WHERE d.team_member_id = ?
           ORDER BY d.due_at ASC`,
          [clerkUserId]
        )
      }

      for (const dl of deadlineRows) {
        const color =
          dl.status === 'met'    ? 'bg-green-500' :
          dl.status === 'missed' ? 'bg-red-500'   :
          'bg-orange-500'

        const suffix = profile.role === 'admin' ? ` · ${dl.member_full_name}` : ''

        events.push({
          id: `ce-deadline-${dl.id}`,
          project_id: dl.project_id,
          type: 'deadline',
          title: `⏰ ${dl.project_title}${suffix}`,
          date: dl.due_at.slice(0, 10),
          color,
          deadline_id: dl.id,
          team_member_id: dl.team_member_id,
          created_at: dl.created_at,
        })
      }
    }

    // ── Manual calendar events ────────────────────────────────────────────────
    // Fetch events owned by this user OR assigned to them via calendar_event_participants
    const manualRows = await dbQuery<{
      id: string; owner_id: string; title: string; date: string; color: string
      content_type: string | null; content_status: string | null; comments: string | null
      double_down: number; inspiration_url: string | null; script: string | null; caption: string | null
      created_at: string
    }>(
      `SELECT DISTINCT e.*
       FROM calendar_events e
       LEFT JOIN calendar_event_participants p ON p.event_id = e.id AND p.profile_id = ?
       WHERE e.owner_id = ? OR p.profile_id = ?
       ORDER BY e.date ASC`,
      [clerkUserId, clerkUserId, clerkUserId]
    )

    // Fetch participant ids for these events
    const manualEventIds = manualRows.map((m) => m.id)
    const manualParticipants = manualEventIds.length > 0
      ? await dbQuery<{ event_id: string; profile_id: string; role: string }>(
          `SELECT event_id, profile_id, role FROM calendar_event_participants WHERE event_id IN (${manualEventIds.map(() => '?').join(',')})`,
          manualEventIds
        )
      : []

    for (const m of manualRows) {
      events.push({
        id: m.id,
        type: 'manual',
        owner_id: m.owner_id,
        title: m.title,
        date: m.date,
        color: m.color,
        content_type: m.content_type as any ?? null,
        content_status: m.content_status as any ?? null,
        comments: m.comments ?? null,
        double_down: Boolean(m.double_down),
        inspiration_url: m.inspiration_url ?? null,
        script: m.script ?? null,
        caption: m.caption ?? null,
        assigned_client_ids: manualParticipants.filter((p) => p.event_id === m.id && p.role === 'client').map((p) => p.profile_id),
        assigned_team_ids: manualParticipants.filter((p) => p.event_id === m.id && p.role === 'team').map((p) => p.profile_id),
        created_at: m.created_at,
      })
    }

    // ── Date range filter ─────────────────────────────────────────────────────
    let filtered = events
    if (from) filtered = filtered.filter((e) => e.date >= from)
    if (to)   filtered = filtered.filter((e) => e.date <= to)

    res.json(filtered)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
