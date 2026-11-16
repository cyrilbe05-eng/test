// /api/scripts — the script-writing workspace (copywriters' Scripts, admins'
// Script Review). Admins (managers included) see every client; copywriters
// only the clients they are assigned to; everyone else, clients included, is
// refused — drafts, editor notes and comments never reach a client. A client
// only ever sees a script once it is pushed to their calendar, as plain text.
//
//   GET    /api/scripts                          pages list (+ clients a page can be made for)
//   POST   /api/scripts/pages                    { clientId }
//   GET    /api/scripts/pages/:clientId          the page: groups, scripts, comments
//   DELETE /api/scripts/pages/:clientId
//   POST   /api/scripts/pages/:clientId/groups   { name }
//   PATCH  /api/scripts/groups/:id               { name }
//   DELETE /api/scripts/groups/:id
//   POST   /api/scripts/groups/:id/move          { direction: 'up' | 'down' }
//   POST   /api/scripts/groups/:id/scripts       { title, type }
//   PATCH  /api/scripts/script/:id               { title?, type?, links? }
//   PUT    /api/scripts/script/:id/content       { field: 'script'|'notes', html? | slides?, baseVersion, force? }
//   POST   /api/scripts/script/:id/status        { status }
//   POST   /api/scripts/script/:id/move          { direction }
//   DELETE /api/scripts/script/:id
//   POST   /api/scripts/script/:id/comments      { id?, field, quote?, body, parentId? }
//   PATCH  /api/scripts/comments/:id             { resolved }
//   DELETE /api/scripts/comments/:id
//   POST   /api/scripts/script/:id/push          { date, type? }   approved → calendar → scheduled

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../auth.js'
import { dbExecute, dbQuery, newId, nowIso } from '../db.js'
import { isAssigned } from '../care/plans.js'
import { MAX_RICH_TEXT, cleanLinks, sanitizeRichText } from './richtext.js'
import { SCRIPT_TYPES, calendarEntryFor, parseSlides } from './push.js'

type Caller = { id: string; name: string; isAdmin: boolean }
type Status = 'draft' | 'in_review' | 'needs_changes' | 'approved' | 'scheduled'

const fail = (status: number, message: string) => Object.assign(new Error(message), { status })
const STATUSES: Status[] = ['draft', 'in_review', 'needs_changes', 'approved', 'scheduled']
const COMMENT_ID = /^[A-Za-z0-9_-]{8,64}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_SLIDES = 30

async function caller(req: VercelRequest): Promise<Caller> {
  const { profile } = await requireAuth(req)
  const p = profile as any
  if (p.role === 'admin') return { id: p.id, name: p.full_name, isAdmin: true }
  if (p.role === 'team' && p.team_role === 'copywriter') return { id: p.id, name: p.full_name, isAdmin: false }
  throw fail(403, 'Scripts are for copywriters and admins')
}

async function requireClient(c: Caller, clientId: string) {
  if (c.isAdmin) return
  if (!(await isAssigned(clientId, c.id))) throw fail(403, 'This client is not assigned to you')
}

const text = (v: unknown, max: number, label: string, required = true): string => {
  const s = typeof v === 'string' ? v.trim().slice(0, max) : ''
  if (required && !s) throw fail(400, `${label} is required`)
  return s
}

async function loadScript(id: string) {
  const [s] = await dbQuery<any>('SELECT * FROM scripts WHERE id = ?', [id])
  if (!s) throw fail(404, 'Script not found')
  return s
}

async function notify(recipients: string[], message: string) {
  const now = nowIso()
  for (const r of [...new Set(recipients)]) {
    try {
      await dbExecute(
        'INSERT INTO notifications (id, recipient_id, project_id, type, message, read, created_at) VALUES (?, ?, NULL, ?, ?, 0, ?)',
        [newId(), r, 'status_changed', message, now])
    } catch { /* a notification must never break the action */ }
  }
}

