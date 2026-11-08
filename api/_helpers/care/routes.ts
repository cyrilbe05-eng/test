// Client Care endpoints (admin-only JSON API — the web pages and the future
// mobile app use exactly these). Mounted from the main router under /api/admin.
//
//   GET    /api/admin/care/overview
//   GET    /api/admin/care/clients/:id
//   PATCH  /api/admin/care/clients/:id            contract, renewal, notes, Miro, onboarding
//   POST   /api/admin/care/clients/:id/contacted  "Contacted" tick
//   DELETE /api/admin/care/contacts/:contactId    undo a tick

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../auth.js'
import { dbQuery, dbExecute, newId, nowIso } from '../db.js'
import { CARE_CONFIG } from './config.js'
import { parseCarePatch, type CarePatch, type OnboardingStep } from './validate.js'
import { evaluateClient, computeOutputRate, urgencyCompare, type ClientCare } from './compute.js'
import { loadClients, loadOnboarding, loadRecentContacts, loadEditorNames } from './data.js'

/** Full admins only: clients, editors AND managers are refused. */
async function requireCareAdmin(req: VercelRequest) {
  const auth = await requireAuth(req)
  requireRole(auth.profile, 'admin')
  if ((auth.profile as any).admin_role === 'manager') {
    throw Object.assign(new Error('Client Care is available to full admins only'), { status: 403 })
  }
  return auth
}

function sendError(res: VercelResponse, e: any) {
  const msg: string = e?.message ?? 'Internal error'
  if (/no such table|no such column/i.test(msg)) {
    res.status(500).json({ error: 'Client Care needs database migration 011 — run db/migrations/011_client_care.sql' })
    return
  }
  res.status(e?.status ?? 500).json({ error: msg })
}

function card(c: ClientCare) {
  return {
    client_id: c.client_id,
    name: c.name,
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
    const now = Date.now()
    const clients = await loadClients()
    const evaluated = clients.map((c) => evaluateClient(c, now)).sort(urgencyCompare)

    const textToday = evaluated
      .filter((c) => c.health === 'at_risk' || c.alerts.length > 0)
      .map((c) => ({
        client_id: c.client_id,
        name: c.name,
        last_contact_at: c.last_contact_at,
        health: c.health,
        // At risk: full reasons (risk + alerts). Otherwise: what triggered
        // the message — the alerts (a contract date alone isn't "text today").
        reasons: c.health === 'at_risk' ? c.reasons : c.alerts.map((a) => a.message),
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
        at_risk: evaluated.filter((c) => c.health === 'at_risk').map(card),
        needs_attention: evaluated.filter((c) => c.health === 'needs_attention').map(card),
        healthy: evaluated.filter((c) => c.health === 'healthy').map(card),
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
  const now = Date.now()
  const [client] = await loadClients(clientId)
  if (!client) return null
  const [onboarding, contacts, editorNames] = await Promise.all([
    loadOnboarding(clientId), loadRecentContacts(clientId), loadEditorNames(),
  ])
  const ev = evaluateClient(client, now)

  return {
      client: {
        id: client.id, name: client.full_name, email: client.email, phone: client.phone,
        client_id_label: client.client_id_label, plan_name: client.plan_name,
      },
      care: client.care ?? {
        contract_start: null, contract_end: null, videos_included: null,
        renewal_status: 'not_discussed', care_notes: null, miro_url: null,
      },
      onboarding: onboarding ?? { welcome_sent: null, call_done: null, brief_received: null, first_video_delivered: null },
      health: ev.health,
      reasons: ev.reasons,
      alerts: ev.alerts,
      stats: ev.stats,
      output: ev.output,
      last_contact_at: client.last_contact_at,
      contacts,
      projects: ev.facts
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((f) => ({ ...f, editors: f.editor_ids.map((id) => ({ id, name: editorNames.get(id) ?? 'Unknown editor' })) })),
  }
}

async function requireActiveClient(clientId: string) {
  const [row] = await dbQuery<{ id: string }>(
    "SELECT id FROM profiles WHERE id = ? AND role = 'client' AND disabled = 0", [clientId],
  )
  if (!row) throw Object.assign(new Error('Client not found'), { status: 404 })
}

/** GET = read; PATCH = update contract/renewal/notes/Miro/onboarding. */
async function handleClient(req: VercelRequest, res: VercelResponse, clientId: string) {
  if (req.method !== 'GET' && req.method !== 'PATCH') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    await requireCareAdmin(req)

    if (req.method === 'PATCH') {
      await requireActiveClient(clientId)
      const [current] = await dbQuery<{ contract_start: string | null; contract_end: string | null }>(
        'SELECT contract_start, contract_end FROM client_care WHERE client_id = ?', [clientId],
      )
      const patch = parseCarePatch(req.body, current)

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

/** Entry point from the main router. `rest` = path after /api/admin/care. */
export async function handleCareRoute(req: VercelRequest, res: VercelResponse, rest: string[]) {
  if (rest.length === 1 && rest[0] === 'overview') return handleOverview(req, res)
  if (rest.length === 2 && rest[0] === 'clients') return handleClient(req, res, rest[1])
  if (rest.length === 3 && rest[0] === 'clients' && rest[2] === 'contacted') return handleContacted(req, res, rest[1])
  if (rest.length === 2 && rest[0] === 'contacts') return handleDeleteContact(req, res, rest[1])
  res.status(404).json({ error: 'Not found' })
}
