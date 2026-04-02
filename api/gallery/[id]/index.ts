import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../../_helpers/auth'
import { dbQuery, dbExecute } from '../../_helpers/db'
import { deleteObject } from '../../_helpers/r2'

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
  if (req.method !== 'DELETE' && req.method !== 'PATCH') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    const fileId = req.query.id as string
    const rows = await dbQuery<GalleryFile>('SELECT * FROM gallery_files WHERE id = ?', [fileId])

    if (!rows[0]) {
      res.status(404).json({ error: 'File not found' })
      return
    }

    const file = rows[0]

    // Only the owner or an admin can modify or delete
    if (profile.role !== 'admin' && file.owner_id !== clerkUserId) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    if (req.method === 'PATCH') {
      // Move file to a different folder (folderId: string | null)
      const { folderId } = req.body as { folderId: string | null }
      await dbExecute('UPDATE gallery_files SET folder_id = ? WHERE id = ?', [folderId ?? null, fileId])
      const updated = await dbQuery<GalleryFile>('SELECT * FROM gallery_files WHERE id = ?', [fileId])
      res.json(updated[0])
      return
    }

    await deleteObject(file.storage_key)
    await dbExecute('DELETE FROM gallery_files WHERE id = ?', [fileId])

    res.json({ success: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
