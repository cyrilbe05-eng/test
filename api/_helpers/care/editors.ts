// Editor performance (admin-only):
//
//   GET /api/admin/editors/performance?days=30|90|365|all   (default 90)
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
  clients: ClientInput[], editors: EditorInfo[], categoryCounts: CategoryCount[], now: number, days: number | null,
) {
  const from = days == null ? -Infinity : now - days * DAY
  const inWindow = (iso: string | null) => !!iso && new Date(iso).getTime() >= from && new Date(iso).getTime() <= now
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

async function handlePerformance(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    await requireCareAdmin(req)
    const key = String((req.query as any)?.days ?? '90') as keyof typeof PERIODS
    if (!(key in PERIODS)) { res.status(400).json({ error: 'days must be 30, 90, 365 or all' }); return }
    const days = PERIODS[key]
    const now = Date.now()
    await processRevisionsSafely()

    const since = days == null ? null : new Date(now - days * DAY).toISOString()
    const [clients, editors, categoryCounts] = await Promise.all([
      loadClients(undefined, { includeDisabled: true }),
      dbQuery<EditorInfo>("SELECT id, full_name, team_role, disabled FROM profiles WHERE role = 'team'"),
      dbQuery<CategoryCount>(
        `SELECT editor_id, client_id, category, COUNT(*) AS n FROM revision_entries
         WHERE editor_id IS NOT NULL AND processed_at IS NOT NULL AND processed_at NOT LIKE 'claim:%'
         ${since ? 'AND created_at >= ?' : ''}
         GROUP BY editor_id, client_id, category`,
        since ? [since] : [],
      ).catch(() => [] as CategoryCount[]),
    ])

    const rows = aggregateEditorPerformance(clients, editors, categoryCounts, now, days)
    res.json({
      generated_at: new Date(now).toISOString(),
      period: key,
      categories: REVISION_CATEGORY_KEYS.map((k) => ({ key: k, label: REVISION_CATEGORIES[k].label })),
      editors: rows,
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
