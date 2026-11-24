// Upload API for clients (migration 029). A key can ONLY create video
// projects with footage for its own client — nothing else in the app accepts
// it (every other route expects a login token).
//
//   GET    /api/v1/me                         who this key uploads for
//   POST   /api/v1/uploads                    start a direct upload → upload addresses
//   GET    /api/v1/uploads                    this client's recent API uploads
//   GET    /api/v1/uploads/:id                status (direct or link)
//   POST   /api/v1/uploads/:id/parts          fresh upload addresses for some pieces
//   POST   /api/v1/uploads/:id/complete       all pieces sent → project created
//   DELETE /api/v1/uploads/:id                cancel an unfinished direct upload
//   POST   /api/v1/check                      { files:[{file_name,file_size}] } → would these fit the account? (local folders)
//   POST   /api/v1/imports                    give a link (file, or Google Drive folder) → our server downloads it
//   GET    /api/v1/imports/:id                status of a link download
//   GET    /api/v1/cron/imports               (Vercel cron, once a minute) continue link downloads
//
// Admin side (full admins only), used by the client panel:
//   GET    /api/api-keys?clientId=…           keys + recent activity
//   POST   /api/api-keys                      { clientId, name } → the key, shown once
//   POST   /api/api-keys/:id/revoke           turn a key off
//
// Storage is only USED through the existing helpers (r2.ts); projects are
// created by the website's own "new video" handler, so every rule (plan
// limits, full package, notifications) is the same as on the website.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { signJwt } from '../auth.js'
import { dbExecute, dbQuery, newId, nowIso } from '../db.js'
import { abortMultipartUpload, completeMultipartUpload, createMultipartUpload, deleteObject, getPresignedPartUrl, headObject } from '../r2.js'
import { inferMimeType, inferPlaybackMimeType } from '../mime.js'
import { projectUrl } from '../email.js'
import { isFullPackage } from '../care/full-package.js'
import { batchStorageAllowed } from '../batch/routes.js'
import { requireCareAdmin } from '../care/access.js'
import {
  apiError, authenticateKey, callerIp, checkRateLimit, generateKey, logEvent, pruneRateCounters, touchKey,
  REQUESTS_PER_MINUTE, type ApiError, type KeyCaller,
} from './keys.js'
import { fileNameFrom, hasVideoExtension, normalizeLink, openLink, safeFileName, sniffVideo, VIDEO_EXTENSIONS } from './links.js'
import { driveFileDownloadUrl, listDriveFolder, parseDriveFolder } from './drive.js'
import { Pieces } from './pieces.js'

type CreateProject = (req: VercelRequest, res: VercelResponse) => Promise<void>

const MiB = 1024 * 1024
export const MAX_FILE_BYTES = 100 * 1024 * MiB          // 100 GB
const MIN_PART = 16 * MiB
const MAX_PARTS = 10_000
const URLS_PER_CALL = 1000
const PART_URL_TTL = 86_400                              // 24 h, like the website
const LINK_PART = 16 * MiB
const LINK_SLICE_ON_REQUEST_MS = 20_000                  // work done before answering POST /imports
const CRON_BUDGET_MS = 240_000                           // < 300 s function limit
const LEASE_MS = 290_000
const MAX_LINK_ATTEMPTS = 8
const ABANDON_AFTER_DAYS = 7
export const MAX_FOLDER_VIDEOS = 100

interface UploadRow {
  id: string; key_id: string; client_id: string; kind: 'file' | 'link'; status: string
  storage_key: string | null; upload_id: string | null; file_name: string | null; file_size: number | null; mime_type: string | null
  part_size: number | null; part_count: number | null; parts_json: string | null; bytes_done: number
  source_url: string | null; title: string | null; instructions: string | null; video_script: string | null; inspiration_url: string | null
  project_id: string | null; error: string | null; attempts: number; lease_until: string | null
  created_at: string; updated_at: string; finished_at: string | null
}

class PermanentError extends Error {}

/** Runs an UPDATE … RETURNING id and says whether it changed a row. (The
 *  shared dbExecute's `changes` count is always 0 on D1, so claims made with
 *  it can't be trusted; RETURNING works the same locally and on D1.) */
