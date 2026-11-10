// Production plan endpoints for copywriters (their assigned clients only)
// and full admins (all clients). Mounted under /api/team.
//
//   GET    /api/team/plans                          clients I can plan for
//   GET    /api/team/plans/:contractId              the plan (auto ticks applied)
//   POST   /api/team/plans/:contractId/from-template  { start_date? }
//   POST   /api/team/plans/:contractId/items        add a step
//   POST   /api/team/plans/:contractId/reorder      { ids: [...] }
//   PATCH  /api/team/plans/items/:id                edit / tick a step
//   DELETE /api/team/plans/items/:id
//   /api/team/clients/:id/onboarding...           see onboarding.ts
//   GET    /api/team/clients/:id/brief               Miro, SOPs, style (brief.ts)

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../auth.js'
import { dbQuery, dbExecute, newId, nowIso } from '../db.js'
import { sendError } from './access.js'
import { loadClients } from './data.js'
import { loadAssignments, isAssigned, planWithState, createPlanFromTemplate, overdueClientSteps, PLAN_OWNERS, AUTO_RULES, type PlanOwner, type AutoRule } from './plans.js'
import { todayUtc } from './contracts.js'
import { handleTeamOnboarding } from './onboarding.js'
import { loadBrief } from './brief.js'

type Caller = { id: string; isAdmin: boolean }

/** Full admins, or copywriters. Managers, editors and clients are refused. */
async function requirePlanner(req: VercelRequest): Promise<Caller> {
  const { profile } = await requireAuth(req)
  const p = profile as any
  if (p.role === 'admin' && p.admin_role !== 'manager') return { id: p.id, isAdmin: true }
  if (p.role === 'team' && p.team_role === 'copywriter') return { id: p.id, isAdmin: false }
  throw Object.assign(new Error('Forbidden'), { status: 403 })
}

async function requireClientAccess(caller: Caller, clientId: string) {
  if (caller.isAdmin) return
  if (!(await isAssigned(clientId, caller.id))) throw Object.assign(new Error('Forbidden'), { status: 403 })
}

async function requireBriefAccess(req: VercelRequest, clientId: string) {
  const { profile } = await requireAuth(req)
  const p = profile as any
  if (p.role === 'admin') return
  if (p.role === 'team') {
    if (p.team_role === 'copywriter' && (await isAssigned(clientId, p.id))) return
    const [onProject] = await dbQuery<{ n: number }>(
      `SELECT 1 AS n FROM project_assignments pa JOIN projects pr ON pr.id = pa.project_id
       WHERE pr.client_id = ? AND pa.team_member_id = ? LIMIT 1`, [clientId, p.id])
    if (onProject) return
  }
  throw Object.assign(new Error('Forbidden'), { status: 403 })
}

async function contractById(contractId: string) {
  const [k] = await dbQuery<{ id: string; client_id: string; number: number; package: string; start_date: string; end_date: string }>(
    'SELECT id, client_id, number, package, start_date, end_date FROM client_contracts WHERE id = ?', [contractId])
  if (!k) throw Object.assign(new Error('Contract not found'), { status: 404 })
  return k
}

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v
const bad = (m: string) => { throw Object.assign(new Error(m), { status: 400 }) }

