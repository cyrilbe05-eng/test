// Editor performance (admin-only):
//
//   GET /api/admin/editors/performance?days=30|90|365|all   (default 90)
//   GET /api/admin/editors/performance?from=ISO&to=ISO     (any range — Analytics period bar)
//
// Per editor, and per editor × client:
//   videos              delivered videos (first version sent to the client in
//                       the period) the editor was assigned to
//   revisions_per_video client revision rounds on those videos
//   avg_turnaround_days request created → first version sent
//   on_time_pct         the editor's own deadlines met (due in the period)
//   categories          what the client revision notes on their videos were
//                       about (from Client Care's revision entries)
// Same definitions as Client Care, so the numbers agree across pages.
//
// client_split — per client: delivered videos in the period and the share
// edited by each editor (adds up to 100%; shared videos split evenly).

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { dbQuery } from '../db.js'
import { REVISION_CATEGORIES, REVISION_CATEGORY_KEYS, type RevisionCategory } from './config.js'
import { projectFacts, deadlineOutcome, type ClientInput } from './compute.js'
import { loadClients } from './data.js'
import { requireCareAdmin, sendError, processRevisionsSafely } from './access.js'

const DAY = 86_400_000
export const PERIODS = { '30': 30, '90': 90, '365': 365, all: null } as const

export interface EditorInfo { id: string; full_name: string; team_role: string | null; disabled: number }
export interface CategoryCount { editor_id: string; client_id: string; category: RevisionCategory; n: number }

interface Bucket {
  turnarounds: number[]
  revisions: number[]
  met: number
  missed: number
  categories: Partial<Record<RevisionCategory, number>>
}
const emptyBucket = (): Bucket => ({ turnarounds: [], revisions: [], met: 0, missed: 0, categories: {} })

/** A window: last N days (null = all time), or an explicit {from, to} in ms. */
export type Span = number | null | { from: number; to: number }
const bounds = (now: number, w: Span): [number, number] =>
  w == null ? [-Infinity, now] : typeof w === 'number' ? [now - w * DAY, now] : [w.from, Math.min(w.to, now)]

const round1 = (n: number) => Math.round(n * 10) / 10
const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null)

function summarise(b: Bucket) {
  const notes = Object.values(b.categories).reduce((a, n) => a + (n ?? 0), 0)
  const top = (Object.entries(b.categories) as [RevisionCategory, number][])
    .filter(([, n]) => n > 0)
    .sort((x, y) => y[1] - x[1] || REVISION_CATEGORY_KEYS.indexOf(x[0]) - REVISION_CATEGORY_KEYS.indexOf(y[0]))
    .map(([category, count]) => ({ category, count, share: notes ? Math.round((count / notes) * 100) : 0 }))
  const decided = b.met + b.missed
  return {
    videos: b.turnarounds.length,
    revisions_per_video: avg(b.revisions),
    avg_turnaround_days: avg(b.turnarounds),
    on_time_pct: decided ? Math.round((b.met / decided) * 100) : null,
    deadlines_met: b.met,
    deadlines_missed: b.missed,
    revision_notes: notes,
    top_categories: top,
  }
}

