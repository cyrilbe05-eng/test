// /api/playbook — short training videos for clients.
//
// Admins (managers included) manage everything. Clients see only
// PUBLISHED videos in sections meant for all clients or for them, and the
// server checks that before handing out any video/file link. Everyone else
// (editors, copywriters) is refused.
//
//   GET    /api/playbook                             admins: everything; clients: what they may see (+ watched)
//   POST   /api/playbook/sections                    { title }
//   PATCH  /api/playbook/sections/:id                { title?, audience?: 'all'|'selected', clientIds? }
//   DELETE /api/playbook/sections/:id
//   PUT    /api/playbook/sections/order              { ids }
//   POST   /api/playbook/sections/:id/videos         { title, description?, link? | upload {key,fileName,fileSize,mimeType}, thumbnailKey? }
//   PUT    /api/playbook/sections/:id/videos/order   { ids }
//   PATCH  /api/playbook/videos/:id                  { title?, description?, status?, sectionId?, link?, upload?, thumbnailKey? }
//   DELETE /api/playbook/videos/:id
//   GET    /api/playbook/videos/:id/play             { kind: 'file', url } | { kind: 'embed', url }
//   POST   /api/playbook/videos/:id/watched          clients: mark watched   (DELETE: unmark)
//   GET    /api/playbook/videos/:id/views            admins: clients who can see it + when they watched
//   POST   /api/playbook/videos/:id/attachments      { kind: 'link', title, url } | { kind: 'file', title?, key, fileName, fileSize, mimeType }
//   PUT    /api/playbook/videos/:id/attachments/order { ids }
//   DELETE /api/playbook/attachments/:id
//   GET    /api/playbook/attachments/:id/url         signed link to a file attachment
//   POST   /api/playbook/upload-url                  admins: { fileName, mimeType, kind: 'thumb'|'file'|'video' } → { uploadUrl, key }
//
// Big videos use the existing resumable upload (/api/project-files/multipart
// with { playbook: true }); keys always live under playbook/.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../auth.js'
import { dbExecute, dbQuery, newId, nowIso } from '../db.js'
import { deleteObject, ensurePlayableObject, getPresignedDownloadUrl, getPresignedUploadUrl } from '../r2.js'
import { inferMimeType } from '../mime.js'
import { cleanLink, linkThumbnail, parseVideoLink } from './links.js'

type Caller = { id: string; isAdmin: boolean }
const fail = (status: number, message: string) => Object.assign(new Error(message), { status })
const STREAM_TTL = 4 * 3600
const THUMB_TTL = 6 * 3600

export const sanitizeFileName = (name: string) => name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '').slice(-120) || 'file'
/** A storage key this feature issued (never another feature's files). */
const isPlaybookKey = (k: unknown, kind?: 'video' | 'thumb' | 'file'): k is string =>
  typeof k === 'string' && /^playbook\/(video|thumb|file)\/[^/]+$/.test(k) && (!kind || k.startsWith(`playbook/${kind}/`))

async function caller(req: VercelRequest): Promise<Caller> {
  const { profile } = await requireAuth(req)
  if (profile.role === 'admin') return { id: profile.id, isAdmin: true }
  if (profile.role === 'client') return { id: profile.id, isAdmin: false }
  throw fail(403, 'Not available')
}

const text = (v: unknown, max: number, label: string, required = true) => {
  const s = typeof v === 'string' ? v.trim().slice(0, max) : ''
  if (required && !s) throw fail(400, `${label} is required`)
  return s
}

/** Sections a client may see: for everyone, or listed for them. */
const VISIBLE_SECTIONS = `(s.audience = 'all' OR EXISTS (SELECT 1 FROM playbook_section_clients sc WHERE sc.section_id = s.id AND sc.client_id = ?))`

async function signThumb(key: string | null) {
  return key ? getPresignedDownloadUrl(key, THUMB_TTL) : null
}