function parseItem(body: any, mode: 'create' | 'update') {
  if (!body || typeof body !== 'object') bad('Body must be a JSON object')
  const out: { date?: string; title?: string; owner?: PlanOwner; auto_rule?: AutoRule; done?: boolean } = {}
  const known = new Set(['date', 'title', 'owner', 'auto_rule', 'done'])
  const unknown = Object.keys(body).filter((k) => !known.has(k))
  if (unknown.length) bad(`Unknown field(s): ${unknown.join(', ')}`)
  if (body.date !== undefined) { if (!isDate(body.date)) bad('date must be YYYY-MM-DD'); out.date = body.date }
  else if (mode === 'create') bad('date is required')
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) bad('title is required')
    if (body.title.trim().length > 200) bad('title is too long')
    out.title = body.title.trim()
  } else if (mode === 'create') bad('title is required')
  if (body.owner !== undefined) { if (!PLAN_OWNERS.includes(body.owner)) bad(`owner must be one of ${PLAN_OWNERS.join(', ')}`); out.owner = body.owner }
  if (body.auto_rule !== undefined) { if (!AUTO_RULES.includes(body.auto_rule)) bad(`auto_rule must be one of ${AUTO_RULES.join(', ')}`); out.auto_rule = body.auto_rule }
  if (body.done !== undefined) { if (typeof body.done !== 'boolean') bad('done must be true or false'); out.done = body.done }
  if (mode === 'update' && !Object.keys(out).length) bad('Nothing to update')
  return out
}

/** The plan of a contract, with auto ticks applied (via loadClients). */
async function planResponse(contractId: string) {
  const k = await contractById(contractId)
  const [client] = await loadClients(k.client_id, { includeDisabled: true })
  const isCurrent = client?.contract?.id === k.id
  // loadClients applies auto ticks for the CURRENT contract; other contracts
  // are history and shown as stored.
  const items = isCurrent
    ? client!.plan ?? []
    : (await dbQuery<any>('SELECT * FROM production_plan_items WHERE contract_id = ? ORDER BY sort_order, date', [k.id]))
  const now = Date.now()
  return {
    client: { id: k.client_id, name: client?.full_name ?? '' },
    contract: { id: k.id, number: k.number, package: k.package, start_date: k.start_date, end_date: k.end_date, current: isCurrent },
    items: planWithState(items, now).map(({ contract_id: _k, client_id: _c, ...i }) => i),
  }
}

async function handleList(req: VercelRequest, res: VercelResponse, caller: Caller) {
  const assigned = caller.isAdmin ? null : new Set((await loadAssignments()).filter((a) => a.team_member_id === caller.id).map((a) => a.client_id))
  // Editing-only clients have no plan, so they are not listed.
  const clients = (await loadClients())
    .filter((c) => (assigned ? assigned.has(c.id) : true))
    .filter((c) => c.contract?.package !== 'editing_only')
  const now = Date.now()
  res.json(clients.map((c) => {
    const items = c.plan ?? []
    const open = planWithState(items, now).find((i) => !i.done) ?? null
    return {
      client_id: c.id,
      name: c.full_name,
      contract: c.contract ? { id: c.contract.id, number: c.contract.number, package: c.contract.package } : null,
      steps: items.length,
      done: items.filter((i) => i.done).length,
      overdue: overdueClientSteps(items, now).length,
      next: open ? { title: open.title, date: open.date, owner: open.owner } : null,
    }
  }).sort((a, b) => b.overdue - a.overdue || a.name.localeCompare(b.name)))
}

