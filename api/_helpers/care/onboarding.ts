// Client onboarding questionnaire (migration 015).
//
//   GET  /api/client/onboarding                     my questions + answers
//   PUT  /api/client/onboarding                     { answers?: [{question_id, value}], done?: true }
//   POST /api/client/onboarding/files               { question_id, file_name, size } → upload URL
//   GET  /api/team/clients/:id/onboarding           admins + assigned copywriters
//   PATCH /api/team/clients/:id/onboarding          { answers?, status?: 'done' | 'not_started' (admins) }
//   POST /api/team/clients/:id/onboarding/files     upload URL (pasting in old answers)
//   GET/POST/PATCH /api/admin/onboarding-questions  edit the questions (full admins)
//
// Answer values by question type:
//   text / short_text / choice → string (choice: an option, or the typed
//   text for "Other"); link → string[]; file → {key, name, size}[]

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { dbQuery, dbExecute, newId, nowIso } from '../db.js'
import { getPresignedUploadUrl, getPresignedDownloadUrl } from '../r2.js'
import { sendEmailNotifications } from '../email.js'
import { loadContracts, currentContract, type ContractPackage } from './contracts.js'
import { loadAssignments } from './plans.js'
import { requireCareAdmin, sendError } from './access.js'

export const QUESTION_TYPES = ['text', 'short_text', 'choice', 'link', 'file'] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]
export const QUESTION_PACKAGES = ['both', 'full_package', 'editing_only'] as const
export type QuestionPackages = (typeof QUESTION_PACKAGES)[number]
export type OnboardingStatus = 'not_started' | 'in_progress' | 'done'

export interface Question {
  id: string
  section: string
  text: string
  type: QuestionType
  options: string[]
  required: boolean
  admin_only: boolean
  sort_order: number
  packages: QuestionPackages
  active: boolean
}
export interface FileRef { key: string; name: string; size: number }
export type AnswerValue = string | string[] | FileRef[]

const LIMITS = { text: 20_000, short_text: 500, choice: 500, link: 2_000, list: 20, fileBytes: 500 * 1024 * 1024 }

const bad = (msg: string): never => { throw Object.assign(new Error(msg), { status: 400 }) }
const forbidden = (msg = 'Forbidden'): never => { throw Object.assign(new Error(msg), { status: 403 }) }
const notFound = (msg = 'Not found'): never => { throw Object.assign(new Error(msg), { status: 404 }) }

// ── Pure rules (unit-tested) ────────────────────────────────────────────────

/** Questions a client on `pkg` is asked. No contract → only "both" ones. */
export function questionsForPackage(questions: Question[], pkg: ContractPackage | null): Question[] {
  return questions.filter((q) => q.active && (q.packages === 'both' || q.packages === pkg))
}

export function isAnswered(q: Pick<Question, 'type' | 'options'>, value: AnswerValue | null | undefined): boolean {
  if (value == null) return false
  if (Array.isArray(value)) return value.length > 0
  const v = value.trim()
  // "Other" picked but nothing typed yet.
  if (q.type === 'choice' && v === 'Other' && q.options.includes('Other')) return false
  return v.length > 0
}

/** Required questions without an answer. */
export function missingRequired(questions: Question[], answers: Map<string, AnswerValue>): string[] {
  return questions.filter((q) => q.required && !isAnswered(q, answers.get(q.id))).map((q) => q.id)
}

