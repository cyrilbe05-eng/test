// Batch upload (clients, only while the admin "Batch upload" switch is on).
//
// Each file first goes up with the normal resumable upload, but into a
// waiting spot of the client's own: batch/{clientId}/{ts}-{rand}-{name}
// (see handleMultipartCreate's `batch` branch). When it has fully arrived,
// the page asks for its project:
//
//   POST /api/batch/projects   { key, fileName, fileSize, mimeType, title,
//                                inspiration_url?, video_script?, instructions?,
//                                first? }  → { id, title }
//        Creates the project through the SAME handler as a normal "New
//        video" (same checks, status, limits), then attaches the file as its
//        footage. `first` = the batch's first project: admins get one
//        notification that counts the batch ("X uploaded 3 videos") instead
//        of one per video.
//   POST /api/batch/done       { first }  one email to admins for the batch
//
// Nothing here is used by a single video upload.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../auth.js'
import { dbExecute, dbQuery, newId, nowIso } from '../db.js'
import { deleteObject, headObject } from '../r2.js'
import { inferMimeType } from '../mime.js'
import { sendEmailNotifications, projectUrl } from '../email.js'
import { loadSettings } from '../settings/routes.js'

const fail = (status: number, message: string) => Object.assign(new Error(message), { status })

/** A batch waiting-spot key belonging to this client. */
export const isBatchKeyOf = (key: unknown, clientId: string): key is string =>
  typeof key === 'string' && key.startsWith(`batch/${clientId}/`) && /^batch\/[^/]+\/[^/]+$/.test(key)

/** Plan storage check for a batch file (same rule as project uploads). */
export async function batchStorageAllowed(profile: { id: string; plan_id?: string | null }, fileSize: unknown): Promise<boolean> {
  if (!profile.plan_id) return true
  const [plan] = await dbQuery<{ storage_limit_mb: number }>('SELECT storage_limit_mb FROM plans WHERE id = ?', [profile.plan_id])
  if (!plan || plan.storage_limit_mb === -1) return true
  const [usage] = await dbQuery<{ used_mb: number }>(
    `SELECT COALESCE(SUM(pf.file_size), 0) / 1048576.0 AS used_mb
     FROM project_files pf JOIN projects p ON p.id = pf.project_id WHERE p.client_id = ?`, [profile.id])
  const incoming = typeof fileSize === 'number' && fileSize > 0 ? fileSize / 1048576.0 : 0
  return (usage?.used_mb ?? 0) + incoming <= plan.storage_limit_mb
}

type CreateProject = (req: VercelRequest, res: VercelResponse) => Promise<void>

/** Runs the normal project-creation handler and captures its answer.
 *  `__batchQuiet` (set here only, never from the request body) skips its
 *  per-project admin notification: the batch sends a grouped one. */
async function createLikeNewVideo(createProject: CreateProject, req: VercelRequest, body: Record<string, unknown>) {
  let status = 200
  let out: any = null
  const res = {
    status(s: number) { status = s; return res },
    json(v: unknown) { out = v; return res },
    setHeader() { return res },
  } as unknown as VercelResponse
  const inner = Object.assign(Object.create(req), { body, method: 'POST', __batchQuiet: true }) as VercelRequest
  await createProject(inner, res)
  return { status, out }
}

async function admins() {
  return dbQuery<{ id: string }>('SELECT id FROM profiles WHERE role = ? AND disabled = 0', ['admin'])
}

/** How many projects this client has made since the batch's first one. */
async function batchCount(clientId: string, first: { created_at: string }) {
  const [row] = await dbQuery<{ n: number }>('SELECT COUNT(*) AS n FROM projects WHERE client_id = ? AND created_at >= ?', [clientId, first.created_at])
  return row?.n ?? 1
}