/** Router entry. `rest` = path after /api/team. */
export async function handleTeamRoute(req: VercelRequest, res: VercelResponse, rest: string[]) {
  try {
    // /clients/:id/onboarding[/files]
    if (rest[0] === 'clients' && rest[2] === 'onboarding') {
      const caller = await requirePlanner(req)
      await requireClientAccess(caller, rest[1])
      return await handleTeamOnboarding(req, res, caller, rest[1], rest.slice(3))
    }
    // /clients/:id/brief — admins, the client's copywriters, and anyone on
    // the team working on one of this client's videos (editors).
    if (rest[0] === 'clients' && rest[2] === 'brief' && rest.length === 3) {
      if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
      await requireBriefAccess(req, rest[1])
      res.json(await loadBrief(rest[1])); return
    }
    if (rest[0] !== 'plans') { res.status(404).json({ error: 'Not found' }); return }
    const caller = await requirePlanner(req)

    // /plans
    if (rest.length === 1) {
      if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
      return await handleList(req, res, caller)
    }

    // /plans/items/:id
    if (rest.length === 3 && rest[1] === 'items') {
      const [item] = await dbQuery<{ id: string; contract_id: string; client_id: string }>('SELECT id, contract_id, client_id FROM production_plan_items WHERE id = ?', [rest[2]])
      if (!item) { res.status(404).json({ error: 'Step not found' }); return }
      await requireClientAccess(caller, item.client_id)
      if (req.method === 'DELETE') {
        await dbExecute('DELETE FROM production_plan_items WHERE id = ?', [item.id])
        res.json(await planResponse(item.contract_id)); return
      }
      if (req.method !== 'PATCH') { res.status(405).json({ error: 'Method not allowed' }); return }
      const p = parseItem(req.body, 'update')
      const sets: string[] = []; const vals: unknown[] = []
      for (const k of ['date', 'title', 'owner', 'auto_rule'] as const) if (p[k] !== undefined) { sets.push(`${k} = ?`); vals.push(p[k]) }
      if (p.done !== undefined) {
        // A hand tick/untick records who did it — auto ticks never override it.
        sets.push('done = ?', 'done_at = ?', 'done_by = ?'); vals.push(p.done ? 1 : 0, p.done ? nowIso() : null, caller.id)
      }
      await dbExecute(`UPDATE production_plan_items SET ${sets.join(', ')} WHERE id = ?`, [...vals, item.id])
      res.json(await planResponse(item.contract_id)); return
    }

    // /plans/:contractId[/...]
    const k = await contractById(rest[1])
    await requireClientAccess(caller, k.client_id)

    if (rest.length === 2) {
      if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
      res.json(await planResponse(k.id)); return
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

    if (rest[2] === 'from-template') {
      if (k.package !== 'full_package') bad('Production plans are for full package contracts')
      const start = (req.body ?? {}).start_date
      if (start !== undefined && !isDate(start)) bad('start_date must be YYYY-MM-DD')
      // Default: today, or the contract start if it hasn't started yet.
      const t = todayUtc(Date.now())
      await createPlanFromTemplate(k, start ?? (k.start_date > t ? k.start_date : t))
      res.status(201).json(await planResponse(k.id)); return
    }
    if (rest[2] === 'items') {
      const p = parseItem(req.body, 'create')
      const [{ next }] = await dbQuery<{ next: number }>('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM production_plan_items WHERE contract_id = ?', [k.id])
      await dbExecute(
        `INSERT INTO production_plan_items (id, contract_id, client_id, date, title, owner, auto_rule, sort_order, done, done_at, done_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId(), k.id, k.client_id, p.date, p.title, p.owner ?? 'pingu', p.auto_rule ?? 'none', next,
          p.done ? 1 : 0, p.done ? nowIso() : null, p.done ? caller.id : null],
      )
      res.status(201).json(await planResponse(k.id)); return
    }
    if (rest[2] === 'reorder') {
      const ids = (req.body ?? {}).ids
      if (!Array.isArray(ids)) bad('ids must be a list')
      const current = await dbQuery<{ id: string }>('SELECT id FROM production_plan_items WHERE contract_id = ?', [k.id])
      const all = new Set(current.map((r) => r.id))
      if (ids.length !== all.size || ids.some((id: unknown) => typeof id !== 'string' || !all.has(id))) bad('ids must list every step of this plan exactly once')
      for (const [i, id] of (ids as string[]).entries()) await dbExecute('UPDATE production_plan_items SET sort_order = ? WHERE id = ?', [i, id])
      res.json(await planResponse(k.id)); return
    }
    res.status(404).json({ error: 'Not found' })
  } catch (e: any) {
    if (/no such table: (production_plan_items|client_team_assignments)/i.test(String(e?.message))) {
      res.status(500).json({ error: 'Production plans need database migration 014 — run db/migrations/014_production_plans.sql' }); return
    }
    sendError(res, e)
  }
}
