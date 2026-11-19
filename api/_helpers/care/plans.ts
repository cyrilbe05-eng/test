// Production plans (migration 014) — pure rules + database helpers.
//
// ONE place decides auto ticks (applyAutoTicks) and overdue client steps
// (overdueClientSteps). data.loadClients runs them for every client it loads,
// so the client dashboard, the copywriter page and Client Care alerts always
// agree: a step is never "overdue" when its footage is actually uploaded.

import { dbQuery, dbQueryIn, dbExecute, newId } from '../db.js'
import { PLAN_TEMPLATE } from './config.js'

export type PlanOwner = 'pingu' | 'client' | 'both'
export type AutoRule = 'none' | 'footage_uploaded' | 'all_delivered'
export const PLAN_OWNERS: PlanOwner[] = ['pingu', 'client', 'both']
export const AUTO_RULES: AutoRule[] = ['none', 'footage_uploaded', 'all_delivered']

export interface PlanItem {
  id: string
  contract_id: string
  client_id: string
  date: string            // YYYY-MM-DD
  title: string
  owner: PlanOwner
  done: number            // 0/1
  done_at: string | null
  done_by: string | null  // profile id, or 'auto'
  auto_rule: AutoRule
  sort_order: number
}

const DAY = 86_400_000
const toMs = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const today = (now: number) => toDate(now)

/** The standard plan, dated from `startDate`. */
export function planFromTemplate(startDate: string, template = PLAN_TEMPLATE) {
  let ms = toMs(startDate)
  return template.map((t, i) => {
    ms += t.daysAfterPrevious * DAY
    return { date: toDate(ms), title: t.title, owner: t.owner, auto_rule: t.autoRule, sort_order: i }
  })
}

export const byOrder = (a: Pick<PlanItem, 'sort_order' | 'date'>, b: Pick<PlanItem, 'sort_order' | 'date'>) =>
  a.sort_order - b.sort_order || a.date.localeCompare(b.date)

/**
 * Which not-yet-done steps tick themselves now. Only steps nobody touched by
 * hand (done_by null) are eligible — if someone unticks a step, it stays so.
 *
 *  footage_uploaded: the client uploaded footage after the previous step
 *    (its tick time, else the start of its date). Each upload counts for one
 *    step only, earliest step first.
 *  all_delivered: delivered videos in the contract reached videos_included.
 *
 * `uploads` = client footage upload times; `deliveries` = first-version-sent
 * times of this contract's videos (ascending).
 */
export function applyAutoTicks(
  items: PlanItem[], uploads: string[], deliveries: string[], videosIncluded: number | null, now: number,
): { id: string; done_at: string }[] {
  const sorted = [...items].sort(byOrder)
  const ups = [...uploads].sort()
  const used = new Set<string>(sorted.filter((i) => i.done && i.done_by === 'auto' && i.auto_rule === 'footage_uploaded' && i.done_at).map((i) => i.done_at!))
  const nowIso = new Date(now).toISOString()
  const out: { id: string; done_at: string }[] = []
  sorted.forEach((item, idx) => {
    if (item.done || item.done_by) return
    if (item.auto_rule === 'footage_uploaded') {
      const prev = sorted[idx - 1]
      const after = prev ? (prev.done && prev.done_at ? prev.done_at : `${prev.date}T00:00:00.000Z`) : ''
      const hit = ups.find((u) => u > after && u <= nowIso && !used.has(u))
      if (hit) { used.add(hit); out.push({ id: item.id, done_at: hit }) }
    } else if (item.auto_rule === 'all_delivered') {
      if (videosIncluded != null && videosIncluded > 0 && deliveries.length >= videosIncluded) {
        out.push({ id: item.id, done_at: deliveries[videosIncluded - 1] })
      }
    }
  })
  return out
}

/** Client steps (owner client or both) that are past their date and not done. */
export function overdueClientSteps(items: PlanItem[], now: number): { id: string; title: string; date: string; days_late: number }[] {
  const t = today(now)
  return [...items].sort(byOrder)
    .filter((i) => !i.done && (i.owner === 'client' || i.owner === 'both') && i.date < t)
    .map((i) => ({ id: i.id, title: i.title, date: i.date, days_late: Math.round((toMs(t) - toMs(i.date)) / DAY) }))
}

/** Display state per step: done, overdue (client steps only), next (first
 *  open step), today, or upcoming. */