function shapeScript(s: any) {
  return {
    id: s.id, groupId: s.group_id, clientId: s.client_id, title: s.title, type: s.type,
    bodyHtml: s.body_html, slides: s.type === 'Carousel' ? parseSlides(s.slides) : null, notesHtml: s.notes_html,
    links: (() => { try { return JSON.parse(s.links) } catch { return [] } })(),
    status: s.status, sortOrder: s.sort_order, bodyVersion: s.body_version, notesVersion: s.notes_version,
    inReviewAt: s.in_review_at, calendarEventId: s.calendar_event_id,
    updatedAt: s.updated_at, updatedBy: s.updated_by ? { id: s.updated_by, name: s.updated_by_name ?? null } : null,
  }
}

const SCRIPT_SELECT = `SELECT s.*, u.full_name AS updated_by_name FROM scripts s LEFT JOIN profiles u ON u.id = s.updated_by`

async function commentsFor(where: string, params: unknown[]) {
  const rows = await dbQuery<any>(
    `SELECT c.*, a.full_name AS author_name, a.role AS author_role FROM script_comments c
     LEFT JOIN profiles a ON a.id = c.author_id WHERE ${where} ORDER BY c.created_at`, params)
  return rows.map((c) => ({
    id: c.id, scriptId: c.script_id, field: c.field, parentId: c.parent_id, quote: c.quote, body: c.body,
    author: { id: c.author_id, name: c.author_name ?? 'Former user', role: c.author_role ?? null },
    resolvedAt: c.resolved_at, createdAt: c.created_at,
  }))
}

/** Swap with the neighbour above/below, then renumber 0..n. */
async function move(table: 'script_groups' | 'scripts', scope: 'client_id' | 'group_id', scopeId: string, id: string, direction: unknown) {
  if (direction !== 'up' && direction !== 'down') throw fail(400, 'direction must be up or down')
  const rows = await dbQuery<{ id: string }>(`SELECT id FROM ${table} WHERE ${scope} = ? ORDER BY sort_order, created_at`, [scopeId])
  const ids = rows.map((r) => r.id)
  const i = ids.indexOf(id)
  const j = direction === 'up' ? i - 1 : i + 1
  if (i === -1 || j < 0 || j >= ids.length) return
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  for (const [n, rid] of ids.entries()) await dbExecute(`UPDATE ${table} SET sort_order = ? WHERE id = ?`, [n, rid])
}

async function pageData(clientId: string) {
  const [client] = await dbQuery<{ id: string; full_name: string }>('SELECT id, full_name FROM profiles WHERE id = ?', [clientId])
  const groups = await dbQuery<any>('SELECT id, name, sort_order FROM script_groups WHERE client_id = ? ORDER BY sort_order, created_at', [clientId])
  const scripts = await dbQuery<any>(`${SCRIPT_SELECT} WHERE s.client_id = ? ORDER BY s.sort_order, s.created_at`, [clientId])
  const comments = await commentsFor('c.script_id IN (SELECT id FROM scripts WHERE client_id = ?)', [clientId])
  return {
    client: { id: clientId, name: client?.full_name ?? 'Client' },
    groups: groups.map((g) => ({ id: g.id, name: g.name, scripts: scripts.filter((s) => s.group_id === g.id).map(shapeScript) })),
    comments,
  }
}

