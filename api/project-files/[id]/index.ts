import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../../_helpers/auth'
import { dbQuery, dbExecute } from '../../_helpers/db'
import { deleteObject } from '../../_helpers/r2'
import type { ProjectFile } from '../../../src/types'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { profile } = await requireAuth(req)
    requireRole(profile, 'admin')

    const fileId = req.query.id as string
    const rows = await dbQuery<ProjectFile>('SELECT * FROM project_files WHERE id = ?', [fileId])
    if (!rows[0]) {
      res.status(404).json({ error: 'File not found' })
      return
    }

    await dbExecute('DELETE FROM project_files WHERE id = ?', [fileId])
    await deleteObject(rows[0].storage_key)
    res.json({ ok: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
