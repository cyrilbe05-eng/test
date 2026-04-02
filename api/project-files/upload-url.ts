import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_helpers/auth'
import { dbQuery } from '../_helpers/db'
import { getPresignedUploadUrl } from '../_helpers/r2'
import { sanitizeFileName } from '../../src/lib/utils'

interface StorageRow { used_mb: number }
interface PlanRow { storage_limit_mb: number }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { profile } = await requireAuth(req)

    const { projectId, fileType, fileName, mimeType, fileSize } = req.body

    if (!projectId || !fileType || !fileName) {
      res.status(400).json({ error: 'projectId, fileType, and fileName required' })
      return
    }

    // Enforce per-client storage limit (only for client uploaders who have a plan)
    if (profile.role === 'client' && profile.plan_id) {
      const [planRow] = await dbQuery<PlanRow>(
        'SELECT storage_limit_mb FROM plans WHERE id = ?',
        [profile.plan_id]
      )
      if (planRow && planRow.storage_limit_mb !== -1) {
        // Sum of all file sizes uploaded by this client across all their projects
        const [usageRow] = await dbQuery<StorageRow>(
          `SELECT COALESCE(SUM(pf.file_size), 0) / 1048576.0 AS used_mb
           FROM project_files pf
           JOIN projects p ON p.id = pf.project_id
           WHERE p.client_id = ?`,
          [profile.id]
        )
        const usedMb = usageRow?.used_mb ?? 0
        const incomingMb = fileSize ? fileSize / 1048576.0 : 0
        if (usedMb + incomingMb > planRow.storage_limit_mb) {
          res.status(403).json({ error: 'storage_limit_reached' })
          return
        }
      }
    }

    const key = `projects/${projectId}/${fileType}/${Date.now()}-${sanitizeFileName(fileName)}`
    const uploadUrl = await getPresignedUploadUrl(key, mimeType ?? 'application/octet-stream')

    res.json({ uploadUrl, key })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