export async function handleScriptsRoute(req: VercelRequest, res: VercelResponse, rest: string[]) {
  try {
    const c = await caller(req)
    const body = (req.body ?? {}) as Record<string, any>
    const [a, id, sub] = rest
    const now = nowIso()

    // ── Pages list ───────────────────────────────────────────────────────────
    if (rest.length === 0) {
      if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
      const scope = c.isAdmin ? '' : 'WHERE p.client_id IN (SELECT client_id FROM client_team_assignments WHERE team_member_id = ?)'
      const pages = await dbQuery<any>(
        `SELECT p.client_id, cl.full_name AS client_name, p.created_at,
                (SELECT COUNT(*) FROM scripts s WHERE s.client_id = p.client_id) AS total,
                (SELECT COUNT(*) FROM scripts s WHERE s.client_id = p.client_id AND s.status = 'in_review') AS in_review,
                (SELECT COUNT(*) FROM scripts s WHERE s.client_id = p.client_id AND s.status = 'needs_changes') AS needs_changes,
                (SELECT COUNT(*) FROM scripts s WHERE s.client_id = p.client_id AND s.status = 'approved') AS approved,
                (SELECT MIN(s.in_review_at) FROM scripts s WHERE s.client_id = p.client_id AND s.status = 'in_review') AS oldest_in_review,
                (SELECT MAX(s.updated_at) FROM scripts s WHERE s.client_id = p.client_id) AS last_edit
         FROM script_pages p JOIN profiles cl ON cl.id = p.client_id ${scope} ORDER BY cl.full_name`,
        c.isAdmin ? [] : [c.id])
      const available = await dbQuery<{ id: string; full_name: string }>(
        `SELECT id, full_name FROM profiles WHERE role = 'client' AND disabled = 0
           AND id NOT IN (SELECT client_id FROM script_pages)
           ${c.isAdmin ? '' : 'AND id IN (SELECT client_id FROM client_team_assignments WHERE team_member_id = ?)'}
         ORDER BY full_name`, c.isAdmin ? [] : [c.id])
      // Scripts waiting for review, oldest first (Script Review).
      const waiting = c.isAdmin
        ? await dbQuery<any>(`SELECT s.id, s.title, s.type, s.client_id, cl.full_name AS client_name, s.in_review_at
             FROM scripts s JOIN profiles cl ON cl.id = s.client_id WHERE s.status = 'in_review' ORDER BY s.in_review_at`)
        : []
      res.json({
        pages: pages.map((p) => ({
          clientId: p.client_id, clientName: p.client_name, total: p.total, inReview: p.in_review,
          needsChanges: p.needs_changes, approved: p.approved, oldestInReviewAt: p.oldest_in_review, lastEditAt: p.last_edit,
        })),
        available: available.map((x) => ({ id: x.id, name: x.full_name })),
        waiting: waiting.map((w) => ({ id: w.id, title: w.title, type: w.type, clientId: w.client_id, clientName: w.client_name, inReviewAt: w.in_review_at })),
      })
      return
    }

    // ── Pages ────────────────────────────────────────────────────────────────
    if (a === 'pages') {
      if (rest.length === 1 && req.method === 'POST') {
        const clientId = text(body.clientId, 64, 'Client')
        const [cl] = await dbQuery<{ id: string }>("SELECT id FROM profiles WHERE id = ? AND role = 'client'", [clientId])
        if (!cl) throw fail(404, 'Client not found')
        await requireClient(c, clientId)
        await dbExecute('INSERT OR IGNORE INTO script_pages (client_id, created_by, created_at) VALUES (?, ?, ?)', [clientId, c.id, now])
        res.status(201).json(await pageData(clientId)); return
      }
      if (!id) { res.status(404).json({ error: 'Not found' }); return }
      await requireClient(c, id)
      const [page] = await dbQuery<{ client_id: string }>('SELECT client_id FROM script_pages WHERE client_id = ?', [id])
      if (!page) throw fail(404, 'No script page for this client')
      if (rest.length === 2 && req.method === 'GET') { res.json(await pageData(id)); return }
      if (rest.length === 2 && req.method === 'DELETE') {
        await dbExecute('DELETE FROM script_pages WHERE client_id = ?', [id])
        res.json({ ok: true }); return
      }
      if (rest.length === 3 && sub === 'groups' && req.method === 'POST') {
        const name = text(body.name, 80, 'Name')
        const [{ next }] = await dbQuery<{ next: number }>('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM script_groups WHERE client_id = ?', [id])
        await dbExecute('INSERT INTO script_groups (id, client_id, name, sort_order, created_at) VALUES (?, ?, ?, ?, ?)', [newId(), id, name, next, now])
        res.status(201).json(await pageData(id)); return
      }
      res.status(405).json({ error: 'Method not allowed' }); return
    }

    // ── Groups ───────────────────────────────────────────────────────────────
    if (a === 'groups' && id) {
      const [g] = await dbQuery<{ id: string; client_id: string }>('SELECT id, client_id FROM script_groups WHERE id = ?', [id])
      if (!g) throw fail(404, 'Group not found')
      await requireClient(c, g.client_id)
      if (rest.length === 2 && req.method === 'PATCH') {
        await dbExecute('UPDATE script_groups SET name = ? WHERE id = ?', [text(body.name, 80, 'Name'), id])
      } else if (rest.length === 2 && req.method === 'DELETE') {
        await dbExecute('DELETE FROM script_groups WHERE id = ?', [id])
      } else if (sub === 'move' && req.method === 'POST') {
        await move('script_groups', 'client_id', g.client_id, id, body.direction)
      } else if (sub === 'scripts' && req.method === 'POST') {
        const title = text(body.title, 120, 'Title')
        const type = SCRIPT_TYPES.includes(body.type) ? body.type : 'Reel'
        const [{ next }] = await dbQuery<{ next: number }>('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM scripts WHERE group_id = ?', [id])
        await dbExecute(
          `INSERT INTO scripts (id, group_id, client_id, title, type, slides, sort_order, created_by, created_at, updated_by, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [newId(), id, g.client_id, title, type, type === 'Carousel' ? '[""]' : null, next, c.id, now, c.id, now])
        res.status(201).json(await pageData(g.client_id)); return
      } else { res.status(405).json({ error: 'Method not allowed' }); return }
      res.json(await pageData(g.client_id)); return
    }

    // ── Comments ─────────────────────────────────────────────────────────────
    if (a === 'comments' && id && rest.length === 2) {
      const [cm] = await dbQuery<any>('SELECT c.*, s.client_id FROM script_comments c JOIN scripts s ON s.id = c.script_id WHERE c.id = ?', [id])
      if (!cm) throw fail(404, 'Comment not found')
      await requireClient(c, cm.client_id)
      if (req.method === 'PATCH') {
        if (cm.parent_id) throw fail(400, 'Resolve the comment, not a reply')
        const resolved = body.resolved === true
        await dbExecute('UPDATE script_comments SET resolved_at = ?, resolved_by = ? WHERE id = ?', [resolved ? now : null, resolved ? c.id : null, id])
      } else if (req.method === 'DELETE') {
        if (!c.isAdmin && cm.author_id !== c.id) throw fail(403, 'You can only delete your own comments')
        await dbExecute('DELETE FROM script_comments WHERE id = ? OR parent_id = ?', [id, id])
      } else { res.status(405).json({ error: 'Method not allowed' }); return }
      res.json(await commentsFor('c.script_id = ?', [cm.script_id])); return
    }

    // ── One script ───────────────────────────────────────────────────────────
    if (a !== 'script' || !id) { res.status(404).json({ error: 'Not found' }); return }
    const s = await loadScript(id)
    await requireClient(c, s.client_id)
    const fresh = async () => shapeScript((await dbQuery<any>(`${SCRIPT_SELECT} WHERE s.id = ?`, [id]))[0])

    if (rest.length === 2 && req.method === 'PATCH') {
      const sets: string[] = []; const vals: unknown[] = []
      if (body.title !== undefined) { sets.push('title = ?'); vals.push(text(body.title, 120, 'Title')) }
      if (body.links !== undefined) { sets.push('links = ?'); vals.push(JSON.stringify(cleanLinks(body.links))) }
      if (body.type !== undefined && body.type !== s.type) {
        if (!SCRIPT_TYPES.includes(body.type)) throw fail(400, 'Unknown type')
        sets.push('type = ?'); vals.push(body.type)
        // Switching to/from Carousel carries the text over (slide 1 ↔ body).
        if (body.type === 'Carousel' && !parseSlides(s.slides).length) { sets.push('slides = ?'); vals.push(JSON.stringify([s.body_html ?? ''])) }
        if (s.type === 'Carousel' && !s.body_html) { sets.push('body_html = ?'); vals.push(sanitizeRichText(parseSlides(s.slides).filter(Boolean).join('<div><br></div>'))) }
        sets.push('body_version = body_version + 1')
      }
      if (!sets.length) throw fail(400, 'Nothing to update')
      sets.push('updated_by = ?', 'updated_at = ?'); vals.push(c.id, now)
      await dbExecute(`UPDATE scripts SET ${sets.join(', ')} WHERE id = ?`, [...vals, id])
      res.json(await fresh()); return
    }

    if (sub === 'content' && req.method === 'PUT') {
      const field = body.field === 'notes' ? 'notes' : 'script'
      const versionCol = field === 'notes' ? 'notes_version' : 'body_version'
      const current = field === 'notes' ? s.notes_version : s.body_version
      const base = Number(body.baseVersion)
      // Someone saved since this editor loaded it: say so instead of
      // silently overwriting (the editor can then load theirs or keep mine).
      if (body.force !== true && base !== current) {
        res.status(409).json({ error: 'conflict', script: await fresh() }); return
      }
      let col: string; let value: string
      if (field === 'notes') { col = 'notes_html'; value = sanitizeRichText(body.html) }
      else if (s.type === 'Carousel') {
        const slides = Array.isArray(body.slides) ? body.slides.slice(0, MAX_SLIDES).map(sanitizeRichText) : null
        if (!slides) throw fail(400, 'slides must be a list')
        col = 'slides'; value = JSON.stringify(slides)
        if (value.length > MAX_RICH_TEXT * 2) throw fail(400, 'Script is too long')
      } else { col = 'body_html'; value = sanitizeRichText(body.html) }
      await dbExecute(
        `UPDATE scripts SET ${col} = ?, ${versionCol} = ${versionCol} + 1, updated_by = ?, updated_at = ? WHERE id = ?${body.force === true ? '' : ` AND ${versionCol} = ?`}`,
        body.force === true ? [value, c.id, now, id] : [value, c.id, now, id, current])
      const after = await fresh()
      const v = field === 'notes' ? after.notesVersion : after.bodyVersion
      if (body.force !== true && v !== current + 1) { res.status(409).json({ error: 'conflict', script: after }); return }
      res.json(after); return
    }

    if (sub === 'status' && req.method === 'POST') {
      const to = body.status as Status
      if (!STATUSES.includes(to) || to === 'scheduled') throw fail(400, 'Use Push to calendar to schedule')
      // Copywriter: send to review (from a draft or after changes were asked).
      // Admin: any of draft / in review / needs changes / approved.
      if (!c.isAdmin && !(to === 'in_review' && ['draft', 'needs_changes'].includes(s.status))) throw fail(403, 'Only an admin can do that')
      await dbExecute('UPDATE scripts SET status = ?, in_review_at = ? WHERE id = ?', [to, to === 'in_review' ? now : null, id])
      const [cl] = await dbQuery<{ full_name: string }>('SELECT full_name FROM profiles WHERE id = ?', [s.client_id])
      const label = `"${s.title}" (${cl?.full_name ?? 'client'})`
      if (to === 'in_review') {
        const admins = await dbQuery<{ id: string }>("SELECT id FROM profiles WHERE role = 'admin' AND disabled = 0")
        await notify(admins.map((x) => x.id).filter((x) => x !== c.id), `Script ready for review: ${label}`)
      } else if ((to === 'needs_changes' || to === 'approved') && s.created_by && s.created_by !== c.id) {
        await notify([s.created_by], to === 'approved' ? `Script approved: ${label}` : `Script needs changes: ${label}`)
      }
      res.json(await fresh()); return
    }

    if (sub === 'move' && req.method === 'POST') {
      await move('scripts', 'group_id', s.group_id, id, body.direction)
      res.json(await pageData(s.client_id)); return
    }

    if (rest.length === 2 && req.method === 'DELETE') {
      await dbExecute('DELETE FROM scripts WHERE id = ?', [id])
      res.json(await pageData(s.client_id)); return
    }

    if (sub === 'comments' && req.method === 'POST') {
      const commentBody = text(body.body, 2000, 'Comment')
      const parentId = typeof body.parentId === 'string' && body.parentId ? body.parentId : null
      if (parentId) {
        const [p] = await dbQuery<{ script_id: string; parent_id: string | null }>('SELECT script_id, parent_id FROM script_comments WHERE id = ?', [parentId])
        if (!p || p.script_id !== id || p.parent_id) throw fail(400, 'Reply to a comment on this script')
      }
      const cid = typeof body.id === 'string' && COMMENT_ID.test(body.id) ? body.id : newId().replace(/-/g, '')
      await dbExecute(
        'INSERT INTO script_comments (id, script_id, field, parent_id, quote, body, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [cid, id, body.field === 'notes' ? 'notes' : 'script', parentId, parentId ? null : text(body.quote, 500, 'Quote', false) || null, commentBody, c.id, now])
      res.status(201).json(await commentsFor('c.script_id = ?', [id])); return
    }

    if (sub === 'push' && req.method === 'POST') {
      if (s.status !== 'approved') throw fail(400, 'Only an approved script can be pushed to the calendar')
      const date = text(body.date, 10, 'Date')
      if (!DATE.test(date) || Number.isNaN(Date.parse(date))) throw fail(400, 'Pick a date')
      const type = SCRIPT_TYPES.includes(body.type) ? body.type : s.type
      const links: string[] = (() => { try { return JSON.parse(s.links) } catch { return [] } })()
      const entry = calendarEntryFor({ type: s.type, body_html: s.body_html, slides: s.slides, notes_html: s.notes_html, links })
      const eventId = newId()
      await dbExecute(
        `INSERT INTO calendar_events (id, owner_id, title, date, content_type, content_status, inspiration_url, script, editor_notes, script_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'Scheduled', ?, ?, ?, ?, ?, ?)`,
        [eventId, c.id, s.title, date, type, entry.inspiration_url, entry.script, entry.editor_notes, id, now, now])
      // On the client's calendar; the copywriter who wrote it sees it too.
      await dbExecute("INSERT OR IGNORE INTO calendar_event_participants (event_id, profile_id, role) VALUES (?, ?, 'client')", [eventId, s.client_id])
      if (s.created_by && s.created_by !== c.id) {
        const [w] = await dbQuery<{ role: string }>('SELECT role FROM profiles WHERE id = ?', [s.created_by])
        if (w?.role === 'team') await dbExecute("INSERT OR IGNORE INTO calendar_event_participants (event_id, profile_id, role) VALUES (?, ?, 'team')", [eventId, s.created_by])
      }
      await dbExecute("UPDATE scripts SET status = 'scheduled', calendar_event_id = ?, in_review_at = NULL WHERE id = ?", [eventId, id])
      res.json({ script: await fresh(), calendarEventId: eventId }); return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    const msg = String(e?.message ?? '')
    if (/no such table|no such column/i.test(msg)) { res.status(500).json({ error: 'Scripts need database migration 024 — run db/migrations/024_scripts.sql' }); return }
    res.status(e?.status ?? 500).json({ error: msg || 'Internal error' })
  }
}
