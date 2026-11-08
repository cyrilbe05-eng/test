// Client contracts (migration 013): a client can have many contracts over
// time. Client Care always works on the CURRENT one.
//
//   GET   /api/admin/care/clients/:id/contracts   (also inside client detail)
//   POST  /api/admin/care/clients/:id/contracts   new contract (next number)
//   PATCH /api/admin/care/contracts/:id           edit; "renewed" → next one is created

import { dbQuery, dbExecute, newId } from '../db.js'
import { RENEWAL_STATUSES, type RenewalStatus } from './config.js'

export const PACKAGES = ['editing_only', 'full_package'] as const
export type ContractPackage = (typeof PACKAGES)[number]

export interface Contract {
  id: string
  client_id: string
  number: number
  start_date: string
  end_date: string
  package: ContractPackage
  videos_included: number | null
  renewal_status: RenewalStatus
  created_at: string
}

const DAY = 86_400_000
const toMs = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export const todayUtc = (now: number) => new Date(now).toISOString().slice(0, 10)

/** The contract whose dates include today; otherwise the most recently started
 *  one (or, if none has started yet, the earliest upcoming one). */
export function currentContract<T extends Pick<Contract, 'start_date' | 'end_date'>>(contracts: T[], now: number): T | null {
  if (!contracts.length) return null
  const today = todayUtc(now)
  const covering = contracts.find((c) => c.start_date <= today && today <= c.end_date)
  if (covering) return covering
  const started = contracts.filter((c) => c.start_date <= today).sort((a, b) => b.start_date.localeCompare(a.start_date))
  if (started.length) return started[0]
  return [...contracts].sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
}

/** date + n calendar months (day clamped to the month's length). */
function addMonths(date: string, n: number): string {
  const y = +date.slice(0, 4); const m = +date.slice(5, 7) - 1 + n; const d = +date.slice(8, 10)
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return toDate(Date.UTC(y, m, Math.min(d, last)))
}

/** If the contract spans exactly N whole months (e.g. Sep 1 – Nov 30), N. */
function wholeMonths(start: string, end: string): number | null {
  for (let n = 1; n <= 120; n++) {
    const e = toDate(toMs(addMonths(start, n)) - DAY)
    if (e === end) return n
    if (e > end) return null
  }
  return null
}

/** The automatic next contract: starts the day after, same length (in whole
 *  months when the contract is whole months, otherwise in days), same package
 *  and videos included, renewal not discussed yet. */
export function nextContractFrom(c: Pick<Contract, 'start_date' | 'end_date' | 'package' | 'videos_included' | 'number'>) {
  const start = toDate(toMs(c.end_date) + DAY)
  const months = wholeMonths(c.start_date, c.end_date)
  const end = months != null
    ? toDate(toMs(addMonths(start, months)) - DAY)
    : toDate(toMs(start) + (toMs(c.end_date) - toMs(c.start_date)))
  return {
    number: c.number + 1,
    start_date: start,
    end_date: end,
    package: c.package,
    videos_included: c.videos_included,
    renewal_status: 'not_discussed' as RenewalStatus,
  }
}

export function overlaps(a: Pick<Contract, 'start_date' | 'end_date'>, b: Pick<Contract, 'start_date' | 'end_date'>): boolean {
  return a.start_date <= b.end_date && b.start_date <= a.end_date
}

function invalid(message: string): never {
  throw Object.assign(new Error(message), { status: 400 })
}

function isDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  return toDate(toMs(v)) === v
}

export type ContractInput = Partial<Pick<Contract, 'start_date' | 'end_date' | 'package' | 'videos_included' | 'renewal_status'>>

