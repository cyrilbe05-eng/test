import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../../_helpers/auth'
import { dbQuery } from '../../_helpers/db'
import { getPresignedDownloadUrl } from '../../_helpers/r2'

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
  if (req.method !== 'GET') {
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

    // Owner always allowed
    if (file.owner_id === clerkUserId) {
      // fall through to URL generation
    } else if (profile.role === 'admin') {
      // admins can access any file
    } else if (profile.role === 'team') {
      // team can only access files belonging to clients they are assigned to
      const assigned = await dbQuery<{ id: string }>(
        `SELECT pa.id FROM project_assignments pa
         JOIN projects p ON p.id = pa.project_id
         WHERE pa.team_member_id = ? AND p.client_id = ?
         LIMIT 1`,
        [clerkUserId, file.owner_id]
      )
      if (!assigned[0]) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
    } else {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    const url = await getPresignedDownloadUrl(file.storage_key)
    res.json({ url })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
