// Client Care endpoints (admin-only JSON API — the web pages and the future
// mobile app use exactly these). Mounted from the main router under /api/admin.
//
//   GET    /api/admin/care/overview
//   GET    /api/admin/care/clients/:id
//   PATCH  /api/admin/care/clients/:id            contract, renewal, notes, Miro, onboarding
//   POST   /api/admin/care/clients/:id/contacted  "Contacted" tick
//   DELETE /api/admin/care/contacts/:contactId    undo a tick
//   PATCH  /api/admin/care/revision-entries/:id   correct a note's category
//   DELETE /api/admin/care/sop-rules/:id          archive an SOP rule
//   PUT    /api/admin/care/clients/:id/instagram  replace Instagram accounts
//   GET    /api/admin/care/clients/:id/contracts  list contracts
//   POST   /api/admin/care/clients/:id/contracts  add a contract
//   PATCH  /api/admin/care/contracts/:id          edit; "renewed" creates the next one
//   PUT    /api/admin/care/clients/:id/team       set assigned copywriters
//   (production plan editing: /api/team/plans/... — see plan-routes.ts)

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { dbQuery, dbExecute, newId, nowIso } from '../db.js'
import { CARE_CONFIG, REVISION_CATEGORIES, REVISION_CATEGORY_KEYS, type RevisionCategory } from './config.js'
import { parseCarePatch, type CarePatch, type OnboardingStep } from './validate.js'
import { recategorizeEntry, archiveRule, loadClientRevisions } from './sop.js'
import { getMatcher, lastModelError } from './similarity.js'
import { loadInstagramHandles, replaceInstagramHandles } from './instagram.js'
import { evaluateClient, computeOutputRate, urgencyCompare, type ClientCare } from './compute.js'
import { loadClients, loadOnboarding, loadRecentContacts, loadEditorNames } from './data.js'
import { requireCareAdmin, sendError, processRevisionsSafely } from './access.js'
import { loadContracts, createContract, updateContract } from './contracts.js'
import { loadAssignments, setClientCopywriters, planWithState } from './plans.js'

function card(c: ClientCare, instagram: Map<string, string[]>) {
  return {
    client_id: c.client_id,
    name: c.name,
    instagram: instagram.get(c.client_id) ?? [],
    health: c.health,
    reasons: c.reasons,
    alerts_count: c.alerts.length,
    days_left_on_contract: c.stats.days_left_on_contract,
    days_since_last_contact: c.stats.days_since_last_contact,
  }
}

async function handleOverview(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    await requireCareAdmin(req)
    await processRevisionsSafely()
    const now = Date.now()
    const [clients, instagram] = await Promise.all([loadClients(), loadInstagramHandles()])
    const evaluated = clients.map((c) => evaluateClient(c, now)).sort(urgencyCompare)
    const toCard = (c: ClientCare) => card(c, instagram)

    const textToday = evaluated
      .filter((c) => c.health === 'at_risk' || c.alerts.length > 0 || c.info.length > 0)
      .map((c) => ({
        client_id: c.client_id,
        name: c.name,
        last_contact_at: c.last_contact_at,
        health: c.health,
        // At risk: full reasons (risk + alerts). Otherwise: what triggered
        // the message — the alerts (a contract date alone isn't "text today").
        reasons: [...(c.health === 'at_risk' ? c.reasons : c.alerts.map((a) => a.message)), ...c.info],
      }))

    const byId = new Map(evaluated.map((e) => [e.client_id, e]))
    const allFacts = evaluated.flatMap((c) => c.facts)
    const allDeadlines = evaluated.flatMap((c) => c.deadline_outcomes)

    const renewals = clients
      .filter((c) => c.care?.contract_end)
      .map((c) => {
        const ev = byId.get(c.id)!
        return {
          client_id: c.id,
          name: c.full_name,
          contract_end: c.care!.contract_end,
          contract_number: c.contract?.number ?? null,
          days_left: ev.stats.days_left_on_contract,
          renewal_status: c.care!.renewal_status,
        }
      })
      .sort((a, b) => (a.days_left ?? 0) - (b.days_left ?? 0))

    res.json({
      generated_at: new Date(now).toISOString(),
      thresholds: CARE_CONFIG,
      text_today: textToday,
      health_board: {
        at_risk: evaluated.filter((c) => c.health === 'at_risk').map(toCard),
        needs_attention: evaluated.filter((c) => c.health === 'needs_attention').map(toCard),
        healthy: evaluated.filter((c) => c.health === 'healthy').map(toCard),
      },
      output_rate: {
        agency: computeOutputRate(allFacts, allDeadlines, now),
        per_client: evaluated
          .map((c) => ({ client_id: c.client_id, name: c.name, ...c.output }))
          .sort((a, b) => b.delivered - a.delivered || a.name.localeCompare(b.name)),
      },
      renewals,
    })
  } catch (e) {
    sendError(res, e)
  }
}