function normalizeUrl(raw: string): string {
  const s = raw.trim()
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`
  let u: URL
  try { u = new URL(withScheme) } catch { return bad(`Not a link: ${s}`) }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') bad(`Not a link: ${s}`)
  return u.toString()
}

/** Validate a value for a question → the two stored columns (null = clear). */
export function toStored(q: Pick<Question, 'type'>, value: unknown, clientId: string): { answer: string | null; file_url: string | null } {
  if (value == null || value === '') return { answer: null, file_url: null }
  switch (q.type) {
    case 'text': case 'short_text': case 'choice': {
      if (typeof value !== 'string') bad('Answer must be text')
      const v = value as string
      if (v.length > LIMITS[q.type]) bad('Answer is too long')
      return { answer: v.trim() ? v : null, file_url: null }
    }
    case 'link': {
      if (!Array.isArray(value) || value.some((x) => typeof x !== 'string')) bad('Links must be a list')
      const links = (value as string[]).map((x) => x.trim()).filter(Boolean)
      if (links.length > LIMITS.list) bad(`At most ${LIMITS.list} links`)
      if (links.some((x) => x.length > LIMITS.link)) bad('Link is too long')
      return { answer: links.length ? JSON.stringify(links.map(normalizeUrl)) : null, file_url: null }
    }
    case 'file': {
      if (!Array.isArray(value)) bad('Files must be a list')
      const files = (value as unknown[]).map((f) => {
        const r = f as Partial<FileRef>
        if (!r || typeof r.key !== 'string' || typeof r.name !== 'string' || typeof r.size !== 'number') bad('Bad file')
        // Only files uploaded for THIS client.
        if (!r.key!.startsWith(`onboarding/${clientId}/`)) bad('Bad file')
        return { key: r.key!, name: r.name!.slice(0, 300), size: r.size! }
      })
      if (files.length > LIMITS.list) bad(`At most ${LIMITS.list} files`)
      return { answer: null, file_url: files.length ? JSON.stringify(files) : null }
    }
  }
  return bad('Unknown question type')
}

export function fromStored(q: Pick<Question, 'type'>, row: { answer: string | null; file_url: string | null }): AnswerValue | null {
  try {
    if (q.type === 'file') return row.file_url ? JSON.parse(row.file_url) : null
    if (q.type === 'link') return row.answer ? JSON.parse(row.answer) : null
  } catch { return null }
  return row.answer
}

// ── Data ────────────────────────────────────────────────────────────────────

type QuestionRow = Omit<Question, 'options' | 'required' | 'admin_only' | 'active'> & { options: string | null; required: number; admin_only: number; active: number }
const toQuestion = (r: QuestionRow): Question => ({
  ...r,
  options: r.options ? JSON.parse(r.options) : [],
  required: !!r.required, admin_only: !!r.admin_only, active: !!r.active,
})

export async function loadQuestions(): Promise<Question[]> {
  const rows = await dbQuery<QuestionRow>(
    'SELECT id, section, text, type, options, required, admin_only, sort_order, packages, active FROM onboarding_questions ORDER BY sort_order ASC, created_at ASC')
  return rows.map(toQuestion)
}

type AnswerRow = { question_id: string; answer: string | null; file_url: string | null; updated_at: string; updated_by_name: string | null }
async function loadAnswerRows(clientId: string): Promise<Map<string, AnswerRow>> {
  const rows = await dbQuery<AnswerRow>(
    `SELECT a.question_id, a.answer, a.file_url, a.updated_at, p.full_name AS updated_by_name
     FROM onboarding_answers a LEFT JOIN profiles p ON p.id = a.updated_by WHERE a.client_id = ?`, [clientId])
  return new Map(rows.map((r) => [r.question_id, r]))
}

export async function loadStatus(clientId: string): Promise<{ status: OnboardingStatus; done_at: string | null }> {
  const [row] = await dbQuery<{ onboarding_status: string | null; onboarding_done_at: string | null }>(
    'SELECT onboarding_status, onboarding_done_at FROM client_care WHERE client_id = ?', [clientId])
  return { status: (row?.onboarding_status as OnboardingStatus | null) ?? 'not_started', done_at: row?.onboarding_done_at ?? null }
}

async function setStatus(clientId: string, status: OnboardingStatus, doneAt: string | null) {
  await dbExecute('INSERT OR IGNORE INTO client_care (client_id) VALUES (?)', [clientId])
  await dbExecute('UPDATE client_care SET onboarding_status = ?, onboarding_done_at = ? WHERE client_id = ?',
    [status === 'not_started' ? null : status, doneAt, clientId])
}

async function clientInfo(clientId: string) {
  const [p] = await dbQuery<{ id: string; full_name: string }>("SELECT id, full_name FROM profiles WHERE id = ? AND role = 'client'", [clientId])
  if (!p) notFound('Client not found')
  const contract = currentContract((await loadContracts(clientId)).get(clientId) ?? [], Date.now())
  return { id: p.id, name: p.full_name, package: (contract?.package ?? null) as ContractPackage | null }
}

/** Download links for file answers (signed, short-lived). */
async function withUrls(value: AnswerValue | null, type: QuestionType) {
  if (type !== 'file' || !Array.isArray(value)) return value
  return Promise.all((value as FileRef[]).map(async (f) => ({ ...f, url: await getPresignedDownloadUrl(f.key, 3600, f.name) })))
}

async function saveAnswers(clientId: string, questions: Question[], body: unknown, by: string) {
  if (!Array.isArray(body)) bad('answers must be a list')
  const byId = new Map(questions.map((q) => [q.id, q]))
  const now = nowIso()
  for (const item of body as { question_id?: unknown; value?: unknown }[]) {
    const q = byId.get(String(item?.question_id))
    if (!q) notFound('Question not found')
    const { answer, file_url } = toStored(q!, item.value, clientId)
    if (answer == null && file_url == null) {
      await dbExecute('DELETE FROM onboarding_answers WHERE client_id = ? AND question_id = ?', [clientId, q!.id])
    } else {
      await dbExecute(
        `INSERT INTO onboarding_answers (id, client_id, question_id, answer, file_url, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (client_id, question_id) DO UPDATE SET answer = excluded.answer, file_url = excluded.file_url,
           updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        [newId(), clientId, q!.id, answer, file_url, now, by])
    }
  }
}