async function claim(sql: string, params: unknown[]): Promise<boolean> {
  const rows = await dbQuery<{ id: string }>(`${sql} RETURNING id`, params)
  return rows.length === 1
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Part size so the whole file fits in at most 10,000 pieces (whole MiB). */
export function partPlan(fileSize: number): { partSize: number; partCount: number } {
  const partSize = Math.max(MIN_PART, Math.ceil(fileSize / MAX_PARTS / MiB) * MiB)
  return { partSize, partCount: Math.max(1, Math.ceil(fileSize / partSize)) }
}

const str = (v: unknown, max: number): string | null => {
  if (v == null || v === '') return null
  if (typeof v !== 'string') throw apiError(400, 'invalid_request', 'Text fields must be strings.')
  if (v.length > max) throw apiError(400, 'invalid_request', `A text field is longer than ${max} characters.`)
  return v.trim() || null
}

function projectFields(body: any) {
  const inspiration = str(body?.inspiration_url, 2000)
  if (inspiration && !/^https?:\/\//i.test(inspiration)) throw apiError(400, 'invalid_request', 'inspiration_url must be an http(s) link.')
  return {
    title: str(body?.title, 200),
    instructions: str(body?.instructions, 20_000),
    video_script: str(body?.video_script, 50_000),
    inspiration_url: inspiration,
  }
}

const titleFrom = (fileName: string) => fileName.replace(/\.[^.]+$/, '').trim().slice(0, 200) || 'Video'
/** Title for a video inside a folder: the folders it sits in, then its name ("Vid 3 · After"). */
const folderTitle = (path: string) => {
  const parts = path.split('/').map((p) => p.trim()).filter(Boolean)
  const name = parts.pop() ?? ''
  return [...parts, hasVideoExtension(name) ? name.replace(/\.[^.]+$/, '') : name].join(' · ').trim().slice(0, 200) || 'Video'
}

function view(row: UploadRow) {
  return {
    id: row.id,
    type: row.kind,
    status: row.status,
    file_name: row.file_name,
    file_size: row.file_size,
    bytes_received: row.kind === 'link' ? row.bytes_done : undefined,
    part_size: row.kind === 'file' ? row.part_size : undefined,
    part_count: row.kind === 'file' ? row.part_count : undefined,
    title: row.title,
    source_url: row.source_url ?? undefined,
    project: row.project_id ? { id: row.project_id, url: projectUrl(row.project_id, 'client') } : null,
    error: row.error,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

async function loadRow(id: string, clientId: string): Promise<UploadRow> {
  const [row] = await dbQuery<UploadRow>('SELECT * FROM api_uploads WHERE id = ? AND client_id = ?', [id, clientId])
  if (!row) throw apiError(404, 'not_found', 'No upload with this id for this key.')
  return row
}

/** Absolute URL for a server-side PUT (local storage hands out relative ones). */
const absolute = (u: string) => (/^https?:\/\//.test(u) ? u : new URL(u, process.env.APP_ORIGIN ?? 'http://localhost:5173').toString())

async function partUrls(row: UploadRow, numbers: number[]) {
  return Promise.all(numbers.map(async (n) => ({ part_number: n, url: absolute(await getPresignedPartUrl(row.storage_key!, row.upload_id!, n, PART_URL_TTL)) })))
}

/** The same checks the website makes before accepting new videos, for
 *  `count` videos at once (a folder is accepted whole or not at all). */
async function checkBatch(caller: KeyCaller, count: number, totalBytes: number | null) {
  if (await isFullPackage(caller.clientId)) {
    throw apiError(403, 'full_package_needs_script', 'This account is on the full package: videos are recorded from scripts, so please upload on the website from the script.')
  }
  if (totalBytes != null && !(await batchStorageAllowed({ id: caller.clientId, plan_id: caller.planId }, totalBytes))) {
    throw apiError(403, 'storage_limit_reached', count > 1
      ? `These ${count} videos would go over the account's storage limit. Nothing was uploaded.`
      : "This upload would go over the account's storage limit.")
  }
  if (caller.planId) {
    const [plan] = await dbQuery<{ max_active_projects: number }>('SELECT max_active_projects FROM plans WHERE id = ?', [caller.planId])
    if (plan && plan.max_active_projects !== -1) {
      const [c] = await dbQuery<{ n: number }>("SELECT COUNT(*) AS n FROM projects WHERE client_id = ? AND status NOT IN ('client_approved')", [caller.clientId])
      const free = plan.max_active_projects - (c?.n ?? 0)
      if (count > free) {
        throw apiError(403, 'active_project_limit_reached', count > 1
          ? `The account can take ${Math.max(0, free)} more video${free === 1 ? '' : 's'} in progress right now, but this has ${count}. Nothing was uploaded.`
          : 'The account already has its maximum number of videos in progress.')
      }
    }
  }
}
const precheck = (caller: KeyCaller, fileSize: number | null) => checkBatch(caller, 1, fileSize)

/** Runs the website's own "new video" handler as this client. */
async function createProjectAs(clientId: string, fields: Record<string, unknown>, req: VercelRequest, createProject: CreateProject) {
  const token = await signJwt({ sub: clientId, role: 'client' }, '5m')
  let status = 200
  let out: any = null
  const res = {
    status(s: number) { status = s; return res },
    json(v: unknown) { out = v; return res },
    setHeader() { return res },
  } as unknown as VercelResponse
  const inner = Object.assign(Object.create(req), {
    method: 'POST',
    body: fields,
    headers: { ...req.headers, authorization: `Bearer ${token}` },
  }) as VercelRequest
  await createProject(inner, res)
  return { status, out }
}

/** File is complete in storage → project with that file as its footage. */
async function finishIntoProject(row: UploadRow, req: VercelRequest, createProject: CreateProject): Promise<UploadRow> {
  const head = await headObject(row.storage_key!)
  if (!head) throw new Error('The file is not in storage.')
  if (row.file_size != null && head.size !== row.file_size) {
    throw new PermanentError(`The file arrived with ${head.size} bytes but ${row.file_size} were announced.`)
  }
  const title = row.title || titleFrom(row.file_name ?? 'Video')
  const made = await createProjectAs(row.client_id, {
    title,
    instructions: row.instructions, video_script: row.video_script, inspiration_url: row.inspiration_url,
  }, req, createProject)
  if (made.status >= 400 || !made.out?.id) {
    throw new PermanentError(`The project could not be created: ${made.out?.error ?? `error ${made.status}`}`)
  }
  const projectId = made.out.id as string
  try {
    await dbExecute(
      `INSERT INTO project_files (id, project_id, uploader_id, file_type, storage_key, file_name, file_size, mime_type, approved, created_at)
       VALUES (?, ?, ?, 'source_video', ?, ?, ?, ?, 0, ?)`,
      [newId(), projectId, row.client_id, row.storage_key, row.file_name, head.size, inferMimeType(row.file_name ?? '', row.mime_type), nowIso()])
  } catch (e) {
    await dbExecute('DELETE FROM projects WHERE id = ?', [projectId]).catch(() => {})
    throw e
  }
  const now = nowIso()
  await dbExecute("UPDATE api_uploads SET status = 'done', project_id = ?, title = ?, file_size = ?, error = NULL, lease_until = NULL, updated_at = ?, finished_at = ? WHERE id = ?",
    [projectId, title, head.size, now, now, row.id])
  return { ...row, status: 'done', project_id: projectId, title, file_size: head.size, error: null, updated_at: now, finished_at: now }
}

async function markFailed(row: UploadRow, message: string, opts: { deleteFile?: boolean } = {}) {
  if (row.upload_id && row.storage_key && !opts.deleteFile) await abortMultipartUpload(row.storage_key, row.upload_id).catch(() => {})
  if (opts.deleteFile && row.storage_key) await deleteObject(row.storage_key).catch(() => {})
  const now = nowIso()
  await dbExecute("UPDATE api_uploads SET status = 'failed', error = ?, lease_until = NULL, updated_at = ?, finished_at = ? WHERE id = ?", [message.slice(0, 500), now, now, row.id])
}

function send(res: VercelResponse, status: number, body: unknown) {
  res.status(status).json(body)
}

function sendApiError(res: VercelResponse, e: any) {
  const status = typeof e?.status === 'number' ? e.status : 500
  if (e?.retryAfter) res.setHeader('Retry-After', String(e.retryAfter))
  if (status >= 500) console.error('[upload-api]', e)
  send(res, status, { error: status >= 500 ? 'Something went wrong on our side. Try again in a minute.' : e.message, code: e?.code ?? 'error' })
}

// ── link downloads ───────────────────────────────────────────────────────────

/** Moves one link download forward until it finishes or `deadline` passes.
 *  Safe to call from several places: a lease makes sure only one runs. */
async function workOnLink(id: string, deadline: number, req: VercelRequest, createProject: CreateProject): Promise<void> {
  const now = new Date()
  const claimed = await claim(
    `UPDATE api_uploads SET lease_until = ?, status = CASE WHEN status = 'queued' THEN 'downloading' ELSE status END, updated_at = ?
     WHERE id = ? AND kind = 'link' AND status IN ('queued', 'downloading') AND (lease_until IS NULL OR lease_until < ?)`,
    [new Date(now.getTime() + LEASE_MS).toISOString(), now.toISOString(), id, now.toISOString()])
  if (!claimed) return
  let [row] = await dbQuery<UploadRow>('SELECT * FROM api_uploads WHERE id = ?', [id])
  const parts: { partNumber: number; etag: string }[] = row.parts_json ? JSON.parse(row.parts_json) : []

  const save = async (fields: Record<string, unknown>) => {
    const keys = Object.keys(fields)
    await dbExecute(`UPDATE api_uploads SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...keys.map((k) => fields[k]), nowIso(), id])
    row = { ...row, ...fields } as UploadRow
  }
  const release = () => save({ lease_until: null })

  let body: import('node:stream').Readable | null = null
  let stitched = false
  try {
    let from = row.bytes_done
    const link = await openLink(row.source_url!, { from: from || undefined })
    body = link.body
    if (from > 0 && link.status === 416 && row.file_size === from) {
      body.resume()
    } else {
      if (link.status === 401 || link.status === 403 || link.status === 404) {
        throw new PermanentError(`The link answered ${link.status}: make sure it is shared as "anyone with the link" and points to one video file.`)
      }
      if (link.status !== 200 && link.status !== 206) throw new Error(`The link answered ${link.status}.`)
      if (from > 0 && link.status === 200) {
        // The source doesn't support resuming: start this file again.
        if (row.upload_id && row.storage_key) await abortMultipartUpload(row.storage_key, row.upload_id).catch(() => {})
        parts.length = 0
        from = 0
        await save({ storage_key: null, upload_id: null, parts_json: '[]', bytes_done: 0 })
      }
      const ctype = String(link.headers['content-type'] ?? '').toLowerCase()
      if (ctype.startsWith('text/html')) {
        throw new PermanentError('The link opened a web page instead of a video file. Make sure it is shared as "anyone with the link" (Google Drive / Dropbox) or is a direct download link.')
      }
      let total: number | null = row.file_size
      if (link.status === 206) {
        const m = /\/(\d+)\s*$/.exec(String(link.headers['content-range'] ?? ''))
        if (m) total = Number(m[1])
      } else if (link.headers['content-length']) {
        total = Number(link.headers['content-length'])
      }
      if (total != null && total > MAX_FILE_BYTES) throw new PermanentError('The file is bigger than the 100 GB limit.')

      const pending = new Pieces(LINK_PART)                     // every piece exactly LINK_PART bytes (storage needs this)
      let sent = from
      const sendPiece = async (chunk: Buffer) => {
        const partNumber = parts.length + 1
        const url = absolute(await getPresignedPartUrl(row.storage_key!, row.upload_id!, partNumber, PART_URL_TTL))
        const put = await fetch(url, { method: 'PUT', body: chunk })
        if (!put.ok) throw new Error(`Storage refused a piece (${put.status}).`)
        const etag = put.headers.get('etag')
        if (!etag) throw new Error('Storage did not confirm a piece.')
        parts.push({ partNumber, etag })
        sent += chunk.length
        await save({ parts_json: JSON.stringify(parts), bytes_done: sent, lease_until: new Date(Date.now() + LEASE_MS).toISOString() })
      }

      for await (const piece of body as AsyncIterable<Buffer>) {
        pending.add(piece)
        if (!row.upload_id) {
          if (pending.bytes < 512) continue
          // First bytes of the file: is it a video? Then open the storage upload.
          const head = pending.peek()
          const kind = sniffVideo(head)
          if (!kind) throw new PermanentError('The link does not point to a video file.')
          const fileName = fileNameFrom(link.headers, link.finalUrl, kind.ext)
          if (!(await batchStorageAllowed({ id: row.client_id, plan_id: (await dbQuery<{ plan_id: string | null }>('SELECT plan_id FROM profiles WHERE id = ?', [row.client_id]))[0]?.plan_id ?? null }, total ?? 0))) {
            throw new PermanentError('This upload would go over the account\'s storage limit.')
          }
          const storageKey = `apiuploads/${row.client_id}/${Date.now()}-${newId().slice(0, 8)}-${safeFileName(fileName).replace(/\s+/g, '_')}`
          const mime = inferMimeType(fileName, ctype.startsWith('video/') ? ctype.split(';')[0] : null)
          const uploadId = await createMultipartUpload(storageKey, inferPlaybackMimeType(fileName, mime))
          await save({ storage_key: storageKey, upload_id: uploadId, file_name: fileName, file_size: total, mime_type: mime, part_size: LINK_PART, parts_json: '[]' })
        }
        if (sent + pending.bytes > MAX_FILE_BYTES) throw new PermanentError('The file is bigger than the 100 GB limit.')
        for (let chunk; (chunk = pending.full());) await sendPiece(chunk)
        if (Date.now() > deadline) { body.destroy(); await release(); return }
      }
      if (!row.upload_id) {
        if (pending.bytes === 0) throw new PermanentError('The link returned an empty file.')
        throw new PermanentError('The link does not point to a video file.')
      }
      const tail = pending.last()
      if (tail) await sendPiece(tail)
      if (total != null && sent !== total) throw new Error(`The download stopped early (${sent} of ${total} bytes).`)
      if (total == null) await save({ file_size: sent })
    }

    // Everything is in storage: stitch the pieces and make the project.
    if (!(await claim("UPDATE api_uploads SET status = 'processing', updated_at = ? WHERE id = ? AND status = 'downloading'", [nowIso(), id]))) return
    await completeMultipartUpload(row.storage_key!, row.upload_id!, parts)
    stitched = true
    const done = await finishIntoProject({ ...row, status: 'processing' }, req, createProject)
    await logEvent({ keyId: row.key_id, clientId: row.client_id, action: 'import_done', status: 201, uploadId: id, projectId: done.project_id, detail: row.file_name })
  } catch (e: any) {
    body?.destroy()
    const message = e?.message ?? 'The download failed.'
    if (e instanceof PermanentError || stitched || row.attempts + 1 >= MAX_LINK_ATTEMPTS) {
      await markFailed(row, message, { deleteFile: stitched })
      await logEvent({ keyId: row.key_id, clientId: row.client_id, action: 'import_failed', status: 422, uploadId: id, detail: message })
    } else {
      // Try again on the next round (the once-a-minute job or a status check).
      await dbExecute("UPDATE api_uploads SET attempts = attempts + 1, error = ?, lease_until = NULL, status = 'downloading', updated_at = ? WHERE id = ?", [message.slice(0, 500), nowIso(), id])
    }
  }
}

// ── /api/v1 ──────────────────────────────────────────────────────────────────

export async function handleUploadApiRoute(req: VercelRequest, res: VercelResponse, rest: string[], createProject: CreateProject) {
  // Once-a-minute job (Vercel cron): not a key route.
  if (rest[0] === 'cron' && rest[1] === 'imports' && rest.length === 2) return runImportsCron(req, res, createProject)

  let caller: KeyCaller | null = null
  let action = `${req.method} ${rest.join('/')}`
  try {
    caller = await authenticateKey(req)
    await checkRateLimit(caller.keyId)
    await touchKey(caller.keyId)
    const body = (req.body && typeof req.body === 'object') ? req.body as Record<string, any> : {}
    const [a, id, sub] = rest

    if (a === 'me' && rest.length === 1 && req.method === 'GET') {
      action = 'me'
      send(res, 200, {
        client: { name: caller.clientName },
        key: { name: caller.keyName, prefix: caller.keyPrefix },
        limits: { requests_per_minute: REQUESTS_PER_MINUTE, max_file_size_bytes: MAX_FILE_BYTES, video_extensions: VIDEO_EXTENSIONS },
      })
      await logEvent({ keyId: caller.keyId, clientId: caller.clientId, action, status: 200, ip: caller.ip })
      return
    }

    if (a === 'uploads' && rest.length === 1 && req.method === 'GET') {
      action = 'list'
      const rows = await dbQuery<UploadRow>('SELECT * FROM api_uploads WHERE client_id = ? ORDER BY created_at DESC LIMIT 50', [caller.clientId])
      send(res, 200, { uploads: rows.map(view) })
      await logEvent({ keyId: caller.keyId, clientId: caller.clientId, action, status: 200, ip: caller.ip })
      return
    }

    // Start a direct upload.
    if (a === 'uploads' && rest.length === 1 && req.method === 'POST') {
      action = 'upload_start'
      const fileName = safeFileName(String(str(body.file_name, 250) ?? ''))
      if (!fileName) throw apiError(400, 'invalid_request', 'file_name is required.')
      if (!hasVideoExtension(fileName)) throw apiError(400, 'not_a_video', `file_name must end in one of: ${VIDEO_EXTENSIONS.map((e) => '.' + e).join(', ')}.`)
      const fileSize = body.file_size
      if (typeof fileSize !== 'number' || !Number.isInteger(fileSize) || fileSize < 1) throw apiError(400, 'invalid_request', 'file_size (in bytes) is required.')
      if (fileSize > MAX_FILE_BYTES) throw apiError(400, 'file_too_large', 'Files can be at most 100 GB.')
      const fields = projectFields(body)
      await precheck(caller, fileSize)
      const { partSize, partCount } = partPlan(fileSize)
      const storageKey = `apiuploads/${caller.clientId}/${Date.now()}-${newId().slice(0, 8)}-${fileName.replace(/\s+/g, '_')}`
      const contentType = typeof body.content_type === 'string' ? body.content_type : null
      const mime = inferMimeType(fileName, contentType)
      const uploadId = await createMultipartUpload(storageKey, inferPlaybackMimeType(fileName, mime))
      const now = nowIso()
      const row: UploadRow = {
        id: newId(), key_id: caller.keyId, client_id: caller.clientId, kind: 'file', status: 'uploading',
        storage_key: storageKey, upload_id: uploadId, file_name: fileName, file_size: fileSize, mime_type: mime,
        part_size: partSize, part_count: partCount, parts_json: null, bytes_done: 0, source_url: null,
        title: fields.title ?? titleFrom(fileName), instructions: fields.instructions, video_script: fields.video_script, inspiration_url: fields.inspiration_url,
        project_id: null, error: null, attempts: 0, lease_until: null, created_at: now, updated_at: now, finished_at: null,
      }
      await dbExecute(
        `INSERT INTO api_uploads (id, key_id, client_id, kind, status, storage_key, upload_id, file_name, file_size, mime_type, part_size, part_count,
           bytes_done, title, instructions, video_script, inspiration_url, attempts, created_at, updated_at)
         VALUES (?, ?, ?, 'file', 'uploading', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 0, ?, ?)`,
        [row.id, row.key_id, row.client_id, storageKey, uploadId, fileName, fileSize, mime, partSize, partCount,
          row.title, row.instructions, row.video_script, row.inspiration_url, now, now])
      const first = Array.from({ length: Math.min(partCount, URLS_PER_CALL) }, (_, i) => i + 1)
      send(res, 201, {
        upload: view(row),
        parts: await partUrls(row, first),
        more_parts: partCount > URLS_PER_CALL ? `POST /api/v1/uploads/${row.id}/parts with {"part_numbers": [...]} for pieces after ${URLS_PER_CALL}` : null,
        part_urls_valid_for_seconds: PART_URL_TTL,
        next: `PUT bytes [(n-1)*${partSize}, n*${partSize}) to part n's url, keep each response's ETag header, then POST /api/v1/uploads/${row.id}/complete with {"parts":[{"part_number":n,"etag":"…"}]}`,
      })
      await logEvent({ keyId: caller.keyId, clientId: caller.clientId, action, status: 201, uploadId: row.id, detail: `${fileName} (${fileSize} bytes)`, ip: caller.ip })
      return
    }

    // Would these videos fit? (The script asks before uploading a local folder.)
    if (a === 'check' && rest.length === 1 && req.method === 'POST') {
      action = 'check'
      const files = body.files
      if (!Array.isArray(files) || files.length < 1) throw apiError(400, 'invalid_request', 'files must be a list of {"file_name", "file_size"}.')
      if (files.length > MAX_FOLDER_VIDEOS) throw apiError(400, 'too_many_videos', `At most ${MAX_FOLDER_VIDEOS} videos at a time (this has ${files.length}). Split the folder.`)
      let total = 0
      for (const f of files) {
        const name = typeof f?.file_name === 'string' ? f.file_name : ''
        const size = f?.file_size
        if (!hasVideoExtension(name)) throw apiError(400, 'not_a_video', `"${name}" is not a video file name.`)
        if (typeof size !== 'number' || !Number.isInteger(size) || size < 1) throw apiError(400, 'invalid_request', `file_size missing for "${name}".`)
        if (size > MAX_FILE_BYTES) throw apiError(400, 'file_too_large', `"${name}" is over 100 GB.`)
        total += size
      }
      await checkBatch(caller, files.length, total)
      send(res, 200, { ok: true, videos: files.length, total_bytes: total })
      await logEvent({ keyId: caller.keyId, clientId: caller.clientId, action, status: 200, detail: `${files.length} videos, ${total} bytes`, ip: caller.ip })
      return
    }

    // Google Drive FOLDER link: one link download (→ one project) per video.
    if (a === 'imports' && rest.length === 1 && req.method === 'POST' && typeof body.url === 'string' && parseDriveFolder(body.url)) {
      action = 'import_folder'
      const ref = parseDriveFolder(body.url)!
      const fields = projectFields(body)
      let listing
      try { listing = await listDriveFolder(ref, MAX_FOLDER_VIDEOS) } catch (e) { throw apiError(422, 'folder_unreadable', (e as Error).message) }
      if (listing.truncated) throw apiError(400, 'too_many_videos', `This folder has more than ${MAX_FOLDER_VIDEOS} videos. Send smaller folders (or sub-folders) one at a time.`)
      if (!listing.videos.length) {
        const sk = listing.skipped
        throw apiError(400, 'no_videos', `No video files found in this folder${sk.length ? ` (skipped: ${sk.slice(0, 10).join(', ')}${sk.length > 10 ? '…' : ''})` : ''}.`)
      }
      const sizes = listing.videos.map((v) => v.size)
      const total = sizes.every((n) => n != null) ? sizes.reduce((sum: number, n) => sum + (n as number), 0) : null
      await checkBatch(caller, listing.videos.length, total)
      const now = nowIso()
      const ids: string[] = []
      for (const v of listing.videos) {
        const rowId = newId()
        const name = folderTitle(v.path)
        await dbExecute(
          `INSERT INTO api_uploads (id, key_id, client_id, kind, status, source_url, file_name, file_size, bytes_done, title, instructions, video_script, inspiration_url, attempts, created_at, updated_at)
           VALUES (?, ?, ?, 'link', 'queued', ?, ?, ?, 0, ?, ?, ?, ?, 0, ?, ?)`,
          [rowId, caller.keyId, caller.clientId, driveFileDownloadUrl(v.id, v.resourceKey), safeFileName(v.name), v.size,
            fields.title ? `${fields.title} · ${name}`.slice(0, 200) : name, fields.instructions, fields.video_script, fields.inspiration_url, now, now])
        ids.push(rowId)
      }
      await logEvent({ keyId: caller.keyId, clientId: caller.clientId, action, status: 202,
        detail: `${listing.videos.length} videos (${listing.method}) from ${body.url}`, ip: caller.ip })
      // Start on them while we're here; the rest continues in the background.
      const deadline = Date.now() + LINK_SLICE_ON_REQUEST_MS
      for (const rowId of ids) { if (Date.now() > deadline - 2_000) break; await workOnLink(rowId, deadline, req, createProject) }
      const clientId = caller.clientId
      const rows = await Promise.all(ids.map((rowId) => loadRow(rowId, clientId)))
      send(res, 202, {
        folder: { videos: listing.videos.length, paths: listing.videos.map((v) => v.path), skipped: listing.skipped, listed_with: listing.method },
        uploads: rows.map(view),
        next: 'Each video becomes its own project. Check GET /api/v1/imports/{id} for each upload every 30–60 seconds until all are "done" (or "failed").',
      })
      return
    }

    // Link download: start.
    if (a === 'imports' && rest.length === 1 && req.method === 'POST') {
      action = 'import_start'
      const raw = str(body.url, 4000)
      if (!raw) throw apiError(400, 'invalid_request', 'url is required.')
      let source: string
      try { source = normalizeLink(raw) } catch (e) { throw apiError(400, 'invalid_link', (e as Error).message) }
      const fields = projectFields(body)
      await precheck(caller, null)
      const now = nowIso()
      const id2 = newId()
      await dbExecute(
        `INSERT INTO api_uploads (id, key_id, client_id, kind, status, source_url, bytes_done, title, instructions, video_script, inspiration_url, attempts, created_at, updated_at)
         VALUES (?, ?, ?, 'link', 'queued', ?, 0, ?, ?, ?, ?, 0, ?, ?)`,
        [id2, caller.keyId, caller.clientId, source, fields.title, fields.instructions, fields.video_script, fields.inspiration_url, now, now])
      await logEvent({ keyId: caller.keyId, clientId: caller.clientId, action, status: 202, uploadId: id2, detail: source, ip: caller.ip })
      await workOnLink(id2, Date.now() + LINK_SLICE_ON_REQUEST_MS, req, createProject)
      const row = await loadRow(id2, caller.clientId)
      send(res, row.status === 'done' ? 201 : row.status === 'failed' ? 422 : 202, {
        upload: view(row),
        next: row.status === 'done' || row.status === 'failed' ? null : `Our server keeps downloading in the background. Check GET /api/v1/imports/${id2} every 30–60 seconds until status is "done" (or "failed").`,
      })
      return
    }

    // Status (both kinds).
    if ((a === 'uploads' || a === 'imports') && id && rest.length === 2 && req.method === 'GET') {
      action = 'status'
      let row = await loadRow(id, caller.clientId)
      // Link downloads also move forward on status checks (cron jobs don't
      // run on preview deployments, and this keeps things going if it's late).
      if (row.kind === 'link' && (row.status === 'queued' || row.status === 'downloading')) {
        await workOnLink(id, Date.now() + LINK_SLICE_ON_REQUEST_MS, req, createProject)
        row = await loadRow(id, caller.clientId)
      }
      if (a === 'imports' && row.kind !== 'link') throw apiError(404, 'not_found', 'No link download with this id.')
      send(res, 200, { upload: view(row) })
      await logEvent({ keyId: caller.keyId, clientId: caller.clientId, action, status: 200, uploadId: id, ip: caller.ip })
      return
    }

    if (a === 'uploads' && id) {
      const row = await loadRow(id, caller.clientId)
      if (row.kind !== 'file') throw apiError(400, 'invalid_request', 'This is a link download; it has no pieces to send.')

      if (sub === 'parts' && rest.length === 3 && req.method === 'POST') {
        action = 'upload_parts'
        if (row.status !== 'uploading') throw apiError(409, 'not_uploading', `This upload is ${row.status}.`)
        const nums = body.part_numbers
        if (!Array.isArray(nums) || nums.length < 1 || nums.length > URLS_PER_CALL) throw apiError(400, 'invalid_request', `part_numbers must be a list of 1 to ${URLS_PER_CALL} piece numbers.`)
        if (!nums.every((n) => Number.isInteger(n) && n >= 1 && n <= row.part_count!)) throw apiError(400, 'invalid_request', `Piece numbers go from 1 to ${row.part_count}.`)
        send(res, 200, { parts: await partUrls(row, [...new Set(nums as number[])]), part_urls_valid_for_seconds: PART_URL_TTL })
        await logEvent({ keyId: caller.keyId, clientId: caller.clientId, action, status: 200, uploadId: id, detail: `${nums.length} addresses`, ip: caller.ip })
        return
      }

      if (sub === 'complete' && rest.length === 3 && req.method === 'POST') {
        action = 'upload_complete'
        if (row.status === 'done') { send(res, 200, { upload: view(row) }); return }   // asked twice
        if (row.status !== 'uploading') throw apiError(409, 'not_uploading', `This upload is ${row.status}.`)
        const list = body.parts
        if (!Array.isArray(list)) throw apiError(400, 'invalid_request', 'parts must be a list of {"part_number": n, "etag": "…"}.')
        const parts = list.map((p: any) => ({ partNumber: Number(p?.part_number), etag: typeof p?.etag === 'string' ? p.etag : '' }))
        const seen = new Set(parts.map((p) => p.partNumber))
        const missing: number[] = []
        for (let n = 1; n <= row.part_count! && missing.length < 20; n++) if (!seen.has(n)) missing.push(n)
        if (missing.length || parts.length !== row.part_count || parts.some((p) => !p.etag)) {
          throw apiError(400, 'missing_parts', `Every piece 1..${row.part_count} needs its ETag.${missing.length ? ` Missing: ${missing.join(', ')}${missing.length === 20 ? '…' : ''}.` : ''}`)
        }
        if (!(await claim("UPDATE api_uploads SET status = 'processing', updated_at = ? WHERE id = ? AND status = 'uploading'", [nowIso(), id]))) {
          send(res, 409, { error: 'This upload is already being finished. Check GET /api/v1/uploads/' + id + ' in a few seconds.', code: 'busy' }); return
        }
        try {
          await completeMultipartUpload(row.storage_key!, row.upload_id!, parts)
        } catch (e) {
          // Wrong/missing pieces: let the sender fix them and try again.
          await dbExecute("UPDATE api_uploads SET status = 'uploading', updated_at = ? WHERE id = ?", [nowIso(), id])
          throw apiError(400, 'parts_rejected', `Storage could not put the pieces together (${(e as Error).message}). Check that every piece was sent completely and its ETag is right, then try again.`)
        }
        try {
          const done = await finishIntoProject({ ...row, status: 'processing' }, req, createProject)
          send(res, 201, { upload: view(done) })
          await logEvent({ keyId: caller.keyId, clientId: caller.clientId, action, status: 201, uploadId: id, projectId: done.project_id, detail: row.file_name, ip: caller.ip })
        } catch (e: any) {
          await markFailed({ ...row, status: 'processing' }, e?.message ?? 'Could not finish', { deleteFile: true })
          throw apiError(e instanceof PermanentError ? 422 : 500, 'upload_failed', e?.message ?? 'Could not finish the upload.')
        }
        return
      }

      if (rest.length === 2 && req.method === 'DELETE') {
        action = 'upload_cancel'
        if (row.status !== 'uploading') throw apiError(409, 'not_uploading', `This upload is ${row.status}.`)
        await abortMultipartUpload(row.storage_key!, row.upload_id!).catch(() => {})
        await dbExecute("UPDATE api_uploads SET status = 'cancelled', updated_at = ?, finished_at = ? WHERE id = ?", [nowIso(), nowIso(), id])
        send(res, 200, { upload: view({ ...row, status: 'cancelled' }) })
        await logEvent({ keyId: caller.keyId, clientId: caller.clientId, action, status: 200, uploadId: id, ip: caller.ip })
        return
      }
    }

    throw apiError(404, 'not_found', 'Unknown API address. See the guide for the list of calls.')
  } catch (e: any) {
    sendApiError(res, e)
    if (caller) await logEvent({ keyId: caller.keyId, clientId: caller.clientId, action, status: e?.status ?? 500, detail: e?.message, ip: caller.ip })
    else console.warn(`[upload-api] refused ${req.method} /api/v1/${rest.join('/')} from ${callerIp(req)}: ${e?.code ?? e?.message}`)
  }
}

/** Vercel cron, once a minute: continue link downloads; tidy up. */
async function runImportsCron(req: VercelRequest, res: VercelResponse, createProject: CreateProject) {
  const secret = process.env.CRON_SECRET
  const localDev = !!process.env.LOCAL_DB_FILE
  if (!(secret && req.headers.authorization === `Bearer ${secret}`) && !localDev) { send(res, 401, { error: 'Unauthorized' }); return }
  const started = Date.now()
  const deadline = started + CRON_BUDGET_MS
  const worked: string[] = []
  try {
    const now = nowIso()
    const todo = await dbQuery<{ id: string }>(
      "SELECT id FROM api_uploads WHERE kind = 'link' AND status IN ('queued', 'downloading') AND (lease_until IS NULL OR lease_until < ?) ORDER BY created_at LIMIT 20", [now])
    for (const t of todo) {
      if (Date.now() > deadline - 5_000) break
      await workOnLink(t.id, deadline, req, createProject)
      worked.push(t.id)
    }
    // Direct uploads nobody finished: free the storage pieces.
    const cutoff = new Date(Date.now() - ABANDON_AFTER_DAYS * 86_400_000).toISOString()
    const stale = await dbQuery<UploadRow>("SELECT * FROM api_uploads WHERE kind = 'file' AND status = 'uploading' AND updated_at < ? LIMIT 50", [cutoff])
    for (const s of stale) {
      await abortMultipartUpload(s.storage_key!, s.upload_id!).catch(() => {})
      await dbExecute("UPDATE api_uploads SET status = 'cancelled', error = 'Not finished within 7 days', updated_at = ?, finished_at = ? WHERE id = ?", [nowIso(), nowIso(), s.id])
    }
    await pruneRateCounters()
    send(res, 200, { ok: true, worked: worked.length, abandoned: stale.length, ms: Date.now() - started })
  } catch (e) {
    console.error('[upload-api] cron failed', e)
    send(res, 500, { error: 'cron failed' })
  }
}

// ── /api/api-keys (full admins) ─────────────────────────────────────────────

export async function handleApiKeysAdminRoute(req: VercelRequest, res: VercelResponse, rest: string[]) {
  try {
    const { clerkUserId } = await requireCareAdmin(req)

    if (rest.length === 0 && req.method === 'GET') {
      const clientId = String(req.query.clientId ?? '')
      if (!clientId) throw apiError(400, 'invalid_request', 'clientId required')
      const keys = await dbQuery<any>(
        `SELECT k.id, k.name, k.key_prefix, k.created_at, k.last_used_at, k.revoked_at, c.full_name AS created_by_name
         FROM api_keys k LEFT JOIN profiles c ON c.id = k.created_by WHERE k.client_id = ? ORDER BY k.created_at DESC`, [clientId])
      const events = await dbQuery<any>(
        `SELECT e.id, e.key_id, e.action, e.status, e.detail, e.project_id, e.ip, e.created_at, k.name AS key_name
         FROM api_key_events e LEFT JOIN api_keys k ON k.id = e.key_id WHERE e.client_id = ? ORDER BY e.created_at DESC LIMIT 40`, [clientId])
      send(res, 200, { keys, events }); return
    }

    if (rest.length === 0 && req.method === 'POST') {
      const clientId = String(req.body?.clientId ?? '')
      const name = String(req.body?.name ?? '').trim().slice(0, 80)
      if (!name) throw apiError(400, 'invalid_request', 'Give the key a name (e.g. "Anton\'s upload agent").')
      const [client] = await dbQuery<{ id: string; role: string }>('SELECT id, role FROM profiles WHERE id = ?', [clientId])
      if (!client || client.role !== 'client') throw apiError(400, 'invalid_request', 'Keys can only be made for client accounts.')
      const { key, hash, prefix } = generateKey()
      const id = newId()
      await dbExecute('INSERT INTO api_keys (id, client_id, name, key_hash, key_prefix, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, clientId, name, hash, prefix, clerkUserId, nowIso()])
      await logEvent({ keyId: id, clientId, action: 'key_created', status: 201, detail: name, ip: callerIp(req) })
      send(res, 201, { id, name, prefix, key }); return
    }

    if (rest.length === 2 && rest[1] === 'revoke' && req.method === 'POST') {
      const [k] = await dbQuery<{ id: string; client_id: string; revoked_at: string | null }>('SELECT id, client_id, revoked_at FROM api_keys WHERE id = ?', [rest[0]])
      if (!k) throw apiError(404, 'not_found', 'Key not found')
      if (!k.revoked_at) {
        await dbExecute('UPDATE api_keys SET revoked_at = ?, revoked_by = ? WHERE id = ?', [nowIso(), clerkUserId, k.id])
        await logEvent({ keyId: k.id, clientId: k.client_id, action: 'key_revoked', status: 200, ip: callerIp(req) })
      }
      send(res, 200, { ok: true }); return
    }

    throw apiError(404, 'not_found', 'Not found')
  } catch (e: any) {
    send(res, e?.status ?? 500, { error: e?.message ?? 'Internal error' })
  }
}

export type { ApiError }