/** Pure aggregation (unit-tested). `days` null = all time. */
export function aggregateEditorPerformance(
  clients: ClientInput[], editors: EditorInfo[], categoryCounts: CategoryCount[], now: number, days: Span,
) {
  const [from, to] = bounds(now, days)
  const inWindow = (iso: string | null) => !!iso && new Date(iso).getTime() >= from && new Date(iso).getTime() <= to
  const cell = new Map<string, Bucket>()               // `${editor}|${client}`
  const get = (e: string, c: string) => cell.get(`${e}|${c}`) ?? cell.set(`${e}|${c}`, emptyBucket()).get(`${e}|${c}`)!

  for (const client of clients) {
    for (const p of client.projects) {
      const f = projectFacts(p, now)
      if (f.delivered_at && inWindow(f.delivered_at) && f.turnaround_days != null) {
        for (const e of new Set(p.editor_ids)) {
          const b = get(e, client.id)
          b.turnarounds.push(f.turnaround_days)
          b.revisions.push(f.revisions)
        }
      }
      // Each editor is judged on their own deadline for this project.
      for (const d of p.deadlines) {
        if (!inWindow(d.due_at)) continue
        const ok = deadlineOutcome(d, p.history, now)
        if (ok === true) get(d.team_member_id, client.id).met++
        else if (ok === false) get(d.team_member_id, client.id).missed++
      }
    }
  }
  for (const c of categoryCounts) {
    const b = get(c.editor_id, c.client_id)
    b.categories[c.category] = (b.categories[c.category] ?? 0) + c.n
  }

  const clientName = new Map(clients.map((c) => [c.id, c.full_name]))
  const editorIds = new Set([
    ...editors.filter((e) => e.team_role !== 'copywriter' && !e.disabled).map((e) => e.id),
    ...[...cell.keys()].map((k) => k.split('|')[0]),
  ])
  const info = new Map(editors.map((e) => [e.id, e]))

  const rows = [...editorIds].filter((id) => info.has(id)).map((id) => {
    const e = info.get(id)!
    const total = emptyBucket()
    const perClient = [...cell.entries()]
      .filter(([k]) => k.startsWith(`${id}|`))
      .map(([k, b]) => {
        const clientId = k.split('|')[1]
        total.turnarounds.push(...b.turnarounds); total.revisions.push(...b.revisions)
        total.met += b.met; total.missed += b.missed
        for (const [cat, n] of Object.entries(b.categories) as [RevisionCategory, number][]) total.categories[cat] = (total.categories[cat] ?? 0) + n
        return { client_id: clientId, name: clientName.get(clientId) ?? 'Unknown client', ...summarise(b) }
      })
      .filter((r) => r.videos > 0 || r.revision_notes > 0 || r.deadlines_met + r.deadlines_missed > 0)
      .sort((a, b) => b.videos - a.videos || a.name.localeCompare(b.name))
    return {
      editor_id: id,
      name: e.full_name,
      team_role: e.team_role ?? 'editor',
      disabled: !!e.disabled,
      totals: summarise(total),
      clients: perClient,
    }
  }).sort((a, b) => b.totals.videos - a.totals.videos || a.name.localeCompare(b.name))

  return rows
}

/** Integer percentages that always add up to exactly 100 (largest remainder). */
export function percentages(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0)
  if (!total) return values.map(() => 0)
  const raw = values.map((v) => (v / total) * 100)
  const out = raw.map(Math.floor)
  let left = 100 - out.reduce((a, b) => a + b, 0)
  raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left-- > 0) out[i]++ })
  return out
}

const MAX_LEGEND = 8   // categorical colours available; extra editors fold into "Other"

/** Per client: delivered videos in the period and who edited them, as shares
 *  that add up to 100%. A video edited by two editors counts half for each;
 *  a video with no assigned editor shows as "No editor". Pure (unit-tested). */