async function uploadUrl(clientId: string, questions: Question[], body: any) {
  const q = questions.find((x) => x.id === String(body?.question_id))
  if (!q || q.type !== 'file') notFound('Question not found')
  const name = typeof body?.file_name === 'string' ? body.file_name.trim().slice(0, 300) : ''
  if (!name) bad('file_name is required')
  if (typeof body?.size !== 'number' || body.size <= 0 || body.size > LIMITS.fileBytes) bad('File is too large')
  const safe = name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120)
  const key = `onboarding/${clientId}/${newId()}-${safe}`
  return { key, name, size: body.size as number, upload_url: await getPresignedUploadUrl(key, body.mime_type ?? '') }
}

/** First time a client finishes: tick "brief received" and tell their copywriters. */
async function onFinished(client: { id: string; name: string }) {
  const now = nowIso()
  await dbExecute('INSERT OR IGNORE INTO client_onboarding (client_id) VALUES (?)', [client.id])
  await dbExecute('UPDATE client_onboarding SET brief_received = ? WHERE client_id = ? AND brief_received IS NULL', [now, client.id])

  const copywriters = await loadAssignments(client.id)
  if (!copywriters.length) return
  const message = `${client.name} finished onboarding`
  // 'status_changed' with no project: the notifications table only accepts
  // its existing types (same approach as "shared with you").
  await Promise.all(copywriters.map((c) => dbExecute(
    'INSERT INTO notifications (id, recipient_id, project_id, type, message, read, created_at) VALUES (?, ?, NULL, ?, ?, 0, ?)',
    [newId(), c.team_member_id, 'status_changed', message, now])))
  const app = (process.env.APP_ORIGIN || 'https://dashboard.projectpingu.com').replace(/\/$/, '')
  await sendEmailNotifications(copywriters.map((c) => ({
    recipientId: c.team_member_id,
    subject: message,
    text: `${message}\n\nAnswers: ${app}/team/clients/${client.id}/onboarding`,
  })))
}

// ── Client ──────────────────────────────────────────────────────────────────

/** Does this client still have to go through onboarding? Only once they
 *  have a contract (the package decides which questions they get). */
export async function needsOnboarding(clientId: string, hasContract: boolean): Promise<boolean> {
  if (!hasContract) return false
  return (await loadStatus(clientId)).status !== 'done'
}

async function clientView(clientId: string) {
  const [client, all, answers, status] = await Promise.all([clientInfo(clientId), loadQuestions(), loadAnswerRows(clientId), loadStatus(clientId)])
  const questions = questionsForPackage(all, client.package)
  return {
    ...status,
    package: client.package,
    questions: await Promise.all(questions.map(async (q) => {
      const row = answers.get(q.id)
      return {
        id: q.id, section: q.section, text: q.text, type: q.type, options: q.options, required: q.required,
        value: row ? await withUrls(fromStored(q, row), q.type) : null,
      }
    })),
  }
}

export async function handleClientOnboarding(req: VercelRequest, res: VercelResponse, clientId: string, rest: string[]) {
  if (rest.length === 0) {
    if (req.method === 'GET') { res.json(await clientView(clientId)); return }
    if (req.method !== 'PUT') { res.status(405).json({ error: 'Method not allowed' }); return }
    const body = req.body ?? {}
    const [client, all, status] = await Promise.all([clientInfo(clientId), loadQuestions(), loadStatus(clientId)])
    const questions = questionsForPackage(all, client.package)
    if (body.answers !== undefined) {
      await saveAnswers(clientId, questions, body.answers, clientId)
      if (status.status === 'not_started') await setStatus(clientId, 'in_progress', null)
    }
    if (body.done !== undefined) {
      if (body.done !== true) bad('done must be true')
      const answers = await loadAnswerRows(clientId)
      const values = new Map(questions.flatMap((q) => {
        const row = answers.get(q.id)
        const v = row ? fromStored(q, row) : null
        return v == null ? [] : [[q.id, v] as [string, AnswerValue]]
      }))
      const missing = missingRequired(questions, values)
      if (missing.length) { res.status(400).json({ error: 'Some questions still need an answer', missing }); return }
      if (status.status !== 'done') {
        await setStatus(clientId, 'done', nowIso())
        await onFinished(client)
      }
    }
    res.json(await clientView(clientId)); return
  }
  if (rest.length === 1 && rest[0] === 'files') {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
    const client = await clientInfo(clientId)
    res.json(await uploadUrl(clientId, questionsForPackage(await loadQuestions(), client.package), req.body)); return
  }
  res.status(404).json({ error: 'Not found' })
}