async function overview(c: Caller) {
  const sections = await dbQuery<any>(
    `SELECT s.* FROM playbook_sections s ${c.isAdmin ? '' : `WHERE ${VISIBLE_SECTIONS}`} ORDER BY s.sort_order, s.created_at`,
    c.isAdmin ? [] : [c.id])
  // No IN (?, ?, …) lists here: Cloudflare D1 refuses more than 100 bound
  // parameters, so everything is read by join / per client and filtered here.
  const shown = new Set(sections.map((s) => s.id))
  const videos = (await dbQuery<any>(
    `SELECT v.* FROM playbook_videos v JOIN playbook_sections s ON s.id = v.section_id
     ${c.isAdmin ? '' : `WHERE ${VISIBLE_SECTIONS} AND v.status = 'published'`} ORDER BY v.sort_order, v.created_at`,
    c.isAdmin ? [] : [c.id])).filter((v) => shown.has(v.section_id))
  const vIds = videos.map((v) => v.id)
  const vSet = new Set<string>(vIds)
  const attachments = vIds.length ? (await dbQuery<any>('SELECT * FROM playbook_attachments ORDER BY sort_order, created_at')).filter((a) => vSet.has(a.video_id)) : []
  const audience = c.isAdmin && shown.size ? (await dbQuery<{ section_id: string; client_id: string }>('SELECT section_id, client_id FROM playbook_section_clients')).filter((a) => shown.has(a.section_id)) : []
  const watched = !c.isAdmin && vIds.length
    ? new Map((await dbQuery<{ video_id: string; watched_at: string }>('SELECT video_id, watched_at FROM playbook_views WHERE client_id = ?', [c.id])).filter((w) => vSet.has(w.video_id)).map((w) => [w.video_id, w.watched_at]))
    : new Map<string, string>()
  const viewCounts = c.isAdmin && vIds.length
    ? new Map((await dbQuery<{ video_id: string; n: number }>('SELECT video_id, COUNT(*) AS n FROM playbook_views GROUP BY video_id')).filter((r) => vSet.has(r.video_id)).map((r) => [r.video_id, r.n]))
    : new Map<string, number>()
  const thumbs = new Map(await Promise.all(videos.map(async (v) => [v.id, await signThumb(v.thumbnail_key)] as const)))

  return {
    sections: sections.map((s) => ({
      id: s.id, title: s.title,
      ...(c.isAdmin ? { audience: s.audience, clientIds: audience.filter((a) => a.section_id === s.id).map((a) => a.client_id) } : {}),
      videos: videos.filter((v) => v.section_id === s.id).map((v) => ({
        id: v.id, title: v.title, description: v.description ?? '', source: v.source,
        thumbnailUrl: thumbs.get(v.id) ?? linkThumbnail(v.external_url),
        attachments: attachments.filter((a) => a.video_id === v.id).map((a) => ({ id: a.id, kind: a.kind, title: a.title, url: a.kind === 'link' ? a.url : null, fileName: a.file_name })),
        ...(c.isAdmin
          ? { status: v.status, externalUrl: v.external_url, fileName: v.file_name, fileSize: v.file_size, mimeType: v.mime_type, hasThumbnail: !!v.thumbnail_key, watchedCount: viewCounts.get(v.id) ?? 0, updatedAt: v.updated_at }
          : { watchedAt: watched.get(v.id) ?? null }),
      })),
    })),
  }
}

/** The video, if this caller may see it (clients: published + visible section). */
async function loadVideo(c: Caller, id: string) {
  const [v] = await dbQuery<any>(
    `SELECT v.* FROM playbook_videos v JOIN playbook_sections s ON s.id = v.section_id
     WHERE v.id = ? ${c.isAdmin ? '' : `AND v.status = 'published' AND ${VISIBLE_SECTIONS}`}`,
    c.isAdmin ? [id] : [id, c.id])
  if (!v) throw fail(404, 'Video not found')
  return v
}

