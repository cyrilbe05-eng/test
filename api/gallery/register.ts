import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_helpers/auth'
import { dbExecute, dbQuery, newId, nowIso } from '../_helpers/db'

interface GalleryFile {
  id: string
  owner_id: string
  folder_id: string | null
  file_name: string
  file_size: number
  mime_type: string
  storage_key: string
  created_at: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId } = await requireAuth(req)

    const { fileName, mimeType, fileSize, storageKey, folderId } = req.body

    if (!fileName || !mimeType || !storageKey) {
      res.status(400).json({ error: 'fileName, mimeType, and storageKey are required' })
      return
    }

    const id = newId()
    const now = nowIso()

    await dbExecute(
      `INSERT INTO gallery_files (id, owner_id, folder_id, file_name, file_size, mime_type, storage_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, clerkUserId, folderId ?? null, fileName, fileSize ?? 0, mimeType, storageKey, now]
    )

    const rows = await dbQuery<GalleryFile>('SELECT * FROM gallery_files WHERE id = ?', [id])
    res.status(201).json(rows[0])
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
