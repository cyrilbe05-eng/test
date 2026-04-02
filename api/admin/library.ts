import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../_helpers/auth'
import { dbQuery } from '../_helpers/db'

interface LibraryFile {
  id: string
  project_id: string
  project_title: string
  client_id: string
  client_name: string
  uploader_id: string
  uploader_name: string
  file_type: string
  storage_key: string
  file_name: string
  file_size: number | null
  mime_type: string | null
  approved: number
  created_at: string
}

interface StorageStat {
  client_id: string
  client_name: string
  plan_name: string | null
  storage_limit_mb: number | null
  used_bytes: number
  file_count: number
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { profile } = await requireAuth(req)
    requireRole(profile, 'admin')

    const clientId = req.query.client_id as string | undefined
    const fileType = req.query.file_type as string | undefined

    // Build files query with optional filters
    let sql = `
      SELECT
        pf.id,
        pf.project_id,
        p.title        AS project_title,
        p.client_id,
        c.full_name    AS client_name,
        pf.uploader_id,
        u.full_name    AS uploader_name,
        pf.file_type,
        pf.storage_key,
        pf.file_name,
        pf.file_size,
        pf.mime_type,
        pf.approved,
        pf.created_at
      FROM project_files pf
      JOIN projects p   ON p.id  = pf.project_id
      JOIN profiles c   ON c.id  = p.client_id
      JOIN profiles u   ON u.id  = pf.uploader_id
      WHERE 1=1
    `
    const params: unknown[] = []
    if (clientId) { sql += ' AND p.client_id = ?'; params.push(clientId) }
    if (fileType) { sql += ' AND pf.file_type = ?'; params.push(fileType) }
    sql += ' ORDER BY pf.created_at DESC LIMIT 500'

    const files = await dbQuery<LibraryFile>(sql, params)

    // Storage stats per client
    const stats = await dbQuery<StorageStat>(`
      SELECT
        c.id            AS client_id,
        c.full_name     AS client_name,
        pl.name         AS plan_name,
        pl.storage_limit_mb,
        COALESCE(SUM(pf.file_size), 0) AS used_bytes,
        COUNT(pf.id)    AS file_count
      FROM profiles c
      LEFT JOIN plans pl         ON pl.id = c.plan_id
      LEFT JOIN projects pr      ON pr.client_id = c.id
      LEFT JOIN project_files pf ON pf.project_id = pr.id
      WHERE c.role = 'client'
      GROUP BY c.id
      ORDER BY used_bytes DESC
    `)

    res.json({ files: files.map((f) => ({ ...f, approved: Boolean(f.approved) })), stats })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