async function reorder(table: 'playbook_sections' | 'playbook_videos' | 'playbook_attachments', scope: { col: string; val: string } | null, ids: unknown) {
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) throw fail(400, 'ids must be a list')
  const current = await dbQuery<{ id: string }>(`SELECT id FROM ${table}${scope ? ` WHERE ${scope.col} = ?` : ''}`, scope ? [scope.val] : [])
  const all = new Set(current.map((r) => r.id))
  if (ids.length !== all.size || ids.some((id) => !all.has(id as string))) throw fail(400, 'ids must list every item exactly once')
  for (const [i, id] of (ids as string[]).entries()) await dbExecute(`UPDATE ${table} SET sort_order = ? WHERE id = ?`, [i, id])
}

/** The video's source from a request: a YouTube/Loom link or an uploaded file. */
function sourceFrom(body: any): { source: 'upload' | 'youtube' | 'loom'; storage_key: string | null; file_name: string | null; file_size: number | null; mime_type: string | null; external_url: string | null } | null {
  if (body.link !== undefined && body.link !== null && body.link !== '') {
    const l = parseVideoLink(body.link)
    if (!l) throw fail(400, 'Paste a YouTube or Loom link')
    return { source: l.source, storage_key: null, file_name: null, file_size: null, mime_type: null, external_url: l.url }
  }
  if (body.upload) {
    const u = body.upload
    if (!isPlaybookKey(u.key, 'video')) throw fail(400, 'invalid upload')
    const fileName = text(u.fileName, 200, 'File name')
    return { source: 'upload', storage_key: u.key, file_name: fileName, file_size: Number.isFinite(u.fileSize) ? Math.round(u.fileSize) : null, mime_type: inferMimeType(fileName, u.mimeType), external_url: null }
  }
  return null
}