export async function handleBatchRoute(req: VercelRequest, res: VercelResponse, rest: string[], createProject: CreateProject) {
  try {
    if (req.method !== 'POST') throw fail(405, 'Method not allowed')
    const { clerkUserId, profile } = await requireAuth(req)
    if (profile.role !== 'client') throw fail(403, 'Forbidden')
    if (!(await loadSettings()).batchUpload) throw fail(403, 'batch_upload_off')
    const body = req.body ?? {}

    if (rest.length === 1 && rest[0] === 'projects') {
      const { key, fileName, fileSize, mimeType } = body
      if (!isBatchKeyOf(key, clerkUserId)) throw fail(400, 'invalid key')
      if (typeof fileName !== 'string' || !fileName.trim()) throw fail(400, 'fileName required')

      // Asked twice (a network blip after it worked): same project back.
      const [done] = await dbQuery<{ project_id: string; title: string }>(
        'SELECT f.project_id, p.title FROM project_files f JOIN projects p ON p.id = f.project_id WHERE f.storage_key = ? AND p.client_id = ?', [key, clerkUserId])
      if (done) { res.status(201).json({ id: done.project_id, title: done.title }); return }

      const head = await headObject(key)
      if (!head) throw fail(400, 'file not uploaded')

      const made = await createLikeNewVideo(createProject, req, {
        title: body.title, inspiration_url: body.inspiration_url ?? null, video_script: body.video_script ?? null, instructions: body.instructions,
      })
      if (made.status >= 400 || !made.out?.id) {
        // Refused for good (plan limit, full package…): the waiting file goes.
        if (made.status === 403 || made.status === 400) await deleteObject(key).catch(() => {})
        res.status(made.status >= 400 ? made.status : 500).json(made.out ?? { error: 'Could not create the project' }); return
      }
      const project = made.out as { id: string; title: string; created_at: string }

      // Attach the file as the footage (same row a normal upload writes).
      try {
        await dbExecute(
          `INSERT INTO project_files (id, project_id, uploader_id, file_type, storage_key, file_name, file_size, mime_type, approved, created_at)
           VALUES (?, ?, ?, 'source_video', ?, ?, ?, ?, 0, ?)`,
          [newId(), project.id, clerkUserId, key, fileName, typeof fileSize === 'number' ? fileSize : head.size, inferMimeType(fileName, mimeType), nowIso()])
      } catch (e) {
        // No footage → no project: asking again starts clean.
        await dbExecute('DELETE FROM projects WHERE id = ?', [project.id]).catch(() => {})
        throw e
      }

      // One notification for the whole batch.
      const now = nowIso()
      const [first] = typeof body.first === 'string' && body.first !== project.id
        ? await dbQuery<{ id: string; created_at: string }>('SELECT id, created_at FROM projects WHERE id = ? AND client_id = ?', [body.first, clerkUserId])
        : []
      if (first) {
        const n = await batchCount(clerkUserId, first)
        await dbExecute("UPDATE notifications SET message = ?, read = 0, created_at = ? WHERE project_id = ? AND type = 'project_created'",
          [`${profile.full_name} uploaded ${n} videos`, now, first.id])
      } else {
        const msg = `New project submitted: "${project.title}"`
        await Promise.all((await admins()).map((a) => dbExecute(
          'INSERT INTO notifications (id, recipient_id, project_id, type, message, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
          [newId(), a.id, project.id, 'project_created', msg, now])))
      }
      res.status(201).json({ id: project.id, title: project.title }); return
    }

    if (rest.length === 1 && rest[0] === 'done') {
      const [first] = await dbQuery<{ id: string; title: string; created_at: string }>(
        'SELECT id, title, created_at FROM projects WHERE id = ? AND client_id = ?', [body.first, clerkUserId])
      if (!first) throw fail(404, 'Not found')
      const n = await batchCount(clerkUserId, first)
      const subject = n > 1 ? `${profile.full_name} uploaded ${n} videos` : `New project submitted: "${first.title}"`
      await sendEmailNotifications((await admins()).map((a) => ({
        recipientId: a.id, subject, text: `${subject}\n\nView it here: ${projectUrl(first.id, 'admin')}`,
      })))
      res.json({ ok: true }); return
    }

    throw fail(404, 'Not found')
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
