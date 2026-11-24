// Deadline reminders for editors (runs hourly: GET /api/deadlines/reminders).
//
//   24 h before the deadline   editor:  "Due tomorrow: <project>"
//   when it goes overdue       editor:  "Overdue: <project>", then at most once a day while late
//   2+ days overdue            admins:  once
//
// Everything stops as soon as the editor delivers (sends the video for
// review), the deadline is marked met/missed, the editor is unassigned
// (their deadline is deleted) or the project is deleted.
//
// Never twice: each reminder is recorded in deadline_reminders BEFORE it is
// sent, and only sent if that record was new (INSERT … RETURNING).

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { dbQuery, dbExecute, newId, nowIso } from '../db.js'
import { projectUrl, sendEmailNotifications } from '../email.js'

const HOUR = 3_600_000
const DAY = 24 * HOUR
/** Deadlines more than this late are left alone (forgotten, not urgent). */
const STALE_AFTER = 14 * DAY
/** Project statuses in which the editor is still working on it. */
const WORKING = ['pending_assignment', 'in_progress', 'revision_requested']

export interface ReminderInput {
  deadline_id: string
  project_id: string
  project_title: string
  editor_id: string
  editor_name: string
  due_at: string
  created_at: string
  status: string            // deadline: pending | met | missed
  project_status: string
  delivered: boolean        // the editor sent it for review after the deadline was set
}

export interface Reminder {
  kind: string
  to: 'editor' | 'admins'
  message: string
  detail: string
}

const when = (ms: number) => new Date(ms).toUTCString().replace(/:00 GMT$/, ' UTC')

/** Which reminders are due for one deadline right now (before checking what was already sent). */
export function remindersFor(d: ReminderInput, now: number): Reminder[] {
  if (d.status !== 'pending' || d.delivered || !WORKING.includes(d.project_status)) return []
  const due = Date.parse(d.due_at)
  const created = Date.parse(d.created_at)
  if (!Number.isFinite(due)) return []
  const title = d.project_title || 'Untitled project'
  const out: Reminder[] = []

  if (now < due) {
    // Only when the deadline existed for more than a day; a deadline set
    // with less than 24 h to go comes with its own "assigned" message.
    if (due - now <= DAY && due - created > DAY) {
      out.push({
        kind: `due_soon|${d.due_at}`, to: 'editor',
        // "Due tomorrow" only when it really is about a day away; otherwise the
        // hours left (e.g. right after launch, or for a deadline that was moved).
        message: due - now > 20 * HOUR ? `Due tomorrow: ${title}`
          : `Due in ${Math.max(1, Math.round((due - now) / HOUR))} hour${Math.round((due - now) / HOUR) > 1 ? 's' : ''}: ${title}`,
        detail: `"${title}" is due ${when(due)}.`,
      })
    }
    return out
  }

  const late = now - due
  if (late > STALE_AFTER) return []
  const days = Math.floor(late / DAY)          // 0 on the day it goes overdue, then 1, 2, …
  out.push({
    kind: `overdue_${days}|${d.due_at}`, to: 'editor',
    message: days === 0 ? `Overdue: ${title}` : `Still overdue (${days} day${days === 1 ? '' : 's'} late): ${title}`,
    detail: `"${title}" was due ${when(due)}. Please send it for review as soon as you can.`,
  })
  if (late >= 2 * DAY) {
    out.push({
      kind: `admin_overdue|${d.due_at}`, to: 'admins',
      message: `Overdue 2+ days: ${title} (${d.editor_name || 'editor'})`,
      detail: `"${title}" was due ${when(due)} and ${d.editor_name || 'the editor'} hasn't sent it for review yet.`,
    })
  }
  return out
}

/** Records the reminder; true only the first time (so it is sent at most once). */
async function claimReminder(deadlineId: string, kind: string): Promise<boolean> {
  const rows = await dbQuery<{ deadline_id: string }>(
    'INSERT OR IGNORE INTO deadline_reminders (deadline_id, kind, sent_at) VALUES (?, ?, ?) RETURNING deadline_id',
    [deadlineId, kind, nowIso()])
  return rows.length === 1
}

async function notifyAll(recipients: string[], projectId: string, message: string, detail: string, role: 'admin' | 'team') {
  const now = nowIso()
  for (const r of recipients) {
    try {
      await dbExecute(
        'INSERT INTO notifications (id, recipient_id, project_id, type, message, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
        [newId(), r, projectId, 'deadline_due', message, now])
    } catch (e) { console.error('[reminders] notification failed', e) }
  }
  await sendEmailNotifications(recipients.map((recipientId) => ({
    recipientId, subject: message, text: `${detail}\n\nView it here: ${projectUrl(projectId, role)}`,
  })))
}

/** One pass: finds what's due, sends each reminder once. */
export async function sendDeadlineReminders(nowMs = Date.now()) {
  const soon = new Date(nowMs + DAY).toISOString()
  const oldest = new Date(nowMs - STALE_AFTER).toISOString()
  const rows = await dbQuery<Omit<ReminderInput, 'delivered'> & { delivered: number }>(
    `SELECT d.id AS deadline_id, d.project_id, pr.title AS project_title, d.team_member_id AS editor_id,
            pf.full_name AS editor_name, d.due_at, d.created_at, d.status, pr.status AS project_status,
            EXISTS (SELECT 1 FROM status_history h WHERE h.project_id = d.project_id
                    AND h.new_status = 'in_review' AND h.created_at >= d.created_at) AS delivered
       FROM deadlines d
       JOIN projects pr ON pr.id = d.project_id
       JOIN profiles pf ON pf.id = d.team_member_id AND pf.disabled = 0
       JOIN project_assignments a ON a.id = d.assignment_id
      WHERE d.status = 'pending' AND d.due_at <= ? AND d.due_at >= ?
      ORDER BY d.due_at`,
    [soon, oldest])

  let admins: string[] | null = null
  const sent: { deadline_id: string; kind: string }[] = []
  for (const row of rows) {
    const d = { ...row, delivered: !!row.delivered }
    for (const r of remindersFor(d, nowMs)) {
      if (!(await claimReminder(d.deadline_id, r.kind))) continue
      if (r.to === 'editor') {
        await notifyAll([d.editor_id], d.project_id, r.message, r.detail, 'team')
      } else {
        admins ??= (await dbQuery<{ id: string }>("SELECT id FROM profiles WHERE role = 'admin' AND disabled = 0")).map((a) => a.id)
        await notifyAll(admins, d.project_id, r.message, r.detail, 'admin')
      }
      sent.push({ deadline_id: d.deadline_id, kind: r.kind.split('|')[0] })
    }
  }
  return { checked: rows.length, sent }
}

/** GET /api/deadlines/reminders — Vercel cron (hourly). */
export async function handleDeadlineReminders(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET
  const localDev = !!process.env.LOCAL_DB_FILE
  if (!(secret && req.headers.authorization === `Bearer ${secret}`) && !localDev) { res.status(401).json({ error: 'Unauthorized' }); return }
  try {
    res.json({ ok: true, ...(await sendDeadlineReminders()) })
  } catch (e: any) {
    console.error('[reminders] failed', e)
    const msg = String(e?.message ?? '')
    if (/no such table/i.test(msg)) { res.status(500).json({ error: 'Deadline reminders need database migration 030 — run db/migrations/030_deadline_reminders.sql' }); return }
    res.status(500).json({ error: 'reminders failed' })
  }
}
