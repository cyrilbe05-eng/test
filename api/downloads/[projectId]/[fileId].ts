import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole } from '../../_helpers/auth'
import { dbQuery } from '../../_helpers/db'
import { getPresignedDownloadUrl } from '../../_helpers/r2'
import type { Project, ProjectFile } from '../../../src/types'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    requireRole(profile, 'client')

    const { projectId, fileId } = req.query as { projectId: string; fileId: string }

    // Verify project belongs to caller + is approved
    const projects = await dbQuery<Project>(
      'SELECT * FROM projects WHERE id = ? AND client_id = ?',
      [projectId, clerkUserId]
    )
    const project = projects[0]
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }
    if (project.status !== 'client_approved') {
      res.status(403).json({ error: 'Project not approved' })
      return
    }

    // Verify file is an approved deliverable
    const files = await dbQuery<ProjectFile>(
      "SELECT * FROM project_files WHERE id = ? AND project_id = ? AND file_type = 'deliverable'",
      [fileId, projectId]
    )
    const file = files[0]
    if (!file) {
      res.status(404).json({ error: 'File not found' })
      return
    }
    if (!file.approved) {
      res.status(403).json({ error: 'File not approved for download' })
      return
    }

    const signedUrl = await getPresignedDownloadUrl(file.storage_key, 3600)
    res.json({ signedUrl })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
