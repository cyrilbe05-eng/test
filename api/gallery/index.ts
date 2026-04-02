import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_helpers/auth'
import { dbQuery } from '../_helpers/db'

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

    let ownerId: string

    if (profile.role === 'client') {
      // Clients can only ever see their own files
      ownerId = clerkUserId
    } else {
      // Admin and team can pass ownerId to view any client's gallery
      ownerId = (req.query.ownerId as string) ?? clerkUserId
    }

    const folderId = req.query.folderId as string | undefined

    let files: GalleryFile[]
    if (folderId) {
      files = await dbQuery<GalleryFile>(
        `SELECT * FROM gallery_files WHERE owner_id = ? AND folder_id = ? ORDER BY created_at DESC`,
        [ownerId, folderId]
      )
    } else {
      files = await dbQuery<GalleryFile>(
        `SELECT * FROM gallery_files WHERE owner_id = ? ORDER BY created_at DESC`,
        [ownerId]
      )
    }

    res.json(files)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