export function planWithState(items: PlanItem[], now: number) {
  const t = today(now)
  const sorted = [...items].sort(byOrder)
  const nextId = sorted.find((i) => !i.done)?.id ?? null
  return sorted.map((i) => ({
    ...i,
    done: !!i.done,
    state: i.done ? 'done'
      : (i.owner !== 'pingu' && i.date < t) ? 'overdue'
        : i.id === nextId ? 'next'
          : i.date === t ? 'today'
            : i.date < t ? 'late' : 'upcoming',
  }))
}

// ── Database ────────────────────────────────────────────────────────────────

export async function loadPlanItems(contractIds: string[]): Promise<Map<string, PlanItem[]>> {
  const map = new Map<string, PlanItem[]>()
  if (!contractIds.length) return map
  try {
    // Sliced under D1's 100-parameter cap; order restored below.
    const rows = (await dbQueryIn<PlanItem>(
      (ph) => `SELECT id, contract_id, client_id, date, title, owner, done, done_at, done_by, auto_rule, sort_order
       FROM production_plan_items WHERE contract_id IN (${ph})`, contractIds))
      .sort((a, b) => (a.sort_order - b.sort_order) || String(a.date).localeCompare(String(b.date)))
    for (const r of rows) (map.get(r.contract_id) ?? map.set(r.contract_id, []).get(r.contract_id)!).push(r)
  } catch (e: any) {
    console.warn('[care] production plans unavailable:', e?.message)
  }
  return map
}

/** Persist auto ticks (only flips untouched, not-done steps). */
export async function saveAutoTicks(ticks: { id: string; done_at: string }[]) {
  for (const t of ticks) {
    await dbExecute(
      "UPDATE production_plan_items SET done = 1, done_at = ?, done_by = 'auto' WHERE id = ? AND done = 0 AND done_by IS NULL",
      [t.done_at, t.id],
    )
  }
}

export async function createPlanFromTemplate(contract: { id: string; client_id: string }, startDate: string) {
  const [existing] = await dbQuery<{ n: number }>('SELECT COUNT(*) AS n FROM production_plan_items WHERE contract_id = ?', [contract.id])
  if (existing?.n) throw Object.assign(new Error('This contract already has a plan'), { status: 409 })
  for (const step of planFromTemplate(startDate)) {
    await dbExecute(
      `INSERT INTO production_plan_items (id, contract_id, client_id, date, title, owner, auto_rule, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId(), contract.id, contract.client_id, step.date, step.title, step.owner, step.auto_rule, step.sort_order],
    )
  }
}

// ── Copywriter ↔ client links ───────────────────────────────────────────────

export async function loadAssignments(clientId?: string): Promise<{ client_id: string; team_member_id: string; name: string }[]> {
  try {
    return await dbQuery(
      `SELECT a.client_id, a.team_member_id, p.full_name AS name
       FROM client_team_assignments a JOIN profiles p ON p.id = a.team_member_id
       ${clientId ? 'WHERE a.client_id = ?' : ''} ORDER BY p.full_name`, clientId ? [clientId] : [])
  } catch {
    return []
  }
}

export async function isAssigned(clientId: string, teamMemberId: string): Promise<boolean> {
  try {
    const [row] = await dbQuery<{ n: number }>(
      'SELECT COUNT(*) AS n FROM client_team_assignments WHERE client_id = ? AND team_member_id = ?', [clientId, teamMemberId])
    return !!row?.n
  } catch {
    return false
  }
}

/** Replace a client's copywriters (only active copywriters are accepted). */
export async function setClientCopywriters(clientId: string, body: unknown) {
  const ids = (body as any)?.team_member_ids
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) {
    throw Object.assign(new Error('team_member_ids must be a list'), { status: 400 })
  }
  const unique = [...new Set(ids as string[])]
  if (unique.length) {
    const ok = await dbQuery<{ id: string }>(
      `SELECT id FROM profiles WHERE role = 'team' AND team_role = 'copywriter' AND disabled = 0
       AND id IN (${unique.map(() => '?').join(',')})`, unique)
    if (ok.length !== unique.length) throw Object.assign(new Error('Only active copywriters can be assigned'), { status: 400 })
  }
  await dbExecute('DELETE FROM client_team_assignments WHERE client_id = ?', [clientId])
  for (const id of unique) {
    await dbExecute('INSERT INTO client_team_assignments (client_id, team_member_id) VALUES (?, ?)', [clientId, id])
  }
}
