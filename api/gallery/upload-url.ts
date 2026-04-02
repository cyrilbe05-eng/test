import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_helpers/auth'
import { dbQuery } from '../_helpers/db'
import { getPresignedUploadUrl } from '../_helpers/r2'
import { sanitizeFileName } from '../../src/lib/utils'

interface StorageRow { used_bytes: number }
interface PlanRow { storage_limit_mb: number }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    const { fileName, mimeType, fileSize, folderId } = req.body

    if (!fileName || !mimeType) {
      res.status(400).json({ error: 'fileName and mimeType are required' })
      return
    }

    // Enforce per-client storage limit (only for client uploaders who have a plan)
    if (profile.role === 'client' && profile.plan_id) {
      const [planRow] = await dbQuery<PlanRow>(
        'SELECT storage_limit_mb FROM plans WHERE id = ?',
        [profile.plan_id]
      )
      if (planRow && planRow.storage_limit_mb !== -1) {
        const [usageRow] = await dbQuery<StorageRow>(
          `SELECT COALESCE(SUM(file_size), 0) AS used_bytes
           FROM gallery_files
           WHERE owner_id = ?`,
          [clerkUserId]
        )
        const usedMb = (usageRow?.used_bytes ?? 0) / 1048576.0
        const incomingMb = fileSize ? fileSize / 1048576.0 : 0
        if (usedMb + incomingMb > planRow.storage_limit_mb) {
          res.status(403).json({ error: 'storage_limit_reached' })
          return
        }
      }
    }

    const key = `gallery/${clerkUserId}/${Date.now()}-${sanitizeFileName(fileName)}`
    const uploadUrl = await getPresignedUploadUrl(key, mimeType ?? 'application/octet-stream')

    res.json({ uploadUrl, storageKey: key })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
