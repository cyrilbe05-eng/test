import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole, createClerkAdmin } from '../../_helpers/auth'
import { dbQuery, dbExecute } from '../../_helpers/db'
import { deleteObject } from '../../_helpers/r2'
import type { Profile, ProjectFile } from '../../../src/types'

interface ProjectRow { id: string }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { profile: callerProfile } = await requireAuth(req)
    requireRole(callerProfile, 'admin')

    const targetId = req.query.id as string

    // Verify target exists and is not an admin
    const [target] = await dbQuery<Profile>('SELECT * FROM profiles WHERE id = ?', [targetId])
    if (!target) {
      res.status(404).json({ error: 'User not found' })
      return
    }
    if (target.role === 'admin') {
      res.status(403).json({ error: 'Cannot delete an admin account' })
      return
    }

    // 1. Collect all R2 objects belonging to this user's projects (client) or uploaded by them (team)
    let storageKeys: string[] = []

    if (target.role === 'client') {
      // All files in all projects owned by this client
      const files = await dbQuery<ProjectFile>(
        `SELECT pf.storage_key
         FROM project_files pf
         JOIN projects p ON p.id = pf.project_id
         WHERE p.client_id = ?`,
        [targetId]
      )
      storageKeys = files.map((f) => f.storage_key)
    } else {
      // Team member: only delete files they personally uploaded (deliverables)
      const files = await dbQuery<ProjectFile>(
        'SELECT storage_key FROM project_files WHERE uploader_id = ?',
        [targetId]
      )
      storageKeys = files.map((f) => f.storage_key)
    }

    // 2. Delete all R2 objects (fire and forget errors — don't block deletion if R2 is slow)
    await Promise.allSettled(storageKeys.map((key) => deleteObject(key)))

    // 3. Cascade-delete D1 data
    if (target.role === 'client') {
      // Get all project IDs for this client
      const projects = await dbQuery<ProjectRow>(
        'SELECT id FROM projects WHERE client_id = ?',
        [targetId]
      )
      for (const project of projects) {
        // project_files, project_assignments, timeline_comments, notifications
        // all have ON DELETE CASCADE from projects, so deleting the project is enough
        await dbExecute('DELETE FROM projects WHERE id = ?', [project.id])
      }
    } else {
      // Team member: remove their file uploads (already deleted from R2 above)
      await dbExecute('DELETE FROM project_files WHERE uploader_id = ?', [targetId])
      // Remove their assignments
      await dbExecute('DELETE FROM project_assignments WHERE team_member_id = ?', [targetId])
    }

    // Delete gallery files from R2 and D1
    const galleryFiles = await dbQuery<{ storage_key: string }>(
      'SELECT storage_key FROM gallery_files WHERE owner_id = ?',
      [targetId]
    )
    await Promise.allSettled(galleryFiles.map((f) => deleteObject(f.storage_key)))
    await dbExecute('DELETE FROM gallery_files WHERE owner_id = ?', [targetId])
    await dbExecute('DELETE FROM gallery_folders WHERE owner_id = ?', [targetId])

    // Delete notifications sent to this user
    await dbExecute('DELETE FROM notifications WHERE recipient_id = ?', [targetId])
    // Delete timeline comments they authored
    await dbExecute('DELETE FROM timeline_comments WHERE author_id = ?', [targetId])
    // Delete chat group messages (group_id path — connection messages cascade via chat_connections)
    await dbExecute('DELETE FROM chat_messages WHERE sender_id = ? AND group_id IS NOT NULL', [targetId])
    // Delete chat groups they created (members + remaining messages cascade via chat_groups)
    await dbExecute('DELETE FROM chat_groups WHERE created_by = ?', [targetId])
    // Delete the profile (cascades: chat_connections → messages, group memberships)
    await dbExecute('DELETE FROM profiles WHERE id = ?', [targetId])

    // 4. Remove from Clerk allowlist + delete Clerk user
    const clerk = createClerkAdmin()
    try {
      // Remove from allowlist
      const allowlist = await clerk.allowlistIdentifiers.getAllowlistIdentifierList()
      const entry = allowlist.data.find((e) => e.identifier === target.email)
      if (entry) {
        await clerk.allowlistIdentifiers.deleteAllowlistIdentifier(entry.id)
      }
    } catch {
      // Non-fatal: allowlist entry may not exist
    }
    await clerk.users.deleteUser(targetId)

    res.json({ ok: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
