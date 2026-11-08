// Client Care calculations — pure functions, no database access, so every
// rule is unit-tested (compute.test.ts). data.ts loads rows; this file turns
// them into alerts, health, stats and output rates.

import { CARE_CONFIG, CLIENT_VISIBLE_STATUSES, type CareConfig, type RenewalStatus } from './config.js'
import { overdueClientSteps, type PlanItem } from './plans.js'

const DAY = 86_400_000

// ── Input rows (as loaded by data.ts) ───────────────────────────────────────

export interface HistoryRow { old_status: string | null; new_status: string; created_at: string }
export interface DeadlineRow { team_member_id: string; due_at: string; status: 'pending' | 'met' | 'missed'; created_at: string }

export interface ProjectInput {
  id: string
  title: string
  status: string
  created_at: string
  updated_at: string
  client_revision_count: number
  /** status_history rows for this project, oldest first. */
  history: HistoryRow[]
  /** Upload time of the first deliverable, if any (fallback delivery date). */
  first_deliverable_at: string | null
  deadlines: DeadlineRow[]
  editor_ids: string[]
  /** The client has uploaded footage for this request. */
  has_footage?: boolean
}

export interface CareFields {
  contract_start: string | null
  contract_end: string | null
  videos_included: number | null
  renewal_status: RenewalStatus
  care_notes: string | null
  miro_url: string | null
}

export interface ClientInput {
  id: string
  full_name: string
  email: string
  phone: string | null
  client_id_label: string | null
  plan_name: string | null
  /** The current contract (migration 013); its dates/videos/renewal are also
   *  mirrored into `care` so the rules below read them in one place. */
  contract?: { id: string; number: number; package: 'editing_only' | 'full_package'; start_date: string; end_date: string } | null
  care: CareFields | null
  /** Production plan of the current contract, auto ticks already applied. */
  plan?: PlanItem[]
  last_contact_at: string | null
  projects: ProjectInput[]
}

// ── Derived project facts ───────────────────────────────────────────────────

export interface ProjectFacts {
  id: string
  title: string
  status: string
  created_at: string
  /** First version sent to the client. */
  delivered_at: string | null
  /** true when delivered_at had to be estimated (no recorded transition). */
  delivered_estimated: boolean
  approved_at: string | null
  /** Request created → first version sent, in days. */
  turnaround_days: number | null
  revisions: number
  /** When it entered "in progress" (only while it is in progress). */
  in_progress_since: string | null
  /** Editor deadline outcome: true met, false missed, null not decided yet. */
  on_time: boolean | null
  /** Pending editor deadline due today (UTC), if any. */
  due_today: boolean
  editor_ids: string[]
}

const ms = (s: string) => new Date(s).getTime()

/** Was an editor deadline met? The admin's recorded outcome when resolved;
 *  otherwise derived — the editor's first handoff ("in review") before the due
 *  time means met; due time passed without a handoff means missed; null = not
 *  decided yet. */
export function deadlineOutcome(deadline: DeadlineRow, history: HistoryRow[], now: number): boolean | null {
  if (deadline.status === 'met') return true
  if (deadline.status === 'missed') return false
  const handoff = history.find((h) => h.new_status === 'in_review' && ms(h.created_at) >= ms(deadline.created_at))
  if (handoff) return ms(handoff.created_at) <= ms(deadline.due_at)
  return now > ms(deadline.due_at) ? false : null
}
const isClientVisible = (s: string) => (CLIENT_VISIBLE_STATUSES as readonly string[]).includes(s)

/** Same calendar day in UTC. */
const sameUtcDay = (a: number, b: number) => new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10)