/** Everything for one client — returned by GET and by every write, so the
 *  caller always gets the fresh state back in one round trip. */
async function buildClientDetail(clientId: string) {
  await processRevisionsSafely(clientId)
  const now = Date.now()
  const [client] = await loadClients(clientId)
  if (!client) return null
  const [onboarding, contacts, editorNames, revisions, matcher, instagram, contracts, assigned, copywriters] = await Promise.all([
    loadOnboarding(clientId), loadRecentContacts(clientId), loadEditorNames(),
    loadClientRevisions(clientId).catch(() => ({ sop_rules: [], revision_backlog: [] })),
    getMatcher(),
    loadInstagramHandles(clientId),
    loadContracts(clientId),
    loadAssignments(clientId),
    dbQuery<{ id: string; full_name: string }>("SELECT id, full_name FROM profiles WHERE role = 'team' AND team_role = 'copywriter' AND disabled = 0 ORDER BY full_name"),
  ])
  const ev = evaluateClient(client, now)

  return {
    client: {
      id: client.id, name: client.full_name, email: client.email, phone: client.phone,
      client_id_label: client.client_id_label, plan_name: client.plan_name,
    },
    instagram: instagram.get(clientId) ?? [],
    // All contracts (oldest first) and which one is current.
    contracts: (contracts.get(clientId) ?? []).map(({ client_id: _c, ...k }) => k),
    current_contract_id: client.contract?.id ?? null,
    // Copywriters looking after this client (migration 014) + who can be picked.
    copywriters: assigned.map((a) => ({ id: a.team_member_id, name: a.name })),
    available_copywriters: copywriters.map((c) => ({ id: c.id, name: c.full_name })),
    // Production plan of the current contract (auto ticks applied).
    plan: planWithState(client.plan ?? [], now).map(({ contract_id: _k, client_id: _c, ...i }) => i),
    care: client.care ?? {
      contract_start: null, contract_end: null, videos_included: null,
      renewal_status: 'not_discussed', care_notes: null, miro_url: null,
    },
    onboarding: onboarding ?? { welcome_sent: null, call_done: null, brief_received: null, first_video_delivered: null },
    health: ev.health,
    reasons: ev.reasons,
    alerts: ev.alerts,
    info: ev.info,
    stats: ev.stats,
    output: ev.output,
    last_contact_at: client.last_contact_at,
    contacts,
    projects: ev.facts
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((f) => ({ ...f, editors: f.editor_ids.map((id) => ({ id, name: editorNames.get(id) ?? 'Unknown editor' })) })),
    // Part 3: SOP rules + revision backlog, and which matching engine ran.
    ...revisions,
    sop_engine: { engine: matcher.engine, note: matcher.engine === 'model' ? null : lastModelError() },
    revision_categories: REVISION_CATEGORY_KEYS.map((k) => ({ key: k, label: REVISION_CATEGORIES[k].label })),
  }
}

