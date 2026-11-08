// Client Care endpoints (admin-only JSON API — the web pages and the future
// mobile app use exactly these). Mounted from the main router under /api/admin.
//
//   GET  /api/admin/care/overview
//   GET  /api/admin/care/clients/:id

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../auth.js'
import { CARE_CONFIG } from './config.js'
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

async function handleClientDetail(req: VercelRequest, res: VercelResponse, clientId: string) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    await requireCareAdmin(req)
    const now = Date.now()
    const [client] = await loadClients(clientId)
    if (!client) { res.status(404).json({ error: 'Client not found' }); return }
    const [onboarding, contacts, editorNames] = await Promise.all([
      loadOnboarding(clientId), loadRecentContacts(clientId), loadEditorNames(),
    ])
    const ev = evaluateClient(client, now)

    res.json({
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
    })
  } catch (e) {
    sendError(res, e)
  }
}

/** Entry point from the main router. `rest` = path after /api/admin/care. */
export async function handleCareRoute(req: VercelRequest, res: VercelResponse, rest: string[]) {
  if (rest.length === 1 && rest[0] === 'overview') return handleOverview(req, res)
  if (rest.length === 2 && rest[0] === 'clients') return handleClientDetail(req, res, rest[1])
  res.status(404).json({ error: 'Not found' })
}