export function projectFacts(p: ProjectInput, now: number): ProjectFacts {
  // Delivery = first REAL transition into a client-visible status. Rows with
  // old_status NULL are the migration-003 backfill (stamped with the project's
  // last update), not a real delivery moment.
  const realDelivery = p.history.find((h) => h.old_status !== null && isClientVisible(h.new_status))
  const everVisible = isClientVisible(p.status) || p.history.some((h) => isClientVisible(h.new_status))
  let delivered_at: string | null = realDelivery?.created_at ?? null
  let delivered_estimated = false
  if (!delivered_at && everVisible) {
    delivered_at = p.first_deliverable_at ?? p.history.find((h) => isClientVisible(h.new_status))?.created_at ?? p.updated_at
    delivered_estimated = true
  }

  const approved = p.history.find((h) => h.new_status === 'client_approved')
  const approved_at = approved?.created_at ?? (p.status === 'client_approved' ? p.updated_at : null)

  let in_progress_since: string | null = null
  if (p.status === 'in_progress') {
    const entered = [...p.history].reverse().find((h) => h.new_status === 'in_progress')
    in_progress_since = entered?.created_at ?? p.updated_at
  }

  const deadline = p.deadlines[0] ?? null
  const on_time = deadline ? deadlineOutcome(deadline, p.history, now) : null

  const due_today = p.deadlines.some((d) => d.status === 'pending' && sameUtcDay(ms(d.due_at), now))
    && !['client_reviewing', 'client_approved', 'revision_requested'].includes(p.status)

  return {
    id: p.id,
    title: p.title,
    status: p.status,
    created_at: p.created_at,
    delivered_at,
    delivered_estimated,
    approved_at,
    turnaround_days: delivered_at ? round1((ms(delivered_at) - ms(p.created_at)) / DAY) : null,
    revisions: p.client_revision_count ?? 0,
    in_progress_since,
    on_time,
    due_today,
    editor_ids: p.editor_ids,
  }
}

// ── Alerts + health ─────────────────────────────────────────────────────────

export type AlertType = 'no_brief' | 'stuck_in_progress' | 'due_today' | 'no_contact' | 'plan_overdue'
export interface Alert { type: AlertType; message: string; project_id?: string }
export type Health = 'at_risk' | 'needs_attention' | 'healthy'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const round1 = (n: number) => Math.round(n * 10) / 10
const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null)
const wholeDays = (fromMs: number, now: number) => Math.floor((now - fromMs) / DAY)

/** Whole days from today (UTC) until a YYYY-MM-DD date; negative = past. */
export function daysUntilDate(date: string, now: number): number {
  const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate())
  const [y, m, d] = date.slice(0, 10).split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - today) / DAY)
}

export function computeAlerts(client: ClientInput, facts: ProjectFacts[], now: number, cfg: CareConfig = CARE_CONFIG): Alert[] {
  const alerts: Alert[] = []

  const lastBrief = maxMs(client.projects.map((p) => p.created_at))
  if (lastBrief == null) alerts.push({ type: 'no_brief', message: 'No video request yet' })
  else if (now - lastBrief >= cfg.alerts.noBriefDays * DAY) {
    alerts.push({ type: 'no_brief', message: `No new video request for ${plural(wholeDays(lastBrief, now), 'day')}` })
  }

  for (const f of facts) {
    if (f.in_progress_since && now - ms(f.in_progress_since) >= cfg.alerts.inProgressStuckDays * DAY) {
      alerts.push({ type: 'stuck_in_progress', project_id: f.id, message: `"${f.title}" has been in progress for ${plural(wholeDays(ms(f.in_progress_since), now), 'day')}` })
    }
  }
  for (const f of facts) {
    if (f.due_today) alerts.push({ type: 'due_today', project_id: f.id, message: `"${f.title}" is due from the editor today` })
  }

  // Client plan steps past their date (auto ticks were applied when loading,
  // so uploaded footage never shows as overdue).
  for (const s of overdueClientSteps(client.plan ?? [], now)) {
    alerts.push({ type: 'plan_overdue', message: `"${s.title}" overdue by ${plural(s.days_late, 'day')}` })
  }

  if (client.last_contact_at == null) alerts.push({ type: 'no_contact', message: 'No contact logged yet' })
  else if (now - ms(client.last_contact_at) >= cfg.alerts.noContactDays * DAY) {
    alerts.push({ type: 'no_contact', message: `No contact for ${plural(wholeDays(ms(client.last_contact_at), now), 'day')}` })
  }
  return alerts
}

