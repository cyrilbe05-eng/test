// Gallery clip thumbnails (migration 018). The frame is grabbed in the
// browser (no video processing on the server) and stored as a small JPEG in
// R2 next to the clip:
//   POST /api/gallery/:id/thumbnail          → { uploadUrl, key }   (then PUT the JPEG)
//   PUT  /api/gallery/:id/thumbnail {key}    → saves it on the file
//   GET  /api/gallery/thumbnails?ownerId=…   → { [fileId]: signedUrl }
// Same access as reading the clip itself: its owner, admins, team.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../auth.js'
import { dbQuery, dbExecute } from '../db.js'
import { getPresignedUploadUrl, getPresignedDownloadUrl, headObject, deleteObject } from '../r2.js'
import { sendError } from './access.js'

const MAX_BYTES = 2 * 1024 * 1024
const URL_TTL = 60 * 60 * 6

type Who = { clerkUserId: string; profile: { role: string } }
const canRead = (w: Who, ownerId: string) => ownerId === w.clerkUserId || w.profile.role === 'admin' || w.profile.role === 'team'
const prefix = (ownerId: string, fileId: string) => `gallery-thumbs/${ownerId}/${fileId}-`
const missingColumn = (e: unknown) => /no such column|no column named/i.test((e as Error)?.message ?? '')

export async function handleGalleryThumbnail(req: VercelRequest, res: VercelResponse, fileId: string) {
  try {
    const who = await requireAuth(req)
    const [file] = await dbQuery<{ id: string; owner_id: string; thumb_key: string | null }>('SELECT * FROM gallery_files WHERE id = ?', [fileId])
    if (!file) { res.status(404).json({ error: 'File not found' }); return }
    if (!canRead(who, file.owner_id)) { res.status(403).json({ error: 'Forbidden' }); return }

    if (req.method === 'POST') {
      const key = `${prefix(file.owner_id, file.id)}${crypto.randomUUID()}.jpg`
      res.json({ key, uploadUrl: await getPresignedUploadUrl(key, 'image/jpeg', 600) })
      return
    }
    if (req.method === 'PUT') {
      const key = String((req.body as { key?: string })?.key ?? '')
      if (!key.startsWith(prefix(file.owner_id, file.id)) || !key.endsWith('.jpg')) { res.status(400).json({ error: 'Bad key' }); return }
      const head = await headObject(key)
      if (!head || head.size === 0 || head.size > MAX_BYTES) { res.status(400).json({ error: 'Thumbnail missing or too big' }); return }
      await dbExecute('UPDATE gallery_files SET thumb_key = ? WHERE id = ?', [key, file.id])
      if (file.thumb_key && file.thumb_key !== key) await deleteObject(file.thumb_key).catch(() => {})
      res.json({ ok: true })
      return
    }
    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    if (missingColumn(e)) { res.status(503).json({ error: 'Thumbnails need database migration 018' }); return }
    sendError(res, e)
  }
}

export async function handleGalleryThumbnails(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
    const who = await requireAuth(req)
    const ownerId = who.profile.role === 'client' ? who.clerkUserId : String(req.query.ownerId ?? who.clerkUserId)
    if (!canRead(who, ownerId)) { res.status(403).json({ error: 'Forbidden' }); return }
    let rows: { id: string; thumb_key: string }[] = []
    try {
      rows = await dbQuery('SELECT id, thumb_key FROM gallery_files WHERE owner_id = ? AND thumb_key IS NOT NULL', [ownerId])
    } catch (e) {
      if (!missingColumn(e)) throw e // before migration 018: no thumbnails yet
    }
    const out: Record<string, string> = {}
    await Promise.all(rows.map(async (r) => { out[r.id] = await getPresignedDownloadUrl(r.thumb_key, URL_TTL, undefined, 'image/jpeg') }))
    res.json(out)
  } catch (e) { sendError(res, e) }
}