export async function handlePlaybookRoute(req: VercelRequest, res: VercelResponse, rest: string[]) {
  try {
    const c = await caller(req)
    const body = (req.body ?? {}) as Record<string, any>
    const [a, id, sub] = rest
    const now = nowIso()
    const adminOnly = () => { if (!c.isAdmin) throw fail(403, 'Not available') }

    if (rest.length === 0) {
      if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
      res.json(await overview(c)); return
    }

    // ── Uploads (small files in one go; videos also via the resumable path)
    if (a === 'upload-url' && rest.length === 1 && req.method === 'POST') {
      adminOnly()
      const kind = body.kind === 'thumb' || body.kind === 'video' ? body.kind : 'file'
      const fileName = text(body.fileName, 200, 'File name')
      const key = `playbook/${kind}/${Date.now()}-${newId().slice(0, 8)}-${sanitizeFileName(fileName)}`
      res.json({ uploadUrl: await getPresignedUploadUrl(key, typeof body.mimeType === 'string' ? body.mimeType : 'application/octet-stream'), key }); return
    }

    // ── Sections ────────────────────────────────────────────────────────────
    if (a === 'sections') {
      adminOnly()
      if (rest.length === 1 && req.method === 'POST') {
        const [{ next }] = await dbQuery<{ next: number }>('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM playbook_sections')
        await dbExecute('INSERT INTO playbook_sections (id, title, sort_order, audience, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          [newId(), text(body.title, 120, 'Title'), next, 'all', now, now])
        res.status(201).json(await overview(c)); return
      }
      if (id === 'order' && rest.length === 2 && req.method === 'PUT') {
        await reorder('playbook_sections', null, body.ids)
        res.json(await overview(c)); return
      }
      const [s] = id ? await dbQuery<{ id: string }>('SELECT id FROM playbook_sections WHERE id = ?', [id]) : []
      if (!s) throw fail(404, 'Section not found')
      if (rest.length === 2 && req.method === 'PATCH') {
        const sets: string[] = []; const vals: unknown[] = []
        if (body.title !== undefined) { sets.push('title = ?'); vals.push(text(body.title, 120, 'Title')) }
        if (body.audience !== undefined) {
          if (body.audience !== 'all' && body.audience !== 'selected') throw fail(400, 'audience must be all or selected')
          sets.push('audience = ?'); vals.push(body.audience)
        }
        if (body.clientIds !== undefined) {
          if (!Array.isArray(body.clientIds) || body.clientIds.some((x: unknown) => typeof x !== 'string')) throw fail(400, 'clientIds must be a list')
          const ids = [...new Set(body.clientIds as string[])]
          const ok = ids.length ? await dbQuery<{ id: string }>(`SELECT id FROM profiles WHERE role = 'client' AND id IN (${ids.map(() => '?').join(',')})`, ids) : []
          await dbExecute('DELETE FROM playbook_section_clients WHERE section_id = ?', [id])
          for (const r of ok) await dbExecute('INSERT INTO playbook_section_clients (section_id, client_id) VALUES (?, ?)', [id, r.id])
        }
        sets.push('updated_at = ?'); vals.push(now)
        await dbExecute(`UPDATE playbook_sections SET ${sets.join(', ')} WHERE id = ?`, [...vals, id])
        res.json(await overview(c)); return
      }
      if (rest.length === 2 && req.method === 'DELETE') {
        const files = await dbQuery<{ k: string | null }>(
          `SELECT storage_key AS k FROM playbook_videos WHERE section_id = ? UNION ALL SELECT thumbnail_key FROM playbook_videos WHERE section_id = ?
           UNION ALL SELECT a.storage_key FROM playbook_attachments a JOIN playbook_videos v ON v.id = a.video_id WHERE v.section_id = ?`, [id, id, id])
        await dbExecute('DELETE FROM playbook_sections WHERE id = ?', [id])
        await Promise.allSettled(files.filter((f) => isPlaybookKey(f.k)).map((f) => deleteObject(f.k!)))
        res.json(await overview(c)); return
      }
      if (sub === 'videos' && rest.length === 3 && req.method === 'POST') {
        const src = sourceFrom(body)
        if (!src) throw fail(400, 'Upload a video or paste a YouTube / Loom link')
        const thumb = isPlaybookKey(body.thumbnailKey, 'thumb') ? body.thumbnailKey : null
        const [{ next }] = await dbQuery<{ next: number }>('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM playbook_videos WHERE section_id = ?', [id])
        await dbExecute(
          `INSERT INTO playbook_videos (id, section_id, title, description, source, storage_key, file_name, file_size, mime_type, external_url, thumbnail_key, status, sort_order, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
          [newId(), id, text(body.title, 160, 'Title'), text(body.description, 2000, 'Description', false) || null, src.source, src.storage_key, src.file_name, src.file_size, src.mime_type, src.external_url, thumb, next, c.id, now, now])
        res.status(201).json(await overview(c)); return
      }
      if (sub === 'videos' && rest[3] === 'order' && req.method === 'PUT') {
        await reorder('playbook_videos', { col: 'section_id', val: id }, body.ids)
        res.json(await overview(c)); return
      }
      res.status(405).json({ error: 'Method not allowed' }); return
    }

    // ── Attachments ─────────────────────────────────────────────────────────
    if (a === 'attachments' && id) {
      const [at] = await dbQuery<any>('SELECT * FROM playbook_attachments WHERE id = ?', [id])
      if (!at) throw fail(404, 'Attachment not found')
      if (sub === 'url' && req.method === 'GET') {
        await loadVideo(c, at.video_id) // clients: only for videos they may see
        if (at.kind !== 'file' || !at.storage_key) throw fail(400, 'Not a file')
        // PDFs and images open in the browser; anything else downloads.
        const type = inferMimeType(at.file_name ?? '', at.mime_type)
        const inline = !!type && (type === 'application/pdf' || type.startsWith('image/'))
        res.json({ url: await getPresignedDownloadUrl(at.storage_key, STREAM_TTL, inline ? undefined : at.file_name, type), inline }); return
      }
      adminOnly()
      if (rest.length === 2 && req.method === 'DELETE') {
        await dbExecute('DELETE FROM playbook_attachments WHERE id = ?', [id])
        if (isPlaybookKey(at.storage_key)) await deleteObject(at.storage_key).catch(() => {})
        res.json(await overview(c)); return
      }
      res.status(405).json({ error: 'Method not allowed' }); return
    }

    // ── Videos ──────────────────────────────────────────────────────────────
    if (a !== 'videos' || !id) { res.status(404).json({ error: 'Not found' }); return }
    const v = await loadVideo(c, id)

    if (sub === 'play' && req.method === 'GET') {
      if (v.source !== 'upload') {
        const l = parseVideoLink(v.external_url)
        if (!l) throw fail(404, 'Video link missing')
        res.json({ kind: 'embed', source: v.source, url: l.embedUrl }); return
      }
      // Store a playable type on the object once, so phones stream it.
      const type = await ensurePlayableObject(v.storage_key, v.file_name ?? 'video.mp4', v.mime_type).catch(() => null)
      res.json({ kind: 'file', url: await getPresignedDownloadUrl(v.storage_key, STREAM_TTL, undefined, type) }); return
    }

    if (sub === 'watched' && (req.method === 'POST' || req.method === 'DELETE')) {
      if (c.isAdmin) throw fail(400, 'Only clients are tracked')
      if (req.method === 'POST') await dbExecute('INSERT OR IGNORE INTO playbook_views (video_id, client_id, watched_at) VALUES (?, ?, ?)', [id, c.id, now])
      else await dbExecute('DELETE FROM playbook_views WHERE video_id = ? AND client_id = ?', [id, c.id])
      res.json({ watchedAt: req.method === 'POST' ? ((await dbQuery<{ watched_at: string }>('SELECT watched_at FROM playbook_views WHERE video_id = ? AND client_id = ?', [id, c.id]))[0]?.watched_at ?? now) : null }); return
    }

    adminOnly()

    if (sub === 'views' && req.method === 'GET') {
      // Everyone who can see it (active clients), and when they watched.
      const [s] = await dbQuery<{ audience: string }>('SELECT audience FROM playbook_sections WHERE id = ?', [v.section_id])
      const clients = await dbQuery<{ id: string; full_name: string; watched_at: string | null }>(
        `SELECT p.id, p.full_name, w.watched_at FROM profiles p
         LEFT JOIN playbook_views w ON w.client_id = p.id AND w.video_id = ?
         WHERE p.role = 'client' AND p.disabled = 0
           ${s?.audience === 'selected' ? 'AND p.id IN (SELECT client_id FROM playbook_section_clients WHERE section_id = ?)' : ''}
         ORDER BY w.watched_at IS NULL, p.full_name`,
        s?.audience === 'selected' ? [id, v.section_id] : [id])
      res.json(clients.map((x) => ({ clientId: x.id, name: x.full_name, watchedAt: x.watched_at }))); return
    }

    if (sub === 'attachments' && rest.length === 3 && req.method === 'POST') {
      const [{ next }] = await dbQuery<{ next: number }>('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM playbook_attachments WHERE video_id = ?', [id])
      if (body.kind === 'link') {
        const url = cleanLink(body.url)
        if (!url) throw fail(400, 'Paste a link')
        await dbExecute('INSERT INTO playbook_attachments (id, video_id, kind, title, url, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [newId(), id, 'link', text(body.title, 160, 'Title', false) || url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 160), url, next, now])
      } else {
        if (!isPlaybookKey(body.key, 'file')) throw fail(400, 'invalid upload')
        const fileName = text(body.fileName, 200, 'File name')
        await dbExecute('INSERT INTO playbook_attachments (id, video_id, kind, title, storage_key, file_name, file_size, mime_type, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [newId(), id, 'file', text(body.title, 160, 'Title', false) || fileName, body.key, fileName, Number.isFinite(body.fileSize) ? Math.round(body.fileSize) : null, inferMimeType(fileName, body.mimeType), next, now])
      }
      res.status(201).json(await overview(c)); return
    }
    if (sub === 'attachments' && rest[3] === 'order' && req.method === 'PUT') {
      await reorder('playbook_attachments', { col: 'video_id', val: id }, body.ids)
      res.json(await overview(c)); return
    }

    if (rest.length === 2 && req.method === 'PATCH') {
      const sets: string[] = []; const vals: unknown[] = []
      const old: string[] = []
      if (body.title !== undefined) { sets.push('title = ?'); vals.push(text(body.title, 160, 'Title')) }
      if (body.description !== undefined) { sets.push('description = ?'); vals.push(text(body.description, 2000, 'Description', false) || null) }
      if (body.status !== undefined) {
        if (body.status !== 'draft' && body.status !== 'published') throw fail(400, 'status must be draft or published')
        sets.push('status = ?', 'published_at = ?'); vals.push(body.status, body.status === 'published' ? (v.published_at ?? now) : v.published_at)
      }
      if (body.sectionId !== undefined && body.sectionId !== v.section_id) {
        const [s] = await dbQuery<{ id: string }>('SELECT id FROM playbook_sections WHERE id = ?', [body.sectionId])
        if (!s) throw fail(404, 'Section not found')
        const [{ next }] = await dbQuery<{ next: number }>('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM playbook_videos WHERE section_id = ?', [s.id])
        sets.push('section_id = ?', 'sort_order = ?'); vals.push(s.id, next)
      }
      const src = sourceFrom(body)
      if (src) {
        sets.push('source = ?', 'storage_key = ?', 'file_name = ?', 'file_size = ?', 'mime_type = ?', 'external_url = ?')
        vals.push(src.source, src.storage_key, src.file_name, src.file_size, src.mime_type, src.external_url)
        if (v.storage_key && v.storage_key !== src.storage_key) old.push(v.storage_key)
      }
      if (body.thumbnailKey !== undefined) {
        if (body.thumbnailKey !== null && !isPlaybookKey(body.thumbnailKey, 'thumb')) throw fail(400, 'invalid thumbnail')
        sets.push('thumbnail_key = ?'); vals.push(body.thumbnailKey)
        if (v.thumbnail_key && v.thumbnail_key !== body.thumbnailKey) old.push(v.thumbnail_key)
      }
      if (!sets.length) throw fail(400, 'Nothing to update')
      sets.push('updated_at = ?'); vals.push(now)
      await dbExecute(`UPDATE playbook_videos SET ${sets.join(', ')} WHERE id = ?`, [...vals, id])
      await Promise.allSettled(old.filter((k) => isPlaybookKey(k)).map((k) => deleteObject(k)))
      res.json(await overview(c)); return
    }

    if (rest.length === 2 && req.method === 'DELETE') {
      const files = await dbQuery<{ storage_key: string | null }>('SELECT storage_key FROM playbook_attachments WHERE video_id = ?', [id])
      await dbExecute('DELETE FROM playbook_videos WHERE id = ?', [id])
      await Promise.allSettled([v.storage_key, v.thumbnail_key, ...files.map((f) => f.storage_key)].filter((k) => isPlaybookKey(k)).map((k) => deleteObject(k as string)))
      res.json(await overview(c)); return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    const msg = String(e?.message ?? '')
    if (/no such table|no such column/i.test(msg)) { res.status(500).json({ error: 'This needs database migration 025 — run db/migrations/025_playbook.sql' }); return }
    res.status(e?.status ?? 500).json({ error: msg || 'Internal error' })
  }
}