export function computeHealth(
  client: ClientInput, facts: ProjectFacts[], alerts: Alert[], now: number, cfg: CareConfig = CARE_CONFIG,
): { health: Health; reasons: string[] } {
  const atRisk: string[] = []
  const contactMs = client.last_contact_at ? ms(client.last_contact_at) : null
  if (contactMs == null) atRisk.push('No contact logged yet')
  else if (now - contactMs >= cfg.health.atRiskNoContactDays * DAY) atRisk.push(`No contact for ${plural(wholeDays(contactMs, now), 'day')}`)

  for (const f of facts) {
    if (f.in_progress_since && now - ms(f.in_progress_since) >= cfg.health.atRiskStuckDays * DAY) {
      // Same wording as the matching alert, so the two de-duplicate below.
      atRisk.push(`"${f.title}" has been in progress for ${plural(wholeDays(ms(f.in_progress_since), now), 'day')}`)
    }
  }

  const daysLeft = client.care?.contract_end ? daysUntilDate(client.care.contract_end, now) : null
  const renewal = client.care?.renewal_status ?? 'not_discussed'
  if (daysLeft != null && daysLeft <= cfg.health.atRiskContractDays && renewal === 'not_discussed') {
    atRisk.push(`${contractPhrase(daysLeft)} and renewal hasn't been discussed`)
  }
  const attention = alerts.map((a) => a.message)
  // A renewed contract already has its successor — no "ends in X days" alert.
  if (daysLeft != null && daysLeft <= cfg.health.attentionContractDays && renewal !== 'renewed') attention.push(contractPhrase(daysLeft))

  // At risk: the at-risk reasons first, then every other active alert, so the
  // card and the "Text today" list show the full picture without repeats.
  if (atRisk.length) return { health: 'at_risk', reasons: [...new Set([...atRisk, ...attention])].filter((r) => !isContractPhraseCoveredBy(r, atRisk)) }
  if (attention.length) return { health: 'needs_attention', reasons: attention }

  return { health: 'healthy', reasons: ['No alerts — everything is on track'] }
}

/** "Contract ends in 10 days" is redundant next to "Contract ends in 10 days
 *  and renewal hasn't been discussed". */
function isContractPhraseCoveredBy(reason: string, atRisk: string[]): boolean {
  return reason.startsWith('Contract ') && atRisk.some((r) => r !== reason && r.startsWith(reason))
}

function contractPhrase(daysLeft: number): string {
  if (daysLeft < 0) return `Contract ended ${plural(-daysLeft, 'day')} ago`
  if (daysLeft === 0) return 'Contract ends today'
  return `Contract ends in ${plural(daysLeft, 'day')}`
}

function maxMs(dates: (string | null)[]): number | null {
  const v = dates.filter(Boolean).map((d) => ms(d as string))
  return v.length ? Math.max(...v) : null
}

// ── Stats ───────────────────────────────────────────────────────────────────

export interface ClientStats {
  videos_delivered_this_month: number
  videos_delivered_total: number
  /** Delivered between contract start and contract end (null without dates). */
  videos_delivered_in_contract: number | null
  videos_included: number | null
  avg_turnaround_days: number | null
  avg_revisions_per_video: number | null
  days_since_last_brief: number | null
  days_since_last_contact: number | null
  days_left_on_contract: number | null
  /** Some delivery dates were estimated (videos older than the status history). */
  includes_estimates: boolean
}