async function requireActiveClient(clientId: string) {
  const [row] = await dbQuery<{ id: string }>(
    "SELECT id FROM profiles WHERE id = ? AND role = 'client' AND disabled = 0", [clientId],
  )
  if (!row) throw Object.assign(new Error('Client not found'), { status: 404 })
}

/** GET = read; PATCH = update notes/Miro/onboarding (contracts: see below). */
async function handleClient(req: VercelRequest, res: VercelResponse, clientId: string) {
  if (req.method !== 'GET' && req.method !== 'PATCH') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    await requireCareAdmin(req)

    if (req.method === 'PATCH') {
      await requireActiveClient(clientId)
      const patch = parseCarePatch(req.body)

      const careKeys = Object.keys(patch.care) as (keyof CarePatch['care'])[]
      if (careKeys.length) {
        // Row is created on first save; a missing row simply means "all empty".
        await dbExecute('INSERT OR IGNORE INTO client_care (client_id) VALUES (?)', [clientId])
        await dbExecute(
          `UPDATE client_care SET ${careKeys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE client_id = ?`,
          [...careKeys.map((k) => patch.care[k]), nowIso(), clientId],
        )
      }
      const stepKeys = Object.keys(patch.onboarding) as OnboardingStep[]
      if (stepKeys.length) {
        await dbExecute('INSERT OR IGNORE INTO client_onboarding (client_id) VALUES (?)', [clientId])
        await dbExecute(
          `UPDATE client_onboarding SET ${stepKeys.map((k) => `${k} = ?`).join(', ')} WHERE client_id = ?`,
          [...stepKeys.map((k) => patch.onboarding[k]), clientId],
        )
      }
    }

    const detail = await buildClientDetail(clientId)
    if (!detail) { res.status(404).json({ error: 'Client not found' }); return }
    res.json(detail)
  } catch (e) {
    sendError(res, e)
  }
}

/** POST — the "Contacted" tick: one new row each time. */
async function handleContacted(req: VercelRequest, res: VercelResponse, clientId: string) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { profile } = await requireCareAdmin(req)
    await requireActiveClient(clientId)
    await dbExecute(
      'INSERT INTO client_contacts (id, client_id, contacted_at, contacted_by) VALUES (?, ?, ?, ?)',
      [newId(), clientId, nowIso(), profile.id],
    )
    res.status(201).json(await buildClientDetail(clientId))
  } catch (e) {
    sendError(res, e)
  }
}

/** DELETE — undo a "Contacted" tick (e.g. a mis-tap on the phone). */
async function handleDeleteContact(req: VercelRequest, res: VercelResponse, contactId: string) {
  if (req.method !== 'DELETE') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    await requireCareAdmin(req)
    const [contact] = await dbQuery<{ client_id: string }>('SELECT client_id FROM client_contacts WHERE id = ?', [contactId])
    if (!contact) { res.status(404).json({ error: 'Contact not found' }); return }
    await dbExecute('DELETE FROM client_contacts WHERE id = ?', [contactId])
    res.json(await buildClientDetail(contact.client_id))
  } catch (e) {
    sendError(res, e)
  }
}

/** PUT — set the copywriters assigned to a client. */
async function handleClientTeam(req: VercelRequest, res: VercelResponse, clientId: string) {
  if (req.method !== 'PUT') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    await requireCareAdmin(req)
    await requireActiveClient(clientId)
    await setClientCopywriters(clientId, req.body)
    res.json(await buildClientDetail(clientId))
  } catch (e: any) {
    if (/no such table: client_team_assignments/i.test(String(e?.message))) {
      res.status(500).json({ error: 'Copywriter links need database migration 014 — run db/migrations/014_production_plans.sql' }); return
    }
    sendError(res, e)
  }
}

/** GET = list; POST = add a contract (next number). */
async function handleClientContracts(req: VercelRequest, res: VercelResponse, clientId: string) {
  if (req.method !== 'GET' && req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    await requireCareAdmin(req)
    await requireActiveClient(clientId)
    if (req.method === 'GET') {
      res.json((await loadContracts(clientId)).get(clientId) ?? []); return
    }
    await createContract(clientId, req.body)
    res.status(201).json(await buildClientDetail(clientId))
  } catch (e) {
    contractError(res, e)
  }
}