/** Validate a create (all dates required) or an edit (any subset). */
export function parseContractInput(body: unknown, mode: 'create' | 'update'): ContractInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('Body must be a JSON object')
  const b = body as Record<string, unknown>
  const known = new Set(['start_date', 'end_date', 'package', 'videos_included', 'renewal_status'])
  const unknown = Object.keys(b).filter((k) => !known.has(k))
  if (unknown.length) invalid(`Unknown field(s): ${unknown.join(', ')}`)
  const out: ContractInput = {}
  for (const k of ['start_date', 'end_date'] as const) {
    if (b[k] === undefined) { if (mode === 'create') invalid(`${k} is required`); continue }
    if (!isDate(b[k])) invalid(`${k} must be a date (YYYY-MM-DD)`)
    out[k] = b[k] as string
  }
  if (b.package !== undefined) {
    if (!(PACKAGES as readonly unknown[]).includes(b.package)) invalid(`package must be one of ${PACKAGES.join(', ')}`)
    out.package = b.package as ContractPackage
  }
  if (b.videos_included !== undefined) {
    const v = b.videos_included
    if (v !== null && !(typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 10_000)) invalid('videos_included must be a whole number (0 or more) or null')
    out.videos_included = v as number | null
  }
  if (b.renewal_status !== undefined) {
    if (!(RENEWAL_STATUSES as readonly unknown[]).includes(b.renewal_status)) invalid(`renewal_status must be one of ${RENEWAL_STATUSES.join(', ')}`)
    out.renewal_status = b.renewal_status as RenewalStatus
  }
  if (mode === 'update' && !Object.keys(out).length) invalid('Nothing to update')
  return out
}

// ── Database ────────────────────────────────────────────────────────────────

/** client_id → contracts (oldest first). Empty if the table isn't there yet. */
export async function loadContracts(clientId?: string): Promise<Map<string, Contract[]>> {
  const map = new Map<string, Contract[]>()
  try {
    const rows = await dbQuery<Contract>(
      `SELECT id, client_id, number, start_date, end_date, package, videos_included, renewal_status, created_at
       FROM client_contracts${clientId ? ' WHERE client_id = ?' : ''} ORDER BY number ASC`,
      clientId ? [clientId] : [],
    )
    for (const r of rows) (map.get(r.client_id) ?? map.set(r.client_id, []).get(r.client_id)!).push(r)
  } catch (e: any) {
    console.warn('[care] contracts unavailable:', e?.message)
  }
  return map
}

async function assertNoOverlap(clientId: string, range: { start_date: string; end_date: string }, ignoreId?: string) {
  if (range.end_date < range.start_date) invalid('end_date cannot be before start_date')
  const others = ((await loadContracts(clientId)).get(clientId) ?? []).filter((c) => c.id !== ignoreId)
  const clash = others.find((c) => overlaps(c, range))
  if (clash) invalid(`Dates overlap contract ${clash.number} (${clash.start_date} – ${clash.end_date})`)
}

export async function createContract(clientId: string, body: unknown): Promise<void> {
  const input = parseContractInput(body, 'create') as Required<Pick<ContractInput, 'start_date' | 'end_date'>> & ContractInput
  await assertNoOverlap(clientId, input)
  const [{ next }] = await dbQuery<{ next: number }>('SELECT COALESCE(MAX(number), 0) + 1 AS next FROM client_contracts WHERE client_id = ?', [clientId])
  await dbExecute(
    `INSERT INTO client_contracts (id, client_id, number, start_date, end_date, package, videos_included, renewal_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId(), clientId, next, input.start_date, input.end_date, input.package ?? 'editing_only', input.videos_included ?? null, input.renewal_status ?? 'not_discussed'],
  )
}

/** Edit a contract. Setting "renewed" creates the next contract automatically
 *  (once — if a later contract already exists, nothing is added). */
export async function updateContract(contractId: string, body: unknown): Promise<string | null> {
  const [current] = await dbQuery<Contract>('SELECT * FROM client_contracts WHERE id = ?', [contractId])
  if (!current) return null
  const input = parseContractInput(body, 'update')
  const merged = { ...current, ...input }
  if (input.start_date || input.end_date) await assertNoOverlap(current.client_id, merged, current.id)

  const keys = Object.keys(input) as (keyof ContractInput)[]
  await dbExecute(`UPDATE client_contracts SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => input[k]), contractId])

  if (input.renewal_status === 'renewed') {
    const [later] = await dbQuery<{ id: string }>('SELECT id FROM client_contracts WHERE client_id = ? AND number > ? LIMIT 1', [current.client_id, current.number])
    if (!later) {
      const next = nextContractFrom(merged)
      await assertNoOverlap(current.client_id, next)
      await dbExecute(
        `INSERT INTO client_contracts (id, client_id, number, start_date, end_date, package, videos_included, renewal_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId(), current.client_id, next.number, next.start_date, next.end_date, next.package, next.videos_included, next.renewal_status],
      )
    }
  }
  return current.client_id
}