export function aggregateClientSplit(clients: ClientInput[], editors: EditorInfo[], now: number, days: Span) {
  const [from, to] = bounds(now, days)
  const names = new Map(editors.map((e) => [e.id, e.full_name]))
  const perClient = clients.map((client) => {
    const credit = new Map<string, number>()
    let videos = 0
    for (const p of client.projects) {
      const f = projectFacts(p, now)
      const t = f.delivered_at ? new Date(f.delivered_at).getTime() : NaN
      if (!(t >= from && t <= to)) continue
      videos++
      const eds = [...new Set(p.editor_ids)]
      if (!eds.length) credit.set('unassigned', (credit.get('unassigned') ?? 0) + 1)
      for (const e of eds) credit.set(e, (credit.get(e) ?? 0) + 1 / eds.length)
    }
    return { client, videos, credit }
  }).filter((c) => c.videos > 0)

  // Legend: editors with work in the period, in a STABLE order (by name) so
  // an editor keeps the same colour whatever the period or filter.
  const totals = new Map<string, number>()
  for (const c of perClient) for (const [k, v] of c.credit) if (k !== 'unassigned') totals.set(k, (totals.get(k) ?? 0) + v)
  let keep = [...totals.keys()]
  if (keep.length > MAX_LEGEND) keep = keep.sort((a, b) => totals.get(b)! - totals.get(a)!).slice(0, MAX_LEGEND - 1)
  const legendKeys = keep.sort((a, b) => (names.get(a) ?? a).localeCompare(names.get(b) ?? b))
  const folded = totals.size > legendKeys.length
  const legend = [
    ...legendKeys.map((k, i) => ({ key: k, name: names.get(k) ?? 'Unknown editor', color_index: i })),
    ...(folded ? [{ key: 'other', name: 'Other editors', color_index: -1 }] : []),
    ...(perClient.some((c) => c.credit.has('unassigned')) ? [{ key: 'unassigned', name: 'No editor', color_index: -1 }] : []),
  ]
  const order = new Map(legend.map((l, i) => [l.key, i]))

  const rows = perClient.map(({ client, videos, credit }) => {
    const grouped = new Map<string, number>()
    for (const [k, v] of credit) {
      const key = k === 'unassigned' || legendKeys.includes(k) ? k : 'other'
      grouped.set(key, (grouped.get(key) ?? 0) + v)
    }
    const entries = [...grouped.entries()].sort((a, b) => b[1] - a[1] || order.get(a[0])! - order.get(b[0])!)
    const shares = percentages(entries.map(([, v]) => v))
    return {
      client_id: client.id,
      name: client.full_name,
      videos,
      split: entries.map(([key, v], i) => ({ key, videos: Math.round(v * 10) / 10, share: shares[i] })),
    }
  }).sort((a, b) => b.videos - a.videos || a.name.localeCompare(b.name))

  return { legend, clients: rows }
}

async function handlePerformance(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    await requireCareAdmin(req)
    const q = req.query as Record<string, string | undefined>
    const now = Date.now()
    let key: string
    let days: Span
    if (q.from || q.to) {
      const f = Date.parse(q.from ?? ''), t = q.to ? Date.parse(q.to) : now
      if (Number.isNaN(f) || Number.isNaN(t)) { res.status(400).json({ error: 'from and to must be dates' }); return }
      key = 'custom'
      days = { from: Math.min(f, t), to: Math.max(f, t) }
    } else {
      key = String(q.days ?? '90')
      if (!(key in PERIODS)) { res.status(400).json({ error: 'days must be 30, 90, 365 or all' }); return }
      days = PERIODS[key as keyof typeof PERIODS]
    }
    await processRevisionsSafely()

    const [fromMs, toMs] = bounds(now, days)
    const since = Number.isFinite(fromMs) ? new Date(fromMs).toISOString() : null
    const until = new Date(toMs).toISOString()
    const [clients, editors, categoryCounts] = await Promise.all([
      loadClients(undefined, { includeDisabled: true }),
      dbQuery<EditorInfo>("SELECT id, full_name, team_role, disabled FROM profiles WHERE role = 'team'"),
      dbQuery<CategoryCount>(
        `SELECT editor_id, client_id, category, COUNT(*) AS n FROM revision_entries
         WHERE editor_id IS NOT NULL AND processed_at IS NOT NULL AND processed_at NOT LIKE 'claim:%'
         ${since ? 'AND created_at >= ?' : ''} AND created_at <= ?
         GROUP BY editor_id, client_id, category`,
        since ? [since, until] : [until],
      ).catch(() => [] as CategoryCount[]),
    ])

    const rows = aggregateEditorPerformance(clients, editors, categoryCounts, now, days)
    res.json({
      generated_at: new Date(now).toISOString(),
      period: key,
      categories: REVISION_CATEGORY_KEYS.map((k) => ({ key: k, label: REVISION_CATEGORIES[k].label })),
      editors: rows,
      // Client-first view: each client's videos and who edited them (%).
      client_split: aggregateClientSplit(clients, editors, now, days),
    })
  } catch (e) {
    sendError(res, e)
  }
}

/** Router entry. `rest` = path after /api/admin/editors. */
export async function handleEditorsRoute(req: VercelRequest, res: VercelResponse, rest: string[]) {
  if (rest.length === 1 && rest[0] === 'performance') return handlePerformance(req, res)
  res.status(404).json({ error: 'Not found' })
}
