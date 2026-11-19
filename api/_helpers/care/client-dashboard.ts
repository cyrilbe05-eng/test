// Client dashboard (the client's own data only). Mounted under /api/client.
//
//   GET  /api/client/dashboard                 everything for the home page
//   POST /api/client/plan-items/:id/done       { done?: boolean } — client steps only
//   /api/client/onboarding...                  see onboarding.ts
//
// Built from the same loadClients() as Client Care and the copywriter page,
// so plan auto ticks / overdue steps are identical everywhere.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../auth.js'
import { dbQuery, dbExecute, nowIso } from '../db.js'
import { sendError, processRevisionsSafely } from './access.js'
import { loadClients } from './data.js'
import { daysUntilDate, type ClientInput } from './compute.js'
import { overdueClientSteps, planWithState } from './plans.js'
import { loadBrief } from './brief.js'
import { handleClientOnboarding } from './onboarding.js'

const DAY = 86_400_000
const toMs = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))

export type NeedItem =
  | { type: 'plan_step'; id: string; title: string; date: string; days_late: number }
  | { type: 'review'; project_id: string; title: string }
  | { type: 'footage'; project_id: string; title: string }

/** Pure: the whole dashboard for one client (unit-tested). */
export function buildDashboard(client: ClientInput, now: number) {
  const k = client.contract ?? null
  let contract = null
  if (k) {
    const total = Math.round((toMs(k.end_date) - toMs(k.start_date)) / DAY) + 1
    const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate())
    const day = Math.min(total, Math.max(1, Math.round((today - toMs(k.start_date)) / DAY) + 1))
    contract = {
      number: k.number,
      package: k.package,
      start_date: k.start_date,
      end_date: k.end_date,
      day,
      total_days: total,
      days_left: Math.max(0, daysUntilDate(k.end_date, now)),
      progress: Math.round((day / total) * 100),
    }
  }

  const plan = client.plan ?? []
  const needs: NeedItem[] = [
    ...overdueClientSteps(plan, now).map((s) => ({ type: 'plan_step' as const, id: s.id, title: s.title, date: s.date, days_late: s.days_late })),
    ...client.projects.filter((p) => p.status === 'client_reviewing')
      .map((p) => ({ type: 'review' as const, project_id: p.id, title: p.title })),
    ...client.projects.filter((p) => (p.status === 'pending_assignment' || p.status === 'in_progress') && !(p.has_upload ?? p.has_footage))
      .map((p) => ({ type: 'footage' as const, project_id: p.id, title: p.title })),
  ]

  return {
    name: client.full_name,
    // Onboarding opens before the dashboard until it's done (once there is
    // a contract: the package decides which questions they get).
    needs_onboarding: !!k && (client.onboarding?.status ?? 'not_started') !== 'done',
    contract,
    needs,
    plan: planWithState(plan, now).map((i) => ({
      id: i.id, date: i.date, title: i.title, owner: i.owner, done: i.done, state: i.state,
      can_tick: i.owner !== 'pingu',
    })),
  }
}

async function requireClient(req: VercelRequest) {
  const { profile } = await requireAuth(req)
  if (profile.role !== 'client') throw Object.assign(new Error('Forbidden'), { status: 403 })
  return profile
}

async function dashboardFor(clientId: string) {
  await processRevisionsSafely(clientId)
  const [client] = await loadClients(clientId)
  if (!client) throw Object.assign(new Error('Not found'), { status: 404 })
  // Scripts on their calendar (theirs, or written for them) that aren't a
  // video yet: Home shows them with an Upload button. Guarded.
  let scripts: { id: string; title: string; date: string; script: string | null; caption: string | null; comments: string | null; inspiration_url: string | null }[] = []
  try {
    scripts = await dbQuery(
      `SELECT e.id, e.title, e.date, e.script, e.caption, e.comments, e.inspiration_url
       FROM calendar_events e
       WHERE e.project_id IS NULL AND COALESCE(e.posted, 0) = 0 AND TRIM(COALESCE(e.script, '')) <> ''
         AND (e.owner_id = ? OR EXISTS (SELECT 1 FROM calendar_event_participants c
               WHERE c.event_id = e.id AND c.profile_id = ? AND c.role = 'client'))
       ORDER BY e.date, e.created_at`, [clientId, clientId])
  } catch { /* pre-migration */ }
  // Only NEW client accounts (migration 027) are held on the questionnaire;
  // existing clients see their Home as usual. Missing column = nobody held.
  let required = false
  try {
    const [p] = await dbQuery<{ onboarding_required: number | null }>('SELECT onboarding_required FROM profiles WHERE id = ?', [clientId])
    required = p?.onboarding_required === 1
  } catch { /* pre-migration */ }
  const dash = buildDashboard(client, Date.now())
  // Miro board, SOPs, style — same brief the copywriter sees.
  return { ...dash, needs_onboarding: dash.needs_onboarding && required, scripts, ...(await loadBrief(clientId)) }
}

/** Router entry. `rest` = path after /api/client. */
export async function handleClientRoute(req: VercelRequest, res: VercelResponse, rest: string[]) {
  try {
    const profile = await requireClient(req)

    if (rest.length === 1 && rest[0] === 'dashboard') {
      if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
      res.json(await dashboardFor(profile.id)); return
    }

    if (rest[0] === 'onboarding') return await handleClientOnboarding(req, res, profile.id, rest.slice(1))

    if (rest.length === 3 && rest[0] === 'plan-items' && rest[2] === 'done') {
      if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
      const [item] = await dbQuery<{ id: string; client_id: string; owner: string }>(
        'SELECT id, client_id, owner FROM production_plan_items WHERE id = ?', [rest[1]])
      // Their own plan only, and only steps that are theirs (client / both).
      if (!item || item.client_id !== profile.id) { res.status(404).json({ error: 'Step not found' }); return }
      if (item.owner === 'pingu') { res.status(403).json({ error: 'This step is ticked by Pingu' }); return }
      const done = (req.body ?? {}).done ?? true
      if (typeof done !== 'boolean') { res.status(400).json({ error: 'done must be true or false' }); return }
      await dbExecute('UPDATE production_plan_items SET done = ?, done_at = ?, done_by = ? WHERE id = ?',
        [done ? 1 : 0, done ? nowIso() : null, profile.id, item.id])
      res.json(await dashboardFor(profile.id)); return
    }

    res.status(404).json({ error: 'Not found' })
  } catch (e) {
    sendError(res, e)
  }
}
