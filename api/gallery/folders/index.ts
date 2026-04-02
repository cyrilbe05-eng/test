import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../../_helpers/auth'
import { dbQuery, dbExecute, newId, nowIso } from '../../_helpers/db'

interface GalleryFolder {
  id: string
  owner_id: string
  name: string
  parent_id: string | null
  created_at: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    if (req.method === 'GET') {
      let ownerId: string

      if (profile.role === 'client') {
        ownerId = clerkUserId
      } else {
        ownerId = (req.query.ownerId as string) ?? clerkUserId
      }

      const folders = await dbQuery<GalleryFolder>(
        `SELECT * FROM gallery_folders WHERE owner_id = ? ORDER BY created_at ASC`,
        [ownerId]
      )
      res.json(folders)
      return
    }

    // POST — create a new folder
    const { name, parentId } = req.body

    if (!name) {
      res.status(400).json({ error: 'name is required' })
      return
    }

    // Admin can create a folder on behalf of a client by passing ownerId in body
    let ownerId: string
    if (profile.role === 'admin' && req.body.ownerId) {
      ownerId = req.body.ownerId
    } else {
      ownerId = clerkUserId
    }

    const id = newId()
    const now = nowIso()

    await dbExecute(
      `INSERT INTO gallery_folders (id, owner_id, name, parent_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, ownerId, name, parentId ?? null, now]
    )

    const rows = await dbQuery<GalleryFolder>('SELECT * FROM gallery_folders WHERE id = ?', [id])
    res.status(201).json(rows[0])
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