/** PATCH — edit a contract; "renewed" creates the next contract automatically. */
async function handleContract(req: VercelRequest, res: VercelResponse, contractId: string) {
  if (req.method !== 'PATCH') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    await requireCareAdmin(req)
    const clientId = await updateContract(contractId, req.body)
    if (!clientId) { res.status(404).json({ error: 'Contract not found' }); return }
    res.json(await buildClientDetail(clientId))
  } catch (e) {
    contractError(res, e)
  }
}

function contractError(res: VercelResponse, e: any) {
  if (/no such table: client_contracts/i.test(String(e?.message))) {
    res.status(500).json({ error: 'Contracts need database migration 013 — run db/migrations/013_client_contracts.sql' }); return
  }
  sendError(res, e)
}

/** PUT — replace a client's Instagram accounts (Create user form + panel). */
async function handleClientInstagram(req: VercelRequest, res: VercelResponse, clientId: string) {
  if (req.method !== 'PUT') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    await requireCareAdmin(req)
    await requireActiveClient(clientId)
    await replaceInstagramHandles(clientId, req.body)
    res.json(await buildClientDetail(clientId))
  } catch (e: any) {
    if (/no such table/i.test(String(e?.message))) {
      res.status(500).json({ error: 'Instagram accounts need database migration 012 — run db/migrations/012_client_instagram.sql' }); return
    }
    sendError(res, e)
  }
}

/** PATCH — the admin corrects a note's category; it is re-merged at once. */
async function handleRevisionEntry(req: VercelRequest, res: VercelResponse, entryId: string) {
  if (req.method !== 'PATCH') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    await requireCareAdmin(req)
    const category = (req.body ?? {}).category as RevisionCategory
    const clientId = await recategorizeEntry(entryId, category)
    if (!clientId) { res.status(404).json({ error: 'Revision entry not found' }); return }
    res.json(await buildClientDetail(clientId))
  } catch (e) {
    sendError(res, e)
  }
}

/** DELETE — archive an SOP rule (removed from the list; history kept). */
async function handleSopRule(req: VercelRequest, res: VercelResponse, ruleId: string) {
  if (req.method !== 'DELETE') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    await requireCareAdmin(req)
    const clientId = await archiveRule(ruleId)
    if (!clientId) { res.status(404).json({ error: 'SOP rule not found' }); return }
    res.json(await buildClientDetail(clientId))
  } catch (e) {
    sendError(res, e)
  }
}

/** Entry point from the main router. `rest` = path after /api/admin/care. */
export async function handleCareRoute(req: VercelRequest, res: VercelResponse, rest: string[]) {
  if (rest.length === 2 && rest[0] === 'revision-entries') return handleRevisionEntry(req, res, rest[1])
  if (rest.length === 2 && rest[0] === 'sop-rules') return handleSopRule(req, res, rest[1])
  if (rest.length === 1 && rest[0] === 'overview') return handleOverview(req, res)
  if (rest.length === 2 && rest[0] === 'clients') return handleClient(req, res, rest[1])
  if (rest.length === 3 && rest[0] === 'clients' && rest[2] === 'contacted') return handleContacted(req, res, rest[1])
  if (rest.length === 3 && rest[0] === 'clients' && rest[2] === 'instagram') return handleClientInstagram(req, res, rest[1])
  if (rest.length === 2 && rest[0] === 'contacts') return handleDeleteContact(req, res, rest[1])
  if (rest.length === 3 && rest[0] === 'clients' && rest[2] === 'contracts') return handleClientContracts(req, res, rest[1])
  if (rest.length === 3 && rest[0] === 'clients' && rest[2] === 'team') return handleClientTeam(req, res, rest[1])
  if (rest.length === 2 && rest[0] === 'contracts') return handleContract(req, res, rest[1])
  res.status(404).json({ error: 'Not found' })
}
