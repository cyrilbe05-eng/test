import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../../../_helpers/auth'
import { dbQuery, dbExecute } from '../../../_helpers/db'

interface GalleryFolder {
  id: string
  owner_id: string
  name: string
  parent_id: string | null
  created_at: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    const folderId = req.query.id as string
    const rows = await dbQuery<GalleryFolder>('SELECT * FROM gallery_folders WHERE id = ?', [folderId])

    if (!rows[0]) {
      res.status(404).json({ error: 'Folder not found' })
      return
    }

    const folder = rows[0]

    // Only the owner or an admin can modify or delete
    if (profile.role !== 'admin' && folder.owner_id !== clerkUserId) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    if (req.method === 'PATCH') {
      const { name } = req.body

      if (!name) {
        res.status(400).json({ error: 'name is required' })
        return
      }

      await dbExecute('UPDATE gallery_folders SET name = ? WHERE id = ?', [name, folderId])

      const updated = await dbQuery<GalleryFolder>('SELECT * FROM gallery_folders WHERE id = ?', [folderId])
      res.json(updated[0])
      return
    }

    // DELETE — null out folder_id on files in this folder, then delete folder
    // (child folders will cascade via the FK ON DELETE CASCADE)
    await dbExecute('UPDATE gallery_files SET folder_id = NULL WHERE folder_id = ?', [folderId])
    await dbExecute('DELETE FROM gallery_folders WHERE id = ?', [folderId])

    res.json({ success: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