// ── Team (admins + assigned copywriters) ────────────────────────────────────

async function teamView(clientId: string, isAdmin: boolean) {
  const [client, all, answers, status] = await Promise.all([clientInfo(clientId), loadQuestions(), loadAnswerRows(clientId), loadStatus(clientId)])
  // Their package's questions (all of them without a contract), plus any
  // other question that already has an answer. Admin-only: admins only.
  const asked = new Set((client.package ? questionsForPackage(all, client.package) : all.filter((q) => q.active)).map((q) => q.id))
  const shown = all.filter((q) => (asked.has(q.id) || answers.has(q.id)) && (isAdmin || !q.admin_only))
  const sections: { name: string; questions: unknown[] }[] = []
  for (const q of shown) {
    const row = answers.get(q.id)
    let section = sections[sections.length - 1]
    if (section?.name !== q.section) sections.push(section = { name: q.section, questions: [] })
    section.questions.push({
      id: q.id, text: q.text, type: q.type, options: q.options, required: q.required, admin_only: q.admin_only,
      value: row ? await withUrls(fromStored(q, row), q.type) : null,
      updated_at: row?.updated_at ?? null, updated_by: row?.updated_by_name ?? null,
    })
  }
  const askedList = all.filter((q) => asked.has(q.id))
  return {
    client: { id: client.id, name: client.name },
    package: client.package,
    ...status,
    answered: askedList.filter((q) => { const r = answers.get(q.id); return r && isAnswered(q, fromStored(q, r)) }).length,
    total: askedList.length,
    can_set_status: isAdmin,
    sections,
  }
}

export async function handleTeamOnboarding(req: VercelRequest, res: VercelResponse, caller: { id: string; isAdmin: boolean }, clientId: string, rest: string[]) {
  if (rest.length === 0) {
    if (req.method === 'GET') { res.json(await teamView(clientId, caller.isAdmin)); return }
    if (req.method !== 'PATCH') { res.status(405).json({ error: 'Method not allowed' }); return }
    const body = req.body ?? {}
    await clientInfo(clientId)
    const all = await loadQuestions()
    const editable = caller.isAdmin ? all : all.filter((q) => !q.admin_only)
    if (body.answers !== undefined) {
      if (!caller.isAdmin && Array.isArray(body.answers) && body.answers.some((a: any) => all.find((q) => q.id === a?.question_id)?.admin_only)) forbidden()
      await saveAnswers(clientId, editable, body.answers, caller.id)
    }
    if (body.status !== undefined) {
      if (!caller.isAdmin) forbidden('Only admins can change the onboarding status')
      if (body.status !== 'done' && body.status !== 'not_started') bad("status must be 'done' or 'not_started'")
      const cur = await loadStatus(clientId)
      // Marked done by an admin keeps the client's own finish date (if any).
      await setStatus(clientId, body.status, body.status === 'done' ? cur.done_at : null)
    }
    res.json(await teamView(clientId, caller.isAdmin)); return
  }
  if (rest.length === 1 && rest[0] === 'files') {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
    await clientInfo(clientId)
    res.json(await uploadUrl(clientId, await loadQuestions(), req.body)); return
  }
  res.status(404).json({ error: 'Not found' })
}

// ── Admin: questions ────────────────────────────────────────────────────────