export function computeStats(client: ClientInput, facts: ProjectFacts[], now: number): ClientStats {
  const delivered = facts.filter((f) => f.delivered_at)
  const monthKey = new Date(now).toISOString().slice(0, 7)
  const care = client.care
  let inContract: number | null = null
  if (care?.contract_start && care?.contract_end) {
    const start = ms(`${care.contract_start.slice(0, 10)}T00:00:00Z`)
    const end = ms(`${care.contract_end.slice(0, 10)}T23:59:59Z`)
    inContract = delivered.filter((f) => ms(f.delivered_at!) >= start && ms(f.delivered_at!) <= end).length
  }
  const lastBrief = maxMs(client.projects.map((p) => p.created_at))
  return {
    videos_delivered_this_month: delivered.filter((f) => f.delivered_at!.slice(0, 7) === monthKey).length,
    videos_delivered_total: delivered.length,
    videos_delivered_in_contract: inContract,
    videos_included: care?.videos_included ?? null,
    avg_turnaround_days: avg(delivered.map((f) => f.turnaround_days!).filter((n) => n != null)),
    avg_revisions_per_video: avg(delivered.map((f) => f.revisions)),
    days_since_last_brief: lastBrief == null ? null : wholeDays(lastBrief, now),
    days_since_last_contact: client.last_contact_at ? wholeDays(ms(client.last_contact_at), now) : null,
    days_left_on_contract: care?.contract_end ? daysUntilDate(care.contract_end, now) : null,
    includes_estimates: delivered.some((f) => f.delivered_estimated),
  }
}

// ── Output rate ─────────────────────────────────────────────────────────────

export interface OutputRate {
  window_days: number
  delivered: number
  per_day: number
  per_week: number
  avg_turnaround_days: number | null
  /** % of decided editor deadlines (in the window) that were met. */
  on_time_pct: number | null
  deadlines_met: number
  deadlines_missed: number
}

export function computeOutputRate(facts: ProjectFacts[], deadlinesDue: { on_time: boolean | null; due_at: string }[], now: number, cfg: CareConfig = CARE_CONFIG): OutputRate {
  const windowDays = cfg.output.windowDays
  const from = now - windowDays * DAY
  const delivered = facts.filter((f) => f.delivered_at && ms(f.delivered_at) >= from && ms(f.delivered_at) <= now)
  const decided = deadlinesDue.filter((d) => ms(d.due_at) >= from && ms(d.due_at) <= now && d.on_time !== null)
  const met = decided.filter((d) => d.on_time).length
  return {
    window_days: windowDays,
    delivered: delivered.length,
    per_day: round1(delivered.length / windowDays),
    per_week: round1((delivered.length / windowDays) * 7),
    avg_turnaround_days: avg(delivered.map((f) => f.turnaround_days!).filter((n) => n != null)),
    on_time_pct: decided.length ? Math.round((met / decided.length) * 100) : null,
    deadlines_met: met,
    deadlines_missed: decided.length - met,
  }
}

// ── Everything for one client ───────────────────────────────────────────────

export interface ClientCare {
  client_id: string
  name: string
  last_contact_at: string | null
  health: Health
  reasons: string[]
  alerts: Alert[]
  stats: ClientStats
  output: OutputRate
  facts: ProjectFacts[]
  /** Each project's editor deadline and its outcome (for output rates). */
  deadline_outcomes: { due_at: string; on_time: boolean | null }[]
}

export function evaluateClient(client: ClientInput, now: number, cfg: CareConfig = CARE_CONFIG): ClientCare {
  const facts = client.projects.map((p) => projectFacts(p, now))
  const alerts = computeAlerts(client, facts, now, cfg)
  const { health, reasons } = computeHealth(client, facts, alerts, now, cfg)
  const deadline_outcomes = client.projects.flatMap((p, i) => p.deadlines.slice(0, 1).map((d) => ({ due_at: d.due_at, on_time: facts[i].on_time })))
  return {
    client_id: client.id,
    name: client.full_name,
    last_contact_at: client.last_contact_at,
    health,
    reasons,
    alerts,
    stats: computeStats(client, facts, now),
    output: computeOutputRate(facts, deadline_outcomes, now, cfg),
    facts,
    deadline_outcomes,
  }
}

const HEALTH_ORDER: Record<Health, number> = { at_risk: 0, needs_attention: 1, healthy: 2 }

/** Most urgent first: at risk before needs attention, then more alerts, then
 *  longest without contact (never contacted counts as longest). */
export function urgencyCompare(a: ClientCare, b: ClientCare): number {
  return HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health]
    || b.alerts.length - a.alerts.length
    || (b.stats.days_since_last_contact ?? Infinity) - (a.stats.days_since_last_contact ?? Infinity)
    || a.name.localeCompare(b.name)
}
