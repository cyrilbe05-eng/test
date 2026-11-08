// Client Care — database loading. Reads only; a fixed handful of queries
// regardless of how many clients there are (no per-client round trips).

import { dbQuery } from '../db.js'
import type { CareFields, ClientInput, DeadlineRow, HistoryRow, ProjectInput } from './compute.js'

interface ClientRow {
  id: string; full_name: string; email: string; phone: string | null
  client_id_label: string | null; plan_name: string | null
}
interface ProjectRow {
  id: string; client_id: string; title: string; status: string
  created_at: string; updated_at: string; client_revision_count: number
}

export interface OnboardingRow {
  welcome_sent: string | null; call_done: string | null
  brief_received: string | null; first_video_delivered: string | null
}

/** Load active (not disabled) clients with everything the care rules need.
 *  Pass clientId to load a single client; includeDisabled for history-based
 *  reports (editor performance) where past work still counts. */
export async function loadClients(clientId?: string, opts: { includeDisabled?: boolean } = {}): Promise<ClientInput[]> {
  const only = clientId ? ' AND p.id = ?' : ''
  const args = clientId ? [clientId] : []
  const active = opts.includeDisabled ? '' : ' AND disabled = 0'
  // Every project-level query is restricted to these same clients.
  const clientScope = `SELECT id FROM profiles WHERE role = 'client'${active}${clientId ? ' AND id = ?' : ''}`

  const [clients, care, contacts, projects, history, deliverables, deadlines, assignments] = await Promise.all([
    dbQuery<ClientRow>(
      `SELECT p.id, p.full_name, p.email, p.phone, p.client_id_label, pl.name AS plan_name
       FROM profiles p LEFT JOIN plans pl ON pl.id = p.plan_id
       WHERE p.role = 'client'${opts.includeDisabled ? '' : ' AND p.disabled = 0'}${only}
       ORDER BY p.full_name ASC`, args),
    dbQuery<CareFields & { client_id: string }>(
      `SELECT client_id, contract_start, contract_end, videos_included, renewal_status, care_notes, miro_url
       FROM client_care WHERE client_id IN (${clientScope})`, args),
    dbQuery<{ client_id: string; last_contact_at: string }>(
      `SELECT client_id, MAX(contacted_at) AS last_contact_at FROM client_contacts
       WHERE client_id IN (${clientScope}) GROUP BY client_id`, args),
    dbQuery<ProjectRow>(
      `SELECT id, client_id, title, status, created_at, updated_at, client_revision_count
       FROM projects WHERE client_id IN (${clientScope})`, args),
    // Older databases may not have migration 003 yet — care still works,
    // delivery dates are then estimated from deliverable uploads.
    dbQuery<HistoryRow & { project_id: string }>(
      `SELECT sh.project_id, sh.old_status, sh.new_status, sh.created_at
       FROM status_history sh JOIN projects pr ON pr.id = sh.project_id
       WHERE pr.client_id IN (${clientScope})
       ORDER BY sh.created_at ASC`, args).catch(() => []),
    dbQuery<{ project_id: string; first_at: string }>(
      `SELECT pf.project_id, MIN(pf.created_at) AS first_at
       FROM project_files pf JOIN projects pr ON pr.id = pf.project_id
       WHERE pf.file_type = 'deliverable' AND pr.client_id IN (${clientScope})
       GROUP BY pf.project_id`, args),
    dbQuery<DeadlineRow & { project_id: string }>(
      `SELECT d.project_id, d.team_member_id, d.due_at, d.status, d.created_at
       FROM deadlines d JOIN projects pr ON pr.id = d.project_id
       WHERE pr.client_id IN (${clientScope})
       ORDER BY d.created_at ASC`, args),
    dbQuery<{ project_id: string; team_member_id: string }>(
      `SELECT pa.project_id, pa.team_member_id
       FROM project_assignments pa JOIN projects pr ON pr.id = pa.project_id
       WHERE pr.client_id IN (${clientScope})`, args),
  ])

  const group = <T extends { [k: string]: any }>(rows: T[], key: keyof T) => {
    const m = new Map<string, T[]>()
    for (const r of rows) { const k = r[key] as string; (m.get(k) ?? m.set(k, []).get(k)!).push(r) }
    return m
  }
  const careBy = new Map(care.map((c) => [c.client_id, c]))
  const contactBy = new Map(contacts.map((c) => [c.client_id, c.last_contact_at]))
  const historyBy = group(history, 'project_id')
  const deliverableBy = new Map(deliverables.map((d) => [d.project_id, d.first_at]))
  const deadlinesBy = group(deadlines, 'project_id')
  const editorsBy = group(assignments, 'project_id')
  const projectsBy = group(projects, 'client_id')

  return clients.map((c) => {
    const careRow = careBy.get(c.id)
    return {
      ...c,
      care: careRow ? {
        contract_start: careRow.contract_start, contract_end: careRow.contract_end,
        videos_included: careRow.videos_included, renewal_status: careRow.renewal_status ?? 'not_discussed',
        care_notes: careRow.care_notes, miro_url: careRow.miro_url,
      } : null,
      last_contact_at: contactBy.get(c.id) ?? null,
      projects: (projectsBy.get(c.id) ?? []).map((p): ProjectInput => ({
        id: p.id, title: p.title, status: p.status, created_at: p.created_at, updated_at: p.updated_at,
        client_revision_count: p.client_revision_count ?? 0,
        history: (historyBy.get(p.id) ?? []).map(({ old_status, new_status, created_at }) => ({ old_status, new_status, created_at })),
        first_deliverable_at: deliverableBy.get(p.id) ?? null,
        deadlines: (deadlinesBy.get(p.id) ?? []).map(({ team_member_id, due_at, status, created_at }) => ({ team_member_id, due_at, status, created_at })),
        editor_ids: (editorsBy.get(p.id) ?? []).map((a) => a.team_member_id),
      })),
    }
  })
}

export async function loadOnboarding(clientId: string): Promise<OnboardingRow | null> {
  const [row] = await dbQuery<OnboardingRow>(
    'SELECT welcome_sent, call_done, brief_received, first_video_delivered FROM client_onboarding WHERE client_id = ?',
    [clientId],
  )
  return row ?? null
}

export async function loadRecentContacts(clientId: string, limit = 20) {
  return dbQuery<{ id: string; contacted_at: string; contacted_by: string | null; contacted_by_name: string | null }>(
    `SELECT c.id, c.contacted_at, c.contacted_by, p.full_name AS contacted_by_name
     FROM client_contacts c LEFT JOIN profiles p ON p.id = c.contacted_by
     WHERE c.client_id = ? ORDER BY c.contacted_at DESC LIMIT ?`,
    [clientId, limit],
  )
}

export async function loadEditorNames(): Promise<Map<string, string>> {
  const rows = await dbQuery<{ id: string; full_name: string }>("SELECT id, full_name FROM profiles WHERE role = 'team'")
  return new Map(rows.map((r) => [r.id, r.full_name]))
}
