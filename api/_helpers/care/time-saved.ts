// Client "time saved", automatic.
//   per delivered video (Client Approved):
//     editing only      CARE_CONFIG.timeSaved.editingOnlyHours   (2 h)
//     editing+scripting CARE_CONFIG.timeSaved.fullPackageHours   (3.5 h)
//     carousel          CARE_CONFIG.timeSaved.carouselHours      (1 h)
//   the package = the contract running on the delivery day (else the latest
//   one started before it, else the first one, else editing only),
//   + the admin's typed number (profiles.time_saved_hours) as extra hours.
//
//   GET /api/time-saved   client → { auto, extra, total }
//                         admin  → { [clientId]: { auto, extra, total } }

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../auth.js'
import { dbQuery } from '../db.js'
import { sendError } from './access.js'
import { CARE_CONFIG } from './config.js'

type Pkg = 'editing_only' | 'full_package'
type ContractLite = { start_date: string; end_date: string; package: Pkg }
export type Delivered = { delivered_at: string; kind?: string | null }
export type TimeSaved = { auto: number; extra: number; total: number }

export function packageOn(day: string, contracts: ContractLite[]): Pkg {
  if (!contracts.length) return 'editing_only'
  const sorted = [...contracts].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const running = sorted.find((c) => c.start_date <= day && day <= c.end_date)
  if (running) return running.package
  const before = sorted.filter((c) => c.start_date <= day).pop()
  return (before ?? sorted[0]).package
}

export function computeTimeSaved(delivered: Delivered[], contracts: ContractLite[], typed: number | null): TimeSaved {
  const h = CARE_CONFIG.timeSaved
  let auto = 0
  for (const d of delivered) {
    if (d.kind === 'carousel') { auto += h.carouselHours; continue }
    auto += packageOn(d.delivered_at.slice(0, 10), contracts) === 'full_package' ? h.fullPackageHours : h.editingOnlyHours
  }
  const round = (n: number) => Math.round(n * 10) / 10
  const extra = Number(typed) || 0
  return { auto: round(auto), extra: round(extra), total: round(auto + extra) }
}

async function load(clientId?: string): Promise<Record<string, TimeSaved>> {
  const where = clientId ? 'AND p.client_id = ?' : ''
  const args = clientId ? [clientId] : []
  // Delivery moment = the latest move to Client Approved (else last update).
  const sql = (kind: string) =>
    `SELECT p.client_id, ${kind} COALESCE((SELECT MAX(h.created_at) FROM status_history h WHERE h.project_id = p.id AND h.new_status = 'client_approved'), p.updated_at) AS delivered_at
     FROM projects p WHERE p.status = 'client_approved' ${where}`
  let delivered: { client_id: string; delivered_at: string; kind?: string | null }[]
  try {
    delivered = await dbQuery(sql('p.kind,'), args)
  } catch {
    delivered = await dbQuery(sql(''), args) // before migration 019: all videos
  }
  let contracts: (ContractLite & { client_id: string })[] = []
  try {
    contracts = await dbQuery(`SELECT client_id, start_date, end_date, package FROM client_contracts${clientId ? ' WHERE client_id = ?' : ''}`, args)
  } catch { /* contracts not migrated: editing only */ }
  const clients = await dbQuery<{ id: string; time_saved_hours: number | null }>(
    `SELECT id, time_saved_hours FROM profiles WHERE role = 'client'${clientId ? ' AND id = ?' : ''}`, args)
  const out: Record<string, TimeSaved> = {}
  for (const c of clients) {
    out[c.id] = computeTimeSaved(delivered.filter((d) => d.client_id === c.id), contracts.filter((k) => k.client_id === c.id), c.time_saved_hours)
  }
  return out
}

export async function handleTimeSaved(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
    const { clerkUserId, profile } = await requireAuth(req)
    if (profile.role === 'client') { res.json((await load(clerkUserId))[clerkUserId] ?? { auto: 0, extra: 0, total: 0 }); return }
    if (profile.role === 'admin') { res.json(await load()); return }
    res.status(403).json({ error: 'Forbidden' })
  } catch (e) { sendError(res, e) }
}