export function parseQuestionInput(body: unknown, mode: 'create' | 'update'): Partial<Omit<Question, 'id' | 'sort_order'>> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) bad('Body must be an object')
  const b = body as Record<string, unknown>
  const known = new Set(['section', 'text', 'type', 'options', 'required', 'admin_only', 'packages', 'active'])
  for (const k of Object.keys(b)) if (!known.has(k)) bad(`Unknown field: ${k}`)
  const out: Partial<Omit<Question, 'id' | 'sort_order'>> = {}
  for (const k of ['section', 'text'] as const) {
    if (b[k] === undefined) { if (mode === 'create') bad(`${k} is required`); continue }
    if (typeof b[k] !== 'string' || !(b[k] as string).trim() || (b[k] as string).length > 1000) bad(`${k} must be text`)
    out[k] = (b[k] as string).trim()
  }
  if (b.type !== undefined || mode === 'create') {
    const t = b.type ?? 'text'
    if (!(QUESTION_TYPES as readonly unknown[]).includes(t)) bad('Unknown type')
    out.type = t as QuestionType
  }
  if (b.options !== undefined) {
    if (!Array.isArray(b.options) || b.options.some((o) => typeof o !== 'string' || !o.trim() || o.length > 200) || b.options.length > 30) bad('options must be a list of text')
    out.options = (b.options as string[]).map((o) => o.trim())
  }
  for (const k of ['required', 'admin_only', 'active'] as const) {
    if (b[k] === undefined) continue
    if (typeof b[k] !== 'boolean') bad(`${k} must be true or false`)
    out[k] = b[k] as boolean
  }
  if (b.packages !== undefined) {
    if (!(QUESTION_PACKAGES as readonly unknown[]).includes(b.packages)) bad('Unknown packages')
    out.packages = b.packages as QuestionPackages
  }
  return out
}

export async function handleQuestionsRoute(req: VercelRequest, res: VercelResponse, rest: string[]) {
  try {
    await requireCareAdmin(req)
    if (rest.length === 0) {
      if (req.method === 'GET') { res.json(await loadQuestions()); return }
      if (req.method === 'POST') {
        const q = parseQuestionInput(req.body, 'create')
        if (q.type === 'choice' && !q.options?.length) bad('A choice question needs options')
        const [{ max }] = await dbQuery<{ max: number | null }>('SELECT MAX(sort_order) AS max FROM onboarding_questions')
        const id = newId()
        await dbExecute(
          `INSERT INTO onboarding_questions (id, section, text, type, options, required, admin_only, sort_order, packages, active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [id, q.section, q.text, q.type, q.type === 'choice' ? JSON.stringify(q.options) : null,
            q.required === false ? 0 : 1, q.admin_only ? 1 : 0, (max ?? 0) + 10, q.packages ?? 'both'])
        res.status(201).json(await loadQuestions()); return
      }
      // PATCH { order: [ids] } — new order (ids not listed keep their place after).
      if (req.method === 'PATCH') {
        const order = (req.body ?? {}).order
        if (!Array.isArray(order) || order.some((x) => typeof x !== 'string')) bad('order must be a list of ids')
        const all = await loadQuestions()
        const ids = [...new Set(order as string[])]
        if (ids.some((id) => !all.find((q) => q.id === id))) notFound('Question not found')
        const rest = all.map((q) => q.id).filter((id) => !ids.includes(id))
        const now = nowIso()
        for (const [i, id] of [...ids, ...rest].entries()) {
          await dbExecute('UPDATE onboarding_questions SET sort_order = ?, updated_at = ? WHERE id = ?', [(i + 1) * 10, now, id])
        }
        res.json(await loadQuestions()); return
      }
      res.status(405).json({ error: 'Method not allowed' }); return
    }
    if (rest.length === 1) {
      if (req.method !== 'PATCH') { res.status(405).json({ error: 'Method not allowed' }); return }
      const cur = (await loadQuestions()).find((q) => q.id === rest[0])
      if (!cur) notFound('Question not found')
      const patch = parseQuestionInput(req.body, 'update')
      if (!Object.keys(patch).length) bad('Nothing to update')
      if (patch.type && patch.type !== cur!.type) {
        const [{ n }] = await dbQuery<{ n: number }>('SELECT COUNT(*) AS n FROM onboarding_answers WHERE question_id = ?', [cur!.id])
        if (n > 0) bad('This question already has answers; its type cannot change')
      }
      const type = patch.type ?? cur!.type
      const options = type === 'choice' ? (patch.options ?? cur!.options) : []
      if (type === 'choice' && !options.length) bad('A choice question needs options')
      const next = { ...cur!, ...patch, type, options }
      await dbExecute(
        `UPDATE onboarding_questions SET section = ?, text = ?, type = ?, options = ?, required = ?, admin_only = ?, packages = ?, active = ?, updated_at = ?
         WHERE id = ?`,
        [next.section, next.text, next.type, type === 'choice' ? JSON.stringify(options) : null,
          next.required ? 1 : 0, next.admin_only ? 1 : 0, next.packages, next.active ? 1 : 0, nowIso(), cur!.id])
      res.json(await loadQuestions()); return
    }
    res.status(404).json({ error: 'Not found' })
  } catch (e) {
    sendError(res, e)
  }
}
