import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole, signJwt, hashPassword, comparePassword } from './_helpers/auth.js'
import { dbQuery, dbExecute, newId, nowIso } from './_helpers/db.js'
import { getPresignedUploadUrl, getPresignedDownloadUrl, deleteObject } from './_helpers/r2.js'
import { ok, err, handleError } from './_helpers/respond.js'
import { sanitizeFileName } from '../src/lib/utils.js'
import type { Profile, Project, ProjectFile, Plan, Notification, Deadline, TeamNote, CalendarEvent } from '../src/types'

// ─────────────────────────────────────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────────────────────────────────────

interface UserRow extends Profile {
  plan_name: string | null
  storage_limit_mb: number | null
  used_bytes: number
}

async function handleGetUsers(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { profile } = await requireAuth(req)
    requireRole(profile, 'admin')

    const users = await dbQuery<UserRow>(
      `SELECT p.*,
              pl.name               AS plan_name,
              pl.storage_limit_mb,
              COALESCE((
                SELECT SUM(pf.file_size)
                FROM project_files pf
                JOIN projects pr ON pr.id = pf.project_id
                WHERE pr.client_id = p.id
              ), 0) AS used_bytes
       FROM profiles p
       LEFT JOIN plans pl ON p.plan_id = pl.id
       ORDER BY p.created_at DESC`
    )

    const mapped = users.map(({ plan_name, storage_limit_mb, ...u }) => ({
      ...u,
      password_changed: Boolean(u.password_changed),
      disabled: Boolean(u.disabled),
      plans: plan_name ? { name: plan_name, storage_limit_mb: storage_limit_mb ?? -1 } : null,
    }))

    res.json(mapped)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleGetClients(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { profile } = await requireAuth(req)
    if (profile.role !== 'admin' && profile.role !== 'team') {
      res.status(403).json({ error: 'Forbidden' }); return
    }

    const clients = await dbQuery<Profile>(
      'SELECT * FROM profiles WHERE role = ? AND disabled = 0 ORDER BY full_name ASC',
      ['client']
    )

    const shaped = clients.map((c) => ({
      ...c,
      password_changed: Boolean(c.password_changed),
      disabled: Boolean(c.disabled),
    }))

    res.json(shaped)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleGetTeam(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { profile } = await requireAuth(req)
    requireRole(profile, 'admin')

    const members = await dbQuery<Profile>(
      'SELECT * FROM profiles WHERE role = ? AND disabled = 0 ORDER BY full_name ASC',
      ['team']
    )

    const shaped = members.map((m) => ({
      ...m,
      password_changed: Boolean(m.password_changed),
      disabled: Boolean(m.disabled),
    }))

    res.json(shaped)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

function generatePassword(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
  const arr = new Uint8Array(length)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => charset[b % charset.length]).join('')
}

async function handleCreateUser(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { profile: callerProfile } = await requireAuth(req)
    requireRole(callerProfile, 'admin')

    const { full_name, email, phone, role, plan_id, client_id_label } = req.body

    if (!full_name || !email || !role) {
      res.status(400).json({ error: 'Missing required fields' }); return
    }
    if (!['client', 'team'].includes(role)) {
      res.status(400).json({ error: 'Invalid role' }); return
    }
    if (role === 'client' && !plan_id) {
      res.status(400).json({ error: 'plan_id required for client role' }); return
    }

    const userId = newId()
    const now = nowIso()
    const tempPassword = generatePassword(16)
    const tempHash = await hashPassword(tempPassword)

    await dbExecute(
      `INSERT INTO profiles
         (id, role, full_name, email, phone, plan_id, client_id_label, password_hash, password_changed, disabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      [
        userId, role, full_name, email,
        phone ?? null,
        plan_id ?? null,
        role === 'client' ? (client_id_label ?? null) : null,
        tempHash,
        now, now,
      ]
    )

    res.status(201).json({ id: userId, email, temporary_password: tempPassword })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

interface ProjectRow { id: string }

async function handleDeleteUser(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { profile: callerProfile } = await requireAuth(req)
    requireRole(callerProfile, 'admin')

    const targetId = req.query.id as string

    const [target] = await dbQuery<Profile>('SELECT * FROM profiles WHERE id = ?', [targetId])
    if (!target) { res.status(404).json({ error: 'User not found' }); return }
    if (target.role === 'admin') { res.status(403).json({ error: 'Cannot delete an admin account' }); return }

    let storageKeys: string[] = []

    if (target.role === 'client') {
      const files = await dbQuery<ProjectFile>(
        `SELECT pf.storage_key
         FROM project_files pf
         JOIN projects p ON p.id = pf.project_id
         WHERE p.client_id = ?`,
        [targetId]
      )
      storageKeys = files.map((f) => f.storage_key)
    } else {
      const files = await dbQuery<ProjectFile>(
        'SELECT storage_key FROM project_files WHERE uploader_id = ?',
        [targetId]
      )
      storageKeys = files.map((f) => f.storage_key)
    }

    await Promise.allSettled(storageKeys.map((key) => deleteObject(key)))

    if (target.role === 'client') {
      const projects = await dbQuery<ProjectRow>(
        'SELECT id FROM projects WHERE client_id = ?',
        [targetId]
      )
      for (const project of projects) {
        await dbExecute('DELETE FROM projects WHERE id = ?', [project.id])
      }
    } else {
      await dbExecute('DELETE FROM project_files WHERE uploader_id = ?', [targetId])
      await dbExecute('DELETE FROM project_assignments WHERE team_member_id = ?', [targetId])
    }

    const galleryFiles = await dbQuery<{ storage_key: string }>(
      'SELECT storage_key FROM gallery_files WHERE owner_id = ?',
      [targetId]
    )
    await Promise.allSettled(galleryFiles.map((f) => deleteObject(f.storage_key)))
    await dbExecute('DELETE FROM gallery_files WHERE owner_id = ?', [targetId])
    await dbExecute('DELETE FROM gallery_folders WHERE owner_id = ?', [targetId])

    await dbExecute('DELETE FROM notifications WHERE recipient_id = ?', [targetId])
    await dbExecute('DELETE FROM timeline_comments WHERE author_id = ?', [targetId])
    await dbExecute('DELETE FROM chat_messages WHERE sender_id = ? AND group_id IS NOT NULL', [targetId])
    await dbExecute('DELETE FROM chat_groups WHERE created_by = ?', [targetId])
    await dbExecute('DELETE FROM profiles WHERE id = ?', [targetId])

    res.json({ ok: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleUpdateUser(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { profile: callerProfile } = await requireAuth(req)
    requireRole(callerProfile, 'admin')

    const targetId = req.query.id as string

    const [target] = await dbQuery<Profile>('SELECT * FROM profiles WHERE id = ?', [targetId])
    if (!target) { res.status(404).json({ error: 'User not found' }); return }

    const { full_name, phone, plan_id, client_id_label, time_saved_hours } = req.body

    const updates: string[] = []
    const params: unknown[] = []

    if (full_name !== undefined) { updates.push('full_name = ?'); params.push(String(full_name)) }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone ?? null) }
    if (plan_id !== undefined) {
      if (target.role !== 'client') { res.status(400).json({ error: 'plan_id can only be set for client accounts' }); return }
      updates.push('plan_id = ?'); params.push(plan_id ?? null)
    }
    if (client_id_label !== undefined) {
      if (target.role !== 'client') { res.status(400).json({ error: 'client_id_label can only be set for client accounts' }); return }
      updates.push('client_id_label = ?'); params.push(client_id_label ?? null)
    }
    if (time_saved_hours !== undefined) {
      updates.push('time_saved_hours = ?')
      params.push(time_saved_hours != null ? Number(time_saved_hours) : null)
    }

    if (updates.length === 0) { res.status(400).json({ error: 'Nothing to update' }); return }

    updates.push('updated_at = ?')
    params.push(nowIso())
    params.push(targetId)

    await dbExecute(`UPDATE profiles SET ${updates.join(', ')} WHERE id = ?`, params)

    const [updated] = await dbQuery<Profile>('SELECT * FROM profiles WHERE id = ?', [targetId])
    res.json({ ...updated, password_changed: Boolean(updated.password_changed), disabled: Boolean(updated.disabled) })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleDisableUser(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { profile: callerProfile } = await requireAuth(req)
    requireRole(callerProfile, 'admin')

    const targetId = req.query.id as string

    const rows = await dbQuery<Profile>('SELECT * FROM profiles WHERE id = ?', [targetId])
    if (!rows[0]) { res.status(404).json({ error: 'User not found' }); return }
    if (rows[0].role === 'admin') { res.status(403).json({ error: 'Cannot disable an admin account' }); return }

    await dbExecute(
      'UPDATE profiles SET disabled = 1, updated_at = ? WHERE id = ?',
      [nowIso(), targetId]
    )

    res.json({ ok: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleEnableUser(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { profile: callerProfile } = await requireAuth(req)
    requireRole(callerProfile, 'admin')

    const targetId = req.query.id as string
    const [target] = await dbQuery<Profile>('SELECT * FROM profiles WHERE id = ?', [targetId])
    if (!target) { res.status(404).json({ error: 'User not found' }); return }

    await dbExecute(
      'UPDATE profiles SET disabled = 0, updated_at = ? WHERE id = ?',
      [nowIso(), targetId]
    )

    res.json({ ok: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleImpersonateUser(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { profile: callerProfile } = await requireAuth(req)
    requireRole(callerProfile, 'admin')

    const targetId = req.query.id as string
    const [target] = await dbQuery<Profile>('SELECT * FROM profiles WHERE id = ? AND disabled = 0', [targetId])
    if (!target) { res.status(404).json({ error: 'User not found' }); return }
    if (target.role === 'admin') { res.status(403).json({ error: 'Cannot impersonate another admin' }); return }

    // Issue a short-lived token (2 hours) for the target user
    const token = await signJwt({ sub: target.id, role: target.role }, '2h')
    res.json({ token, profile: target })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJECTS
// ─────────────────────────────────────────────────────────────────────────────

type ProjectWithProfile = Project & {
  profiles: { full_name: string; email: string; avatar_url: string | null }
}

async function handleGetProjects(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    let rows: ProjectWithProfile[]

    if (profile.role === 'admin') {
      rows = await dbQuery<ProjectWithProfile>(
        `SELECT pr.*,
          p.full_name  AS profile_full_name,
          p.email      AS profile_email,
          p.avatar_url AS profile_avatar_url
         FROM projects pr
         LEFT JOIN profiles p ON pr.client_id = p.id
         ORDER BY pr.created_at DESC`
      )
    } else if (profile.role === 'client') {
      rows = await dbQuery<ProjectWithProfile>(
        `SELECT pr.*,
          p.full_name  AS profile_full_name,
          p.email      AS profile_email,
          p.avatar_url AS profile_avatar_url
         FROM projects pr
         LEFT JOIN profiles p ON pr.client_id = p.id
         WHERE pr.client_id = ?
         ORDER BY pr.created_at DESC`,
        [clerkUserId]
      )
    } else {
      rows = await dbQuery<ProjectWithProfile>(
        `SELECT pr.*,
          p.full_name  AS profile_full_name,
          p.email      AS profile_email,
          p.avatar_url AS profile_avatar_url,
          CASE WHEN pa.project_id IS NOT NULL THEN 1 ELSE 0 END AS is_assigned
         FROM projects pr
         LEFT JOIN profiles p ON pr.client_id = p.id
         LEFT JOIN project_assignments pa ON pa.project_id = pr.id AND pa.team_member_id = ?
         ORDER BY pr.created_at DESC`,
        [clerkUserId]
      )
    }

    const shaped = rows.map(({ profile_full_name, profile_email, profile_avatar_url, is_assigned, ...rest }: any) => ({
      ...rest,
      is_assigned: Boolean(is_assigned),
      profiles: {
        full_name: profile_full_name,
        email: profile_email,
        avatar_url: profile_avatar_url,
      },
    }))

    res.json(shaped)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleCreateProject(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    if (profile.role !== 'client' && profile.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden' }); return
    }

    const { title, description, inspiration_url, video_script, instructions, client_id: bodyClientId } = req.body
    if (!title) { res.status(400).json({ error: 'title required' }); return }

    // Admins can specify a client_id override; otherwise use their own id
    const isAdmin = profile.role === 'admin'
    const effectiveClientId: string = isAdmin && bodyClientId ? bodyClientId : clerkUserId

    let maxDeliverables = 1
    let maxRevisions = 2

    if (!isAdmin && profile.plan_id) {
      const plans = await dbQuery<Plan>('SELECT * FROM plans WHERE id = ?', [profile.plan_id])
      if (plans[0]) {
        maxDeliverables = plans[0].max_deliverables
        maxRevisions = plans[0].max_client_revisions

        if (plans[0].max_active_projects !== -1) {
          const [countRow] = await dbQuery<{ count: number }>(
            `SELECT COUNT(*) AS count FROM projects
             WHERE client_id = ? AND status NOT IN ('client_approved')`,
            [effectiveClientId]
          )
          if ((countRow?.count ?? 0) >= plans[0].max_active_projects) {
            res.status(403).json({ error: 'active_project_limit_reached' }); return
          }
        }
      }
    }

    const id = newId()
    const now = nowIso()

    await dbExecute(
      `INSERT INTO projects
         (id, client_id, title, description, inspiration_url, video_script, instructions,
          status, max_deliverables, max_client_revisions, client_revision_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_assignment', ?, ?, 0, ?, ?)`,
      [
        id, effectiveClientId, title,
        description ?? null,
        inspiration_url ?? null,
        video_script ?? null,
        instructions ?? null,
        maxDeliverables, maxRevisions,
        now, now,
      ]
    )

    const rows = await dbQuery<Project>('SELECT * FROM projects WHERE id = ?', [id])
    res.status(201).json(rows[0])
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleGetProject(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    const projectId = req.query.id as string

    const rows = await dbQuery<any>(
      `SELECT pr.*,
        p.full_name  AS profile_full_name,
        p.email      AS profile_email,
        p.avatar_url AS profile_avatar_url,
        p.plan_id    AS profile_plan_id
       FROM projects pr
       LEFT JOIN profiles p ON pr.client_id = p.id
       WHERE pr.id = ?`,
      [projectId]
    )

    const row = rows[0]
    if (!row) { res.status(404).json({ error: 'Project not found' }); return }

    if (profile.role === 'client' && row.client_id !== clerkUserId) {
      res.status(403).json({ error: 'Forbidden' }); return
    }
    // Team members can view any project (all projects are visible on their dashboard)

    const { profile_full_name, profile_email, profile_avatar_url, profile_plan_id, ...project } = row
    res.json({
      ...project,
      profiles: {
        full_name: profile_full_name,
        email: profile_email,
        avatar_url: profile_avatar_url,
        plan_id: profile_plan_id,
      },
    })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleAssignProject(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    requireRole(profile, 'admin')

    const projectId = req.query.id as string
    const { team_member_id } = req.body

    if (!team_member_id) { res.status(400).json({ error: 'team_member_id required' }); return }

    const [teamMember] = await dbQuery<{ role: string; disabled: number; full_name: string }>(
      'SELECT role, disabled, full_name FROM profiles WHERE id = ?',
      [team_member_id]
    )
    if (!teamMember) { res.status(404).json({ error: 'Team member not found' }); return }
    if (teamMember.role !== 'team') { res.status(400).json({ error: 'Target user is not a team member' }); return }
    if (teamMember.disabled) { res.status(400).json({ error: 'Team member is disabled' }); return }

    const now = nowIso()
    const assignmentId = newId()

    const result = await dbExecute(
      `INSERT OR IGNORE INTO project_assignments (id, project_id, team_member_id, assigned_by, assigned_at)
       VALUES (?, ?, ?, ?, ?)`,
      [assignmentId, projectId, team_member_id, clerkUserId, now]
    )

    if (result.changes > 0) {
      const due = new Date(new Date(now).getTime() + 48 * 60 * 60 * 1000).toISOString()
      await dbExecute(
        `INSERT OR IGNORE INTO deadlines (id, project_id, team_member_id, assignment_id, due_at, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
        [newId(), projectId, team_member_id, assignmentId, due, now]
      )
    }

    const projects = await dbQuery<Project>('SELECT * FROM projects WHERE id = ?', [projectId])
    if (projects[0]?.status === 'pending_assignment') {
      await dbExecute(
        'UPDATE projects SET status = ?, updated_at = ? WHERE id = ?',
        ['in_progress', now, projectId]
      )
    }

    if (result.changes > 0 && projects[0]) {
      await dbExecute(
        'INSERT INTO notifications (id, recipient_id, project_id, type, message, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
        [newId(), team_member_id, projectId, 'team_assigned', `You have been assigned to "${projects[0].title}"`, now]
      )
    }

    res.json({ ok: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleUpdateProjectStatus(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    requireRole(profile, 'admin', 'team')

    const projectId = req.query.id as string
    const { status } = req.body

    const VALID_STATUSES = ['pending_assignment', 'in_progress', 'in_review', 'admin_approved', 'client_reviewing', 'client_approved', 'revision_requested']
    const TEAM_ALLOWED_STATUSES = ['in_progress', 'in_review']

    if (!status || !VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: 'Invalid status value' }); return
    }

    if (profile.role === 'team') {
      if (!TEAM_ALLOWED_STATUSES.includes(status)) { res.status(403).json({ error: 'Forbidden' }); return }
    }
    // Team members can update status on any project they can see

    const [project] = await dbQuery<{ id: string; title: string; client_id: string }>(
      'SELECT id, title, client_id FROM projects WHERE id = ?',
      [projectId]
    )
    if (!project) { res.status(404).json({ error: 'Project not found' }); return }

    const now = nowIso()
    await dbExecute(
      'UPDATE projects SET status = ?, updated_at = ? WHERE id = ?',
      [status, now, projectId]
    )

    // Send notifications on key transitions
    const notifyMessages: { recipientId: string; type: string; message: string }[] = []
    if (status === 'revision_requested') {
      // Notify assigned team members
      const assigned = await dbQuery<{ team_member_id: string }>(
        'SELECT team_member_id FROM project_assignments WHERE project_id = ?',
        [projectId]
      )
      assigned.forEach((a) => notifyMessages.push({ recipientId: a.team_member_id, type: 'revision_requested', message: `Revision requested for "${project.title}"` }))
    } else if (status === 'client_reviewing') {
      // Notify client
      notifyMessages.push({ recipientId: project.client_id, type: 'video_ready_for_review', message: `Your video for "${project.title}" is ready for review` })
    } else if (status === 'admin_approved' || status === 'in_review') {
      // Notify assigned team members
      const assigned = await dbQuery<{ team_member_id: string }>(
        'SELECT team_member_id FROM project_assignments WHERE project_id = ?',
        [projectId]
      )
      const msg = status === 'admin_approved' ? `Project "${project.title}" has been approved by admin` : `Project "${project.title}" is ready for admin review`
      assigned.forEach((a) => notifyMessages.push({ recipientId: a.team_member_id, type: status, message: msg }))
    } else if (status === 'in_progress') {
      // Notify assigned team members
      const assigned = await dbQuery<{ team_member_id: string }>(
        'SELECT team_member_id FROM project_assignments WHERE project_id = ?',
        [projectId]
      )
      assigned.forEach((a) => notifyMessages.push({ recipientId: a.team_member_id, type: 'project_assigned', message: `Project "${project.title}" is now in progress` }))
    }
    for (const n of notifyMessages) {
      if (n.recipientId !== clerkUserId) {
        await dbExecute(
          'INSERT INTO notifications (id, recipient_id, project_id, type, message, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
          [newId(), n.recipientId, projectId, n.type, n.message, now]
        )
      }
    }

    res.json({ ok: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleApproveClient(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    requireRole(profile, 'client')

    const projectId = req.query.id as string
    const { file_id } = req.body

    const projects = await dbQuery<{ id: string }>(
      'SELECT id FROM projects WHERE id = ? AND client_id = ?',
      [projectId, clerkUserId]
    )
    if (!projects[0]) { res.status(404).json({ error: 'Project not found' }); return }

    const now = nowIso()

    if (file_id) {
      const files = await dbQuery<{ id: string }>(
        'SELECT id FROM project_files WHERE id = ? AND project_id = ?',
        [file_id, projectId]
      )
      if (!files[0]) { res.status(404).json({ error: 'File not found in this project' }); return }
      await dbExecute(
        'UPDATE project_files SET approved = 1 WHERE id = ? AND project_id = ?',
        [file_id, projectId]
      )
    }

    await dbExecute(
      'UPDATE projects SET status = ?, updated_at = ? WHERE id = ? AND client_id = ?',
      ['client_approved', now, projectId, clerkUserId]
    )

    res.json({ ok: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT FILES
// ─────────────────────────────────────────────────────────────────────────────

async function handleGetProjectFiles(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    const projectId = req.query.projectId as string

    if (profile.role === 'client') {
      const projectRows = await dbQuery<{ id: string }>(
        'SELECT id FROM projects WHERE id = ? AND client_id = ?',
        [projectId, clerkUserId]
      )
      if (!projectRows[0]) { res.status(403).json({ error: 'Forbidden' }); return }
    }
    // Team members can view files for any project

    const files = await dbQuery<ProjectFile & { uploader_full_name: string }>(
      `SELECT pf.*, p.full_name AS uploader_full_name
       FROM project_files pf
       LEFT JOIN profiles p ON pf.uploader_id = p.id
       WHERE pf.project_id = ?
       ORDER BY pf.created_at DESC`,
      [projectId]
    )

    const shaped = files.map(({ uploader_full_name, ...f }: any) => ({
      ...f,
      approved: Boolean(f.approved),
      profiles: { full_name: uploader_full_name },
    }))

    res.json(shaped)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleRegisterProjectFile(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    const { project_id, file_type, storage_key, file_name, file_size, mime_type } = req.body

    if (!project_id || !file_type || !storage_key || !file_name) {
      res.status(400).json({ error: 'project_id, file_type, storage_key, and file_name required' }); return
    }

    const VALID_FILE_TYPES = ['source_video', 'deliverable', 'attachment']
    if (!VALID_FILE_TYPES.includes(file_type)) {
      res.status(400).json({ error: 'file_type must be source_video, deliverable, or attachment' }); return
    }

    if (profile.role === 'client') {
      const [row] = await dbQuery<{ id: string }>('SELECT id FROM projects WHERE id = ? AND client_id = ?', [project_id, clerkUserId])
      if (!row) { res.status(403).json({ error: 'Forbidden' }); return }
    }
    // Team members can upload files to any project

    const id = newId()
    const now = nowIso()

    await dbExecute(
      `INSERT INTO project_files (id, project_id, uploader_id, file_type, storage_key, file_name, file_size, mime_type, approved, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [id, project_id, clerkUserId, file_type, storage_key, file_name, file_size ?? null, mime_type ?? null, now]
    )

    const rows = await dbQuery<ProjectFile>('SELECT * FROM project_files WHERE id = ?', [id])
    res.status(201).json({ ...rows[0], approved: false })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

interface StorageRow { used_mb: number }
interface PlanRow { storage_limit_mb: number }

async function handleGetProjectFileUploadUrl(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { profile } = await requireAuth(req)

    const { projectId, fileType, fileName, mimeType, fileSize } = req.body

    if (!projectId || !fileType || !fileName) {
      res.status(400).json({ error: 'projectId, fileType, and fileName required' }); return
    }

    if (profile.role === 'client' && profile.plan_id) {
      const [planRow] = await dbQuery<PlanRow>(
        'SELECT storage_limit_mb FROM plans WHERE id = ?',
        [profile.plan_id]
      )
      if (planRow && planRow.storage_limit_mb !== -1) {
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
          res.status(403).json({ error: 'storage_limit_reached' }); return
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

async function handleDeleteProjectFile(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { profile } = await requireAuth(req)
    requireRole(profile, 'admin')

    const fileId = req.query.id as string
    const rows = await dbQuery<ProjectFile>('SELECT * FROM project_files WHERE id = ?', [fileId])
    if (!rows[0]) { res.status(404).json({ error: 'File not found' }); return }

    await dbExecute('DELETE FROM project_files WHERE id = ?', [fileId])
    await deleteObject(rows[0].storage_key)
    res.json({ ok: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

interface FileRow { project_id: string; file_type: string }
interface ProjectStatusRow { status: string; client_id: string; title: string }

async function handleApproveProjectFile(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { profile } = await requireAuth(req)
    requireRole(profile, 'admin')

    const fileId = req.query.id as string

    const [file] = await dbQuery<FileRow>(
      'SELECT project_id, file_type FROM project_files WHERE id = ?',
      [fileId]
    )
    if (!file) { res.status(404).json({ error: 'File not found' }); return }

    await dbExecute('UPDATE project_files SET approved = 1 WHERE id = ?', [fileId])

    if (file.file_type === 'deliverable') {
      const [project] = await dbQuery<ProjectStatusRow>(
        'SELECT status, client_id, title FROM projects WHERE id = ?',
        [file.project_id]
      )
      if (project?.status === 'admin_approved' || project?.status === 'in_review') {
        const now = nowIso()
        await dbExecute(
          'UPDATE projects SET status = ?, updated_at = ? WHERE id = ?',
          ['client_reviewing', now, file.project_id]
        )
        await dbExecute(
          'INSERT INTO notifications (id, recipient_id, project_id, type, message, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
          [
            newId(),
            project.client_id,
            file.project_id,
            'video_ready_for_review',
            `Your video for "${project.title}" is ready for review`,
            now,
          ]
        )
      }
    }

    res.json({ ok: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleGetProjectFileSignedUrl(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    const fileId = req.query.id as string
    const rows = await dbQuery<ProjectFile>('SELECT * FROM project_files WHERE id = ?', [fileId])

    if (!rows[0]) { res.status(404).json({ error: 'File not found' }); return }

    const file = rows[0]

    if (profile.role === 'admin') {
      // admins can access all project files
    } else if (profile.role === 'client') {
      const projects = await dbQuery<Project>(
        'SELECT id FROM projects WHERE id = ? AND client_id = ?',
        [file.project_id, clerkUserId]
      )
      if (!projects[0]) { res.status(403).json({ error: 'Forbidden' }); return }
    } else if (profile.role !== 'team') {
      res.status(403).json({ error: 'Forbidden' }); return
    }
    // Team members can access signed URLs for any project file

    const signedUrl = await getPresignedDownloadUrl(file.storage_key)
    res.json({ signedUrl })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGES
// ─────────────────────────────────────────────────────────────────────────────

interface ConnectionRow {
  id: string
  user_a: string
  user_b: string
  created_at: string
  user_a_full_name: string
  user_a_email: string
  user_a_role: string
  user_a_avatar_url: string | null
  user_b_full_name: string
  user_b_email: string
  user_b_role: string
  user_b_avatar_url: string | null
}

function shapeConnection(row: ConnectionRow) {
  const { user_a_full_name, user_a_email, user_a_role, user_a_avatar_url,
          user_b_full_name, user_b_email, user_b_role, user_b_avatar_url,
          ...rest } = row
  return {
    ...rest,
    profile_a: { full_name: user_a_full_name, email: user_a_email, role: user_a_role, avatar_url: user_a_avatar_url },
    profile_b: { full_name: user_b_full_name, email: user_b_email, role: user_b_role, avatar_url: user_b_avatar_url },
  }
}

const CONNECTION_SELECT = `
  SELECT
    c.id, c.user_a, c.user_b, c.created_at,
    pa.full_name  AS user_a_full_name,
    pa.email      AS user_a_email,
    pa.role       AS user_a_role,
    pa.avatar_url AS user_a_avatar_url,
    pb.full_name  AS user_b_full_name,
    pb.email      AS user_b_email,
    pb.role       AS user_b_role,
    pb.avatar_url AS user_b_avatar_url
  FROM chat_connections c
  JOIN profiles pa ON pa.id = c.user_a
  JOIN profiles pb ON pb.id = c.user_b
`

async function handleGetConnections(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    let rows: ConnectionRow[]
    if (profile.role === 'admin') {
      rows = await dbQuery<ConnectionRow>(CONNECTION_SELECT + ' ORDER BY c.created_at DESC')
    } else {
      rows = await dbQuery<ConnectionRow>(
        CONNECTION_SELECT + ' WHERE c.user_a = ? OR c.user_b = ? ORDER BY c.created_at DESC',
        [clerkUserId, clerkUserId]
      )
    }
    res.json(rows.map(shapeConnection))
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleCreateConnection(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { profile } = await requireAuth(req)
    requireRole(profile, 'admin')

    const { userA, userB } = req.body
    if (!userA || !userB) { res.status(400).json({ error: 'userA and userB are required' }); return }
    if (userA === userB) { res.status(400).json({ error: 'userA and userB must be different users' }); return }

    const [a, b] = [userA, userB].sort()

    const users = await dbQuery<{ id: string }>(
      'SELECT id FROM profiles WHERE id IN (?, ?)',
      [a, b]
    )
    if (users.length < 2) { res.status(404).json({ error: 'One or both users not found' }); return }

    const id = 'conn_' + newId()
    const created_at = nowIso()
    try {
      await dbExecute(
        'INSERT INTO chat_connections (id, user_a, user_b, created_at) VALUES (?, ?, ?, ?)',
        [id, a, b, created_at]
      )
    } catch (insertErr: any) {
      if (insertErr?.message?.includes('UNIQUE')) {
        res.status(409).json({ error: 'Connection already exists between these users' }); return
      }
      throw insertErr
    }

    const [conn] = await dbQuery<ConnectionRow>(CONNECTION_SELECT + ' WHERE c.id = ?', [id])
    res.status(201).json(shapeConnection(conn))
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleDeleteConnection(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { profile } = await requireAuth(req)
    requireRole(profile, 'admin')

    const connectionId = req.query.id as string

    const [conn] = await dbQuery<{ id: string }>(
      'SELECT id FROM chat_connections WHERE id = ?',
      [connectionId]
    )
    if (!conn) { res.status(404).json({ error: 'Connection not found' }); return }

    await dbExecute('DELETE FROM chat_connections WHERE id = ?', [connectionId])

    res.json({ ok: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

interface GroupRow {
  id: string
  name: string
  created_by: string
  created_at: string
}

interface MemberRow {
  group_id: string
  user_id: string
  full_name: string
  email: string
  role: string
  avatar_url: string | null
}

async function fetchGroupWithMembers(groupId: string) {
  const [group] = await dbQuery<GroupRow>(
    'SELECT * FROM chat_groups WHERE id = ?',
    [groupId]
  )
  if (!group) return null

  const members = await dbQuery<MemberRow>(
    `SELECT m.group_id, m.user_id, p.full_name, p.email, p.role, p.avatar_url
     FROM chat_group_members m
     JOIN profiles p ON p.id = m.user_id
     WHERE m.group_id = ?`,
    [groupId]
  )

  return {
    ...group,
    member_ids: members.map((m) => m.user_id),
    members: members.map(({ user_id, full_name, email, role, avatar_url }) => ({
      user_id, full_name, email, role, avatar_url,
    })),
  }
}

async function handleGetGroups(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    let groups: GroupRow[]
    if (profile.role === 'admin') {
      groups = await dbQuery<GroupRow>('SELECT * FROM chat_groups ORDER BY created_at DESC')
    } else {
      groups = await dbQuery<GroupRow>(
        `SELECT g.* FROM chat_groups g
         INNER JOIN chat_group_members m ON m.group_id = g.id AND m.user_id = ?
         ORDER BY g.created_at DESC`,
        [clerkUserId]
      )
    }

    if (groups.length === 0) { res.json([]); return }
    const placeholders = groups.map(() => '?').join(', ')
    const groupIds = groups.map((g) => g.id)
    const members = await dbQuery<MemberRow>(
      `SELECT m.group_id, m.user_id, p.full_name, p.email, p.role, p.avatar_url
       FROM chat_group_members m
       JOIN profiles p ON p.id = m.user_id
       WHERE m.group_id IN (${placeholders})`,
      groupIds
    )

    const membersByGroup: Record<string, MemberRow[]> = {}
    for (const m of members) {
      if (!membersByGroup[m.group_id]) membersByGroup[m.group_id] = []
      membersByGroup[m.group_id].push(m)
    }

    res.json(
      groups.map((g) => {
        const groupMembers = membersByGroup[g.id] ?? []
        return {
          ...g,
          member_ids: groupMembers.map((m) => m.user_id),
          members: groupMembers.map(({ user_id, full_name, email, role, avatar_url }) => ({
            user_id, full_name, email, role, avatar_url,
          })),
        }
      })
    )
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleCreateGroup(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    requireRole(profile, 'admin')

    const { name, memberIds } = req.body
    if (!name) { res.status(400).json({ error: 'name is required' }); return }
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      res.status(400).json({ error: 'memberIds must be a non-empty array' }); return
    }

    const placeholders = memberIds.map(() => '?').join(', ')
    const foundUsers = await dbQuery<{ id: string }>(
      `SELECT id FROM profiles WHERE id IN (${placeholders})`,
      memberIds
    )
    if (foundUsers.length !== memberIds.length) {
      res.status(404).json({ error: 'One or more member IDs not found' }); return
    }

    const groupId = 'grp_' + newId()
    const created_at = nowIso()
    await dbExecute(
      'INSERT INTO chat_groups (id, name, created_by, created_at) VALUES (?, ?, ?, ?)',
      [groupId, String(name), clerkUserId, created_at]
    )

    for (const userId of memberIds) {
      await dbExecute(
        'INSERT INTO chat_group_members (group_id, user_id) VALUES (?, ?)',
        [groupId, userId]
      )
    }

    const [group] = await dbQuery<GroupRow>('SELECT * FROM chat_groups WHERE id = ?', [groupId])
    const members = await dbQuery<MemberRow>(
      `SELECT m.group_id, m.user_id, p.full_name, p.email, p.role, p.avatar_url
       FROM chat_group_members m
       JOIN profiles p ON p.id = m.user_id
       WHERE m.group_id = ?`,
      [groupId]
    )

    res.status(201).json({
      ...group,
      member_ids: members.map((m) => m.user_id),
      members: members.map(({ user_id, full_name, email, role, avatar_url }) => ({
        user_id, full_name, email, role, avatar_url,
      })),
    })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleGroup(req: VercelRequest, res: VercelResponse) {
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    const groupId = req.query.id as string

    if (req.method === 'GET') {
      const group = await fetchGroupWithMembers(groupId)
      if (!group) { res.status(404).json({ error: 'Group not found' }); return }

      if (profile.role !== 'admin') {
        const isMember = group.members.some((m) => m.user_id === clerkUserId)
        if (!isMember) { res.status(403).json({ error: 'Forbidden' }); return }
      }

      res.json(group); return
    }

    if (req.method === 'DELETE') {
      requireRole(profile, 'admin')

      const [existing] = await dbQuery<{ id: string }>('SELECT id FROM chat_groups WHERE id = ?', [groupId])
      if (!existing) { res.status(404).json({ error: 'Group not found' }); return }

      await dbExecute('DELETE FROM chat_groups WHERE id = ?', [groupId])
      res.json({ ok: true }); return
    }

    if (req.method === 'PATCH') {
      requireRole(profile, 'admin')

      const [existing] = await dbQuery<GroupRow>('SELECT * FROM chat_groups WHERE id = ?', [groupId])
      if (!existing) { res.status(404).json({ error: 'Group not found' }); return }

      const { name, memberIds } = req.body

      if (name !== undefined) {
        if (!name || typeof name !== 'string') {
          res.status(400).json({ error: 'name must be a non-empty string' }); return
        }
        await dbExecute('UPDATE chat_groups SET name = ? WHERE id = ?', [String(name), groupId])
      }

      if (memberIds !== undefined) {
        if (!Array.isArray(memberIds) || memberIds.length === 0) {
          res.status(400).json({ error: 'memberIds must be a non-empty array' }); return
        }

        const placeholders = memberIds.map(() => '?').join(', ')
        const foundUsers = await dbQuery<{ id: string }>(
          `SELECT id FROM profiles WHERE id IN (${placeholders})`,
          memberIds
        )
        if (foundUsers.length !== memberIds.length) {
          res.status(404).json({ error: 'One or more member IDs not found' }); return
        }

        const existingMembers = await dbQuery<{ user_id: string }>(
          'SELECT user_id FROM chat_group_members WHERE group_id = ?',
          [groupId]
        )
        await dbExecute('DELETE FROM chat_group_members WHERE group_id = ?', [groupId])
        try {
          for (const userId of memberIds) {
            await dbExecute(
              'INSERT INTO chat_group_members (group_id, user_id) VALUES (?, ?)',
              [groupId, userId]
            )
          }
        } catch (insertErr) {
          for (const row of existingMembers) {
            await dbExecute(
              'INSERT OR IGNORE INTO chat_group_members (group_id, user_id) VALUES (?, ?)',
              [groupId, row.user_id]
            ).catch(() => {})
          }
          throw insertErr
        }
      }

      const updated = await fetchGroupWithMembers(groupId)
      res.json(updated); return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

interface ChatConnectionRow {
  id: string
  user_a: string
  user_b: string
}

interface GroupMemberRow {
  user_id: string
}

interface MessageRow {
  id: string
  connection_id: string | null
  group_id: string | null
  sender_id: string
  text: string
  created_at: string
  sender_full_name: string
  sender_role: string
}

interface ReadReceiptRow {
  message_id: string
  user_id: string
}

async function handleGetMessages(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    const conversationId = req.query.conversationId as string

    const [connection] = await dbQuery<ChatConnectionRow>(
      'SELECT id, user_a, user_b FROM chat_connections WHERE id = ?',
      [conversationId]
    )

    let isConnection = false

    if (connection) {
      isConnection = true
      if (profile.role !== 'admin') {
        if (connection.user_a !== clerkUserId && connection.user_b !== clerkUserId) {
          res.status(403).json({ error: 'Forbidden' }); return
        }
      }
    } else {
      const [group] = await dbQuery<{ id: string }>(
        'SELECT id FROM chat_groups WHERE id = ?',
        [conversationId]
      )
      if (!group) { res.status(404).json({ error: 'Conversation not found' }); return }
      if (profile.role !== 'admin') {
        const [membership] = await dbQuery<GroupMemberRow>(
          'SELECT user_id FROM chat_group_members WHERE group_id = ? AND user_id = ?',
          [conversationId, clerkUserId]
        )
        if (!membership) { res.status(403).json({ error: 'Forbidden' }); return }
      }
    }

    const whereClause = isConnection ? 'cm.connection_id = ?' : 'cm.group_id = ?'
    const messages = await dbQuery<MessageRow>(
      `SELECT
        cm.id, cm.connection_id, cm.group_id, cm.sender_id, cm.text, cm.created_at,
        p.full_name AS sender_full_name,
        p.role      AS sender_role
       FROM chat_messages cm
       JOIN profiles p ON p.id = cm.sender_id
       WHERE ${whereClause}
       ORDER BY cm.created_at ASC`,
      [conversationId]
    )

    let readReceipts: ReadReceiptRow[] = []
    if (messages.length > 0) {
      const msgIds = messages.map((m) => m.id)
      const placeholders = msgIds.map(() => '?').join(', ')
      readReceipts = await dbQuery<ReadReceiptRow>(
        `SELECT message_id, user_id FROM chat_read_receipts WHERE message_id IN (${placeholders})`,
        msgIds
      )
    }

    const readByMap: Record<string, string[]> = {}
    for (const r of readReceipts) {
      if (!readByMap[r.message_id]) readByMap[r.message_id] = []
      readByMap[r.message_id].push(r.user_id)
    }

    const readAt = nowIso()
    for (const msg of messages) {
      const alreadyRead = (readByMap[msg.id] ?? []).includes(clerkUserId)
      if (!alreadyRead) {
        await dbExecute(
          `INSERT OR IGNORE INTO chat_read_receipts (message_id, user_id, read_at) VALUES (?, ?, ?)`,
          [msg.id, clerkUserId, readAt]
        )
        if (!readByMap[msg.id]) readByMap[msg.id] = []
        readByMap[msg.id].push(clerkUserId)
      }
    }

    const result = messages.map(({ sender_full_name, sender_role, ...msg }) => ({
      ...msg,
      sender: { full_name: sender_full_name, role: sender_role },
      read_by: readByMap[msg.id] ?? [],
    }))

    res.json(result)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleSendMessage(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    const conversationId = req.query.conversationId as string

    const { text } = req.body
    if (!text || typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: 'text is required' }); return
    }

    const [connection] = await dbQuery<ChatConnectionRow>(
      'SELECT id, user_a, user_b FROM chat_connections WHERE id = ?',
      [conversationId]
    )

    let isConnection = false
    let isGroup = false

    if (connection) {
      isConnection = true
      if (profile.role !== 'admin') {
        if (connection.user_a !== clerkUserId && connection.user_b !== clerkUserId) {
          res.status(403).json({ error: 'Forbidden' }); return
        }
      }
    } else {
      const [group] = await dbQuery<{ id: string }>('SELECT id FROM chat_groups WHERE id = ?', [conversationId])
      if (!group) { res.status(404).json({ error: 'Conversation not found' }); return }
      isGroup = true
      if (profile.role !== 'admin') {
        const [membership] = await dbQuery<{ user_id: string }>(
          'SELECT user_id FROM chat_group_members WHERE group_id = ? AND user_id = ?',
          [conversationId, clerkUserId]
        )
        if (!membership) { res.status(403).json({ error: 'Forbidden' }); return }
      }
    }

    const messageId = 'msg_' + newId()
    const created_at = nowIso()
    const connection_id = isConnection ? conversationId : null
    const group_id = isGroup ? conversationId : null

    await dbExecute(
      'INSERT INTO chat_messages (id, connection_id, group_id, sender_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [messageId, connection_id, group_id, clerkUserId, text.trim(), created_at]
    )

    const [message] = await dbQuery<MessageRow>(
      'SELECT * FROM chat_messages WHERE id = ?',
      [messageId]
    )

    res.status(201).json(message)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GALLERY
// ─────────────────────────────────────────────────────────────────────────────

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

interface GalleryFolder {
  id: string
  owner_id: string
  name: string
  parent_id: string | null
  created_at: string
}

async function handleGetGallery(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    let ownerId: string
    if (profile.role === 'client') {
      ownerId = clerkUserId
    } else {
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

async function handleRegisterGalleryFile(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    const { fileName, mimeType, fileSize, storageKey, folderId, ownerId: bodyOwnerId } = req.body

    if (!fileName || !mimeType || !storageKey) {
      res.status(400).json({ error: 'fileName, mimeType, and storageKey are required' }); return
    }

    // Admins can specify an ownerId to register files on behalf of a client
    const ownerId = (profile.role === 'admin' && bodyOwnerId) ? bodyOwnerId : clerkUserId

    const id = newId()
    const now = nowIso()

    await dbExecute(
      `INSERT INTO gallery_files (id, owner_id, folder_id, file_name, file_size, mime_type, storage_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, ownerId, folderId ?? null, fileName, fileSize ?? 0, mimeType, storageKey, now]
    )

    const rows = await dbQuery<GalleryFile>('SELECT * FROM gallery_files WHERE id = ?', [id])
    res.status(201).json(rows[0])
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

interface GalleryStorageRow { used_bytes: number }

async function handleGetGalleryUploadUrl(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    const { fileName, mimeType, fileSize } = req.body

    if (!fileName || !mimeType) {
      res.status(400).json({ error: 'fileName and mimeType are required' }); return
    }

    if (profile.role === 'client' && profile.plan_id) {
      const [planRow] = await dbQuery<PlanRow>(
        'SELECT storage_limit_mb FROM plans WHERE id = ?',
        [profile.plan_id]
      )
      if (planRow && planRow.storage_limit_mb !== -1) {
        const [usageRow] = await dbQuery<GalleryStorageRow>(
          `SELECT COALESCE(SUM(file_size), 0) AS used_bytes FROM gallery_files WHERE owner_id = ?`,
          [clerkUserId]
        )
        const usedMb = (usageRow?.used_bytes ?? 0) / 1048576.0
        const incomingMb = fileSize ? fileSize / 1048576.0 : 0
        if (usedMb + incomingMb > planRow.storage_limit_mb) {
          res.status(403).json({ error: 'storage_limit_reached' }); return
        }
      }
    }

    const keyOwner = (profile.role === 'admin' && req.body.ownerId) ? req.body.ownerId : clerkUserId
    const key = `gallery/${keyOwner}/${Date.now()}-${sanitizeFileName(fileName)}`
    const uploadUrl = await getPresignedUploadUrl(key, mimeType ?? 'application/octet-stream')

    res.json({ uploadUrl, storageKey: key })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleGalleryFile(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE' && req.method !== 'PATCH') {
    res.status(405).json({ error: 'Method not allowed' }); return
  }
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    const fileId = req.query.id as string
    const rows = await dbQuery<GalleryFile>('SELECT * FROM gallery_files WHERE id = ?', [fileId])

    if (!rows[0]) { res.status(404).json({ error: 'File not found' }); return }

    const file = rows[0]

    if (profile.role !== 'admin' && file.owner_id !== clerkUserId) {
      res.status(403).json({ error: 'Forbidden' }); return
    }

    if (req.method === 'PATCH') {
      const { folderId } = req.body as { folderId: string | null }
      await dbExecute('UPDATE gallery_files SET folder_id = ? WHERE id = ?', [folderId ?? null, fileId])
      const updated = await dbQuery<GalleryFile>('SELECT * FROM gallery_files WHERE id = ?', [fileId])
      res.json(updated[0]); return
    }

    await deleteObject(file.storage_key)
    await dbExecute('DELETE FROM gallery_files WHERE id = ?', [fileId])

    res.json({ success: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleGetGallerySignedUrl(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    const fileId = req.query.id as string
    const rows = await dbQuery<GalleryFile>('SELECT * FROM gallery_files WHERE id = ?', [fileId])

    if (!rows[0]) { res.status(404).json({ error: 'File not found' }); return }

    const file = rows[0]

    if (file.owner_id === clerkUserId) {
      // owner allowed
    } else if (profile.role === 'admin') {
      // admin allowed
    } else if (profile.role === 'team') {
      const assigned = await dbQuery<{ id: string }>(
        `SELECT pa.id FROM project_assignments pa
         JOIN projects p ON p.id = pa.project_id
         WHERE pa.team_member_id = ? AND p.client_id = ?
         LIMIT 1`,
        [clerkUserId, file.owner_id]
      )
      if (!assigned[0]) { res.status(403).json({ error: 'Forbidden' }); return }
    } else {
      res.status(403).json({ error: 'Forbidden' }); return
    }

    const url = await getPresignedDownloadUrl(file.storage_key)
    res.json({ url })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleGalleryFolders(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' }); return
  }
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    if (req.method === 'GET') {
      let ownerId: string
      if (profile.role === 'client') {
        ownerId = clerkUserId
      } else {
        ownerId = (req.query.ownerId as string) ?? clerkUserId
      }

      const folders = await dbQuery<GalleryFolder>(
        `SELECT * FROM gallery_folders WHERE owner_id = ? ORDER BY created_at ASC`,
        [ownerId]
      )
      res.json(folders); return
    }

    // POST
    const { name, parentId } = req.body

    if (!name) { res.status(400).json({ error: 'name is required' }); return }

    let ownerId: string
    if (profile.role === 'admin' && req.body.ownerId) {
      ownerId = req.body.ownerId
    } else {
      ownerId = clerkUserId
    }

    const id = newId()
    const now = nowIso()

    await dbExecute(
      `INSERT INTO gallery_folders (id, owner_id, name, parent_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, ownerId, name, parentId ?? null, now]
    )

    const rows = await dbQuery<GalleryFolder>('SELECT * FROM gallery_folders WHERE id = ?', [id])
    res.status(201).json(rows[0])
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleGalleryFolder(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    res.status(405).json({ error: 'Method not allowed' }); return
  }
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    const folderId = req.query.id as string
    const rows = await dbQuery<GalleryFolder>('SELECT * FROM gallery_folders WHERE id = ?', [folderId])

    if (!rows[0]) { res.status(404).json({ error: 'Folder not found' }); return }

    const folder = rows[0]

    if (profile.role !== 'admin' && folder.owner_id !== clerkUserId) {
      res.status(403).json({ error: 'Forbidden' }); return
    }

    if (req.method === 'PATCH') {
      const { name } = req.body
      if (!name) { res.status(400).json({ error: 'name is required' }); return }
      await dbExecute('UPDATE gallery_folders SET name = ? WHERE id = ?', [name, folderId])
      const updated = await dbQuery<GalleryFolder>('SELECT * FROM gallery_folders WHERE id = ?', [folderId])
      res.json(updated[0]); return
    }

    await dbExecute('UPDATE gallery_files SET folder_id = NULL WHERE folder_id = ?', [folderId])
    await dbExecute('DELETE FROM gallery_folders WHERE id = ?', [folderId])

    res.json({ success: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CALENDAR
// ─────────────────────────────────────────────────────────────────────────────

interface CalendarDeadlineRow extends Deadline {
  project_title: string
  member_full_name: string
}

interface CalendarProjectRow {
  id: string
  title: string
  status: string
  created_at: string
  updated_at: string
  client_id: string
}

async function handleGetCalendar(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    const from = req.query.from as string | undefined
    const to   = req.query.to   as string | undefined

    let projects: CalendarProjectRow[]
    if (profile.role === 'admin') {
      projects = await dbQuery<CalendarProjectRow>('SELECT id, title, status, created_at, updated_at, client_id FROM projects ORDER BY created_at ASC')
    } else if (profile.role === 'client') {
      projects = await dbQuery<CalendarProjectRow>(
        'SELECT id, title, status, created_at, updated_at, client_id FROM projects WHERE client_id = ? ORDER BY created_at ASC',
        [clerkUserId]
      )
    } else {
      projects = await dbQuery<CalendarProjectRow>(
        `SELECT pr.id, pr.title, pr.status, pr.created_at, pr.updated_at, pr.client_id
         FROM projects pr
         INNER JOIN project_assignments pa ON pa.project_id = pr.id AND pa.team_member_id = ?
         ORDER BY pr.created_at ASC`,
        [clerkUserId]
      )
    }

    const events: CalendarEvent[] = []

    for (const p of projects) {
      events.push({
        id: `ce-created-${p.id}`,
        project_id: p.id,
        type: 'project_created',
        title: `${p.title} — Created`,
        date: p.created_at.slice(0, 10),
        color: 'bg-blue-500',
        created_at: p.created_at,
      })

      if (p.status === 'client_approved') {
        events.push({
          id: `ce-approved-${p.id}`,
          project_id: p.id,
          type: 'project_approved',
          title: `${p.title} — Approved ✓`,
          date: p.updated_at.slice(0, 10),
          color: 'bg-green-500',
          created_at: p.updated_at,
        })
      }
    }

    if (profile.role !== 'client') {
      let deadlineRows: CalendarDeadlineRow[]
      const projectIds = projects.map((p) => p.id)

      if (projectIds.length === 0) {
        deadlineRows = []
      } else if (profile.role === 'admin') {
        deadlineRows = await dbQuery<CalendarDeadlineRow>(
          `SELECT d.*, pr.title AS project_title, p.full_name AS member_full_name
           FROM deadlines d
           JOIN projects pr ON pr.id = d.project_id
           JOIN profiles p  ON p.id  = d.team_member_id
           ORDER BY d.due_at ASC`
        )
      } else {
        deadlineRows = await dbQuery<CalendarDeadlineRow>(
          `SELECT d.*, pr.title AS project_title, p.full_name AS member_full_name
           FROM deadlines d
           JOIN projects pr ON pr.id = d.project_id
           JOIN profiles p  ON p.id  = d.team_member_id
           WHERE d.team_member_id = ?
           ORDER BY d.due_at ASC`,
          [clerkUserId]
        )
      }

      for (const dl of deadlineRows) {
        const color =
          dl.status === 'met'    ? 'bg-green-500' :
          dl.status === 'missed' ? 'bg-red-500'   :
          'bg-orange-500'

        const suffix = profile.role === 'admin' ? ` · ${dl.member_full_name}` : ''

        events.push({
          id: `ce-deadline-${dl.id}`,
          project_id: dl.project_id,
          type: 'deadline',
          title: `⏰ ${dl.project_title}${suffix}`,
          date: dl.due_at.slice(0, 10),
          color,
          deadline_id: dl.id,
          team_member_id: dl.team_member_id,
          created_at: dl.created_at,
        })
      }
    }

    const manualRows = await dbQuery<{
      id: string; owner_id: string; title: string; date: string; color: string
      content_type: string | null; content_status: string | null; comments: string | null
      double_down: number; inspiration_url: string | null; script: string | null; caption: string | null
      created_at: string
    }>(
      `SELECT DISTINCT e.*
       FROM calendar_events e
       LEFT JOIN calendar_event_participants p ON p.event_id = e.id AND p.profile_id = ?
       WHERE e.owner_id = ? OR p.profile_id = ?
       ORDER BY e.date ASC`,
      [clerkUserId, clerkUserId, clerkUserId]
    )

    const manualEventIds = manualRows.map((m) => m.id)
    const manualParticipants = manualEventIds.length > 0
      ? await dbQuery<{ event_id: string; profile_id: string; role: string }>(
          `SELECT event_id, profile_id, role FROM calendar_event_participants WHERE event_id IN (${manualEventIds.map(() => '?').join(',')})`,
          manualEventIds
        )
      : []

    for (const m of manualRows) {
      events.push({
        id: m.id,
        type: 'manual',
        owner_id: m.owner_id,
        title: m.title,
        date: m.date,
        color: m.color,
        content_type: m.content_type as any ?? null,
        content_status: m.content_status as any ?? null,
        comments: m.comments ?? null,
        double_down: Boolean(m.double_down),
        inspiration_url: m.inspiration_url ?? null,
        script: m.script ?? null,
        caption: m.caption ?? null,
        assigned_client_ids: manualParticipants.filter((p) => p.event_id === m.id && p.role === 'client').map((p) => p.profile_id),
        assigned_team_ids: manualParticipants.filter((p) => p.event_id === m.id && p.role === 'team').map((p) => p.profile_id),
        created_at: m.created_at,
      })
    }

    let filtered = events
    if (from) filtered = filtered.filter((e) => e.date >= from)
    if (to)   filtered = filtered.filter((e) => e.date <= to)

    res.json(filtered)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleCalendarEvents(req: VercelRequest, res: VercelResponse) {
  try {
    const { clerkUserId } = await requireAuth(req)

    if (req.method === 'GET') {
      const [profileRow] = await dbQuery<{ role: string }>('SELECT role FROM profiles WHERE id = ?', [clerkUserId])
      const role = profileRow?.role

      let events: unknown[]
      if (role === 'admin') {
        events = await dbQuery('SELECT * FROM calendar_events ORDER BY date ASC', [])
      } else if (role === 'client') {
        events = await dbQuery(
          `SELECT e.* FROM calendar_events e
           LEFT JOIN calendar_event_participants p ON p.event_id = e.id AND p.profile_id = ?
           WHERE e.owner_id = ? OR p.profile_id = ?
           ORDER BY e.date ASC`,
          [clerkUserId, clerkUserId, clerkUserId]
        )
      } else {
        events = await dbQuery(
          `SELECT e.* FROM calendar_events e
           LEFT JOIN calendar_event_participants p ON p.event_id = e.id AND p.profile_id = ?
           WHERE e.owner_id = ? OR p.profile_id = ?
           ORDER BY e.date ASC`,
          [clerkUserId, clerkUserId, clerkUserId]
        )
      }

      const eventIds = (events as { id: string }[]).map((e) => e.id)
      const participants = eventIds.length > 0
        ? await dbQuery<{ event_id: string; profile_id: string; role: string }>(
            `SELECT event_id, profile_id, role FROM calendar_event_participants WHERE event_id IN (${eventIds.map(() => '?').join(',')})`,
            eventIds
          )
        : []

      const enriched = (events as Record<string, unknown>[]).map((e) => ({
        ...e,
        double_down: Boolean(e.double_down),
        assigned_client_ids: participants.filter((p) => p.event_id === e.id && p.role === 'client').map((p) => p.profile_id),
        assigned_team_ids:   participants.filter((p) => p.event_id === e.id && p.role === 'team').map((p) => p.profile_id),
      }))

      return ok(res, enriched)
    }

    if (req.method === 'POST') {
      const {
        title, date, color, content_type, content_status, comments, double_down,
        inspiration_url, script, caption,
        assigned_client_ids, assigned_team_ids,
      } = req.body as {
        title: string
        date: string
        color?: string
        content_type?: string | null
        content_status?: string | null
        comments?: string | null
        double_down?: boolean
        inspiration_url?: string | null
        script?: string | null
        caption?: string | null
        assigned_client_ids?: string[]
        assigned_team_ids?: string[]
      }

      if (!title || !date) return err(res, 'title and date are required', 400)

      const VALID_CONTENT_TYPES = ['Reel', 'Story', 'Carousel', 'Post']
      const VALID_CONTENT_STATUSES = ['Idea', 'Drafting', 'Scheduled']

      if (content_type && !VALID_CONTENT_TYPES.includes(content_type)) return err(res, 'Invalid content_type', 400)
      if (content_status && !VALID_CONTENT_STATUSES.includes(content_status)) return err(res, 'Invalid content_status', 400)

      const [profile] = await dbQuery<{ role: string }>('SELECT role FROM profiles WHERE id = ?', [clerkUserId])
      const isAdmin = profile?.role === 'admin'

      const id = newId()
      const now = nowIso()
      const eventColor = color ?? 'bg-indigo-500'

      await dbExecute(
        `INSERT INTO calendar_events (id, owner_id, title, date, color, content_type, content_status, comments, double_down, inspiration_url, script, caption, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, clerkUserId, title, date, eventColor, content_type ?? null, content_status ?? null, comments ?? null, double_down ? 1 : 0, inspiration_url ?? null, script ?? null, caption ?? null, now, now]
      )

      if (isAdmin) {
        for (const profileId of (assigned_client_ids ?? [])) {
          await dbExecute(
            'INSERT OR IGNORE INTO calendar_event_participants (event_id, profile_id, role) VALUES (?, ?, ?)',
            [id, profileId, 'client']
          )
        }
        for (const profileId of (assigned_team_ids ?? [])) {
          await dbExecute(
            'INSERT OR IGNORE INTO calendar_event_participants (event_id, profile_id, role) VALUES (?, ?, ?)',
            [id, profileId, 'team']
          )
        }
      }

      const [created] = await dbQuery<Record<string, unknown>>(
        'SELECT * FROM calendar_events WHERE id = ?',
        [id]
      )

      return ok(res, { ...created, double_down: Boolean(created.double_down) }, 201)
    }

    return err(res, 'Method not allowed', 405)
  } catch (e) {
    return handleError(res, e)
  }
}

async function handleCalendarEvent(req: VercelRequest, res: VercelResponse) {
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    const id = req.query.id as string

    const [event] = await dbQuery<{ id: string; owner_id: string }>(
      'SELECT * FROM calendar_events WHERE id = ?',
      [id]
    )

    if (!event) return err(res, 'Event not found', 404)
    if (event.owner_id !== clerkUserId && profile.role !== 'admin') return err(res, 'Forbidden', 403)

    if (req.method === 'PATCH') {
      const {
        title, date, color, content_type, content_status, comments, double_down,
        inspiration_url, script, caption,
        assigned_client_ids, assigned_team_ids,
      } = req.body as {
        title?: string
        date?: string
        color?: string
        content_type?: string | null
        content_status?: string | null
        comments?: string | null
        double_down?: boolean
        inspiration_url?: string | null
        script?: string | null
        caption?: string | null
        assigned_client_ids?: string[]
        assigned_team_ids?: string[]
      }

      const VALID_CONTENT_TYPES = ['Reel', 'Story', 'Carousel', 'Post']
      const VALID_CONTENT_STATUSES = ['Idea', 'Drafting', 'Scheduled']

      if (content_type !== undefined && content_type !== null && !VALID_CONTENT_TYPES.includes(content_type)) {
        return err(res, 'Invalid content_type', 400)
      }
      if (content_status !== undefined && content_status !== null && !VALID_CONTENT_STATUSES.includes(content_status)) {
        return err(res, 'Invalid content_status', 400)
      }

      const fields: string[] = []
      const values: unknown[] = []

      if (title           !== undefined) { fields.push('title = ?');           values.push(title) }
      if (date            !== undefined) { fields.push('date = ?');            values.push(date) }
      if (color           !== undefined) { fields.push('color = ?');           values.push(color) }
      if (content_type    !== undefined) { fields.push('content_type = ?');    values.push(content_type ?? null) }
      if (content_status  !== undefined) { fields.push('content_status = ?');  values.push(content_status ?? null) }
      if (comments        !== undefined) { fields.push('comments = ?');        values.push(comments ?? null) }
      if (double_down     !== undefined) { fields.push('double_down = ?');     values.push(double_down ? 1 : 0) }
      if (inspiration_url !== undefined) { fields.push('inspiration_url = ?'); values.push(inspiration_url ?? null) }
      if (script          !== undefined) { fields.push('script = ?');          values.push(script ?? null) }
      if (caption         !== undefined) { fields.push('caption = ?');         values.push(caption ?? null) }

      if (fields.length === 0 && assigned_client_ids === undefined && assigned_team_ids === undefined) {
        return err(res, 'No fields to update', 400)
      }

      if (fields.length > 0) {
        fields.push('updated_at = ?')
        values.push(nowIso())
        values.push(id)
        await dbExecute(`UPDATE calendar_events SET ${fields.join(', ')} WHERE id = ?`, values)
      }

      if (assigned_client_ids !== undefined || assigned_team_ids !== undefined) {
        if (profile.role === 'admin') {
          if (assigned_client_ids !== undefined) {
            await dbExecute('DELETE FROM calendar_event_participants WHERE event_id = ? AND role = ?', [id, 'client'])
            for (const profileId of assigned_client_ids) {
              await dbExecute(
                'INSERT OR IGNORE INTO calendar_event_participants (event_id, profile_id, role) VALUES (?, ?, ?)',
                [id, profileId, 'client']
              )
            }
          }
          if (assigned_team_ids !== undefined) {
            await dbExecute('DELETE FROM calendar_event_participants WHERE event_id = ? AND role = ?', [id, 'team'])
            for (const profileId of assigned_team_ids) {
              await dbExecute(
                'INSERT OR IGNORE INTO calendar_event_participants (event_id, profile_id, role) VALUES (?, ?, ?)',
                [id, profileId, 'team']
              )
            }
          }
        }
      }

      const [updated] = await dbQuery<Record<string, unknown>>('SELECT * FROM calendar_events WHERE id = ?', [id])
      return ok(res, { ...updated, double_down: Boolean(updated.double_down) })
    }

    if (req.method === 'DELETE') {
      await dbExecute('DELETE FROM calendar_events WHERE id = ?', [id])
      return ok(res, { deleted: true })
    }

    return err(res, 'Method not allowed', 405)
  } catch (e) {
    return handleError(res, e)
  }
}

interface CommentRow {
  id: string
  event_id: string
  author_id: string
  text: string
  created_at: string
  author_name: string
  author_role: string
  author_avatar: string | null
}

async function handleEventComments(req: VercelRequest, res: VercelResponse) {
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    const eventId = req.query.id as string

    const [event] = await dbQuery<{ id: string; owner_id: string }>(
      'SELECT id, owner_id FROM calendar_events WHERE id = ?',
      [eventId]
    )
    if (!event) return err(res, 'Event not found', 404)

    if (profile.role !== 'admin' && event.owner_id !== clerkUserId) {
      const [participant] = await dbQuery<{ profile_id: string }>(
        'SELECT profile_id FROM calendar_event_participants WHERE event_id = ? AND profile_id = ?',
        [eventId, clerkUserId]
      )
      if (!participant) return err(res, 'Forbidden', 403)
    }

    if (req.method === 'GET') {
      const comments = await dbQuery<CommentRow>(
        `SELECT c.id, c.event_id, c.author_id, c.text, c.created_at,
                p.full_name AS author_name, p.role AS author_role, p.avatar_url AS author_avatar
         FROM calendar_event_comments c
         JOIN profiles p ON p.id = c.author_id
         WHERE c.event_id = ?
         ORDER BY c.created_at ASC`,
        [eventId]
      )
      return ok(res, comments)
    }

    if (req.method === 'POST') {
      const { text } = req.body as { text: string }
      if (!text?.trim()) return err(res, 'text is required', 400)

      const id = newId()
      const now = nowIso()

      await dbExecute(
        'INSERT INTO calendar_event_comments (id, event_id, author_id, text, created_at) VALUES (?, ?, ?, ?, ?)',
        [id, eventId, clerkUserId, text.trim(), now]
      )

      const [created] = await dbQuery<CommentRow>(
        `SELECT c.id, c.event_id, c.author_id, c.text, c.created_at,
                p.full_name AS author_name, p.role AS author_role, p.avatar_url AS author_avatar
         FROM calendar_event_comments c
         JOIN profiles p ON p.id = c.author_id
         WHERE c.id = ?`,
        [id]
      )
      return ok(res, created, 201)
    }

    return err(res, 'Method not allowed', 405)
  } catch (e) {
    return handleError(res, e)
  }
}

async function handleDeleteEventComment(req: VercelRequest, res: VercelResponse) {
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    const eventId = req.query.id as string
    const commentId = req.query.commentId as string

    if (req.method === 'DELETE') {
      const [comment] = await dbQuery<{ id: string; author_id: string }>(
        'SELECT id, author_id FROM calendar_event_comments WHERE id = ? AND event_id = ?',
        [commentId, eventId]
      )
      if (!comment) return err(res, 'Comment not found', 404)

      if (comment.author_id !== clerkUserId && profile.role !== 'admin') {
        return err(res, 'Forbidden', 403)
      }

      await dbExecute('DELETE FROM calendar_event_comments WHERE id = ?', [commentId])
      return ok(res, { ok: true })
    }

    return err(res, 'Method not allowed', 405)
  } catch (e) {
    return handleError(res, e)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DEADLINES
// ─────────────────────────────────────────────────────────────────────────────

async function handlePatchDeadline(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { profile } = await requireAuth(req)
    requireRole(profile, 'admin')

    const deadlineId = req.query.id as string

    const [dl] = await dbQuery<Deadline>('SELECT * FROM deadlines WHERE id = ?', [deadlineId])
    if (!dl) { res.status(404).json({ error: 'Deadline not found' }); return }

    const { due_at, status } = req.body
    const updates: string[] = []
    const params: unknown[] = []

    if (due_at !== undefined) {
      if (isNaN(Date.parse(due_at))) {
        res.status(400).json({ error: 'due_at must be a valid ISO datetime string' }); return
      }
      updates.push('due_at = ?')
      params.push(new Date(due_at).toISOString())
    }

    if (status !== undefined) {
      if (!['met', 'missed', 'pending'].includes(status)) {
        res.status(400).json({ error: 'status must be met, missed, or pending' }); return
      }
      updates.push('status = ?')
      params.push(status)
      updates.push('resolved_at = ?')
      params.push(status === 'pending' ? null : nowIso())
    }

    if (updates.length === 0) { res.status(400).json({ error: 'Nothing to update' }); return }

    params.push(deadlineId)
    await dbExecute(`UPDATE deadlines SET ${updates.join(', ')} WHERE id = ?`, params)

    const [updated] = await dbQuery<Deadline>('SELECT * FROM deadlines WHERE id = ?', [deadlineId])
    res.json(updated)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

interface DeadlineRow extends Deadline {
  member_full_name: string
  member_email: string
  project_title: string
}

async function handleGetProjectDeadlines(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    const projectId = req.query.projectId as string

    if (profile.role === 'client') { res.status(403).json({ error: 'Forbidden' }); return }

    let rows: DeadlineRow[]

    if (profile.role === 'admin') {
      rows = await dbQuery<DeadlineRow>(
        `SELECT d.*,
                p.full_name AS member_full_name,
                p.email     AS member_email,
                pr.title    AS project_title
         FROM deadlines d
         JOIN profiles p  ON p.id  = d.team_member_id
         JOIN projects pr ON pr.id = d.project_id
         WHERE d.project_id = ?
         ORDER BY d.due_at ASC`,
        [projectId]
      )
    } else {
      rows = await dbQuery<DeadlineRow>(
        `SELECT d.*,
                p.full_name AS member_full_name,
                p.email     AS member_email,
                pr.title    AS project_title
         FROM deadlines d
         JOIN profiles p  ON p.id  = d.team_member_id
         JOIN projects pr ON pr.id = d.project_id
         WHERE d.project_id = ? AND d.team_member_id = ?
         ORDER BY d.due_at ASC`,
        [projectId, clerkUserId]
      )
    }

    res.json(rows)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

async function handleGetNotifications(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId } = await requireAuth(req)

    const notifications = await dbQuery<Notification>(
      `SELECT * FROM notifications WHERE recipient_id = ? ORDER BY created_at DESC LIMIT 50`,
      [clerkUserId]
    )

    const shaped = notifications.map((n) => ({ ...n, read: Boolean(n.read) }))
    res.json(shaped)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleMarkAllRead(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId } = await requireAuth(req)

    await dbExecute(
      'UPDATE notifications SET read = 1 WHERE recipient_id = ? AND read = 0',
      [clerkUserId]
    )

    res.json({ ok: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleMarkNotificationRead(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId } = await requireAuth(req)
    const notificationId = req.query.id as string

    await dbExecute(
      'UPDATE notifications SET read = 1 WHERE id = ? AND recipient_id = ?',
      [notificationId, clerkUserId]
    )

    res.json({ ok: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PLANS
// ─────────────────────────────────────────────────────────────────────────────

async function handlePlans(req: VercelRequest, res: VercelResponse) {
  try {
    const { profile } = await requireAuth(req)

    if (req.method === 'GET') {
      const plans = await dbQuery<Plan>('SELECT * FROM plans ORDER BY max_deliverables ASC')
      res.json(plans); return
    }

    requireRole(profile, 'admin')

    if (req.method === 'POST') {
      const { name, max_deliverables, max_client_revisions, storage_limit_mb, max_active_projects } = req.body
      if (!name || max_deliverables == null || max_client_revisions == null || storage_limit_mb == null) {
        res.status(400).json({ error: 'name, max_deliverables, max_client_revisions, storage_limit_mb required' }); return
      }
      const id = 'plan_' + newId()
      await dbExecute(
        'INSERT INTO plans (id, name, max_deliverables, max_client_revisions, storage_limit_mb, max_active_projects, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, String(name), Number(max_deliverables), Number(max_client_revisions), Number(storage_limit_mb), max_active_projects != null ? Number(max_active_projects) : -1, nowIso()]
      )
      const [plan] = await dbQuery<Plan>('SELECT * FROM plans WHERE id = ?', [id])
      res.status(201).json(plan); return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handlePlan(req: VercelRequest, res: VercelResponse) {
  try {
    const { profile } = await requireAuth(req)

    const planId = req.query.id as string

    if (req.method === 'GET') {
      const [plan] = await dbQuery<Plan>('SELECT * FROM plans WHERE id = ?', [planId])
      if (!plan) { res.status(404).json({ error: 'Plan not found' }); return }
      res.json(plan); return
    }

    requireRole(profile, 'admin')

    if (req.method === 'PUT') {
      const { name, max_deliverables, max_client_revisions, storage_limit_mb, max_active_projects } = req.body
      if (!name || max_deliverables == null || max_client_revisions == null || storage_limit_mb == null) {
        res.status(400).json({ error: 'name, max_deliverables, max_client_revisions, storage_limit_mb required' }); return
      }
      await dbExecute(
        'UPDATE plans SET name = ?, max_deliverables = ?, max_client_revisions = ?, storage_limit_mb = ?, max_active_projects = ? WHERE id = ?',
        [String(name), Number(max_deliverables), Number(max_client_revisions), Number(storage_limit_mb), max_active_projects != null ? Number(max_active_projects) : -1, planId]
      )
      const [plan] = await dbQuery<Plan>('SELECT * FROM plans WHERE id = ?', [planId])
      if (!plan) { res.status(404).json({ error: 'Plan not found' }); return }
      res.json(plan); return
    }

    if (req.method === 'DELETE') {
      const [row] = await dbQuery<{ count: number }>(
        'SELECT COUNT(*) AS count FROM profiles WHERE plan_id = ? AND role = ?',
        [planId, 'client']
      )
      if (row?.count > 0) {
        res.status(409).json({ error: `Cannot delete — ${row.count} client(s) are on this plan. Reassign them first.` }); return
      }
      await dbExecute('DELETE FROM plans WHERE id = ?', [planId])
      res.json({ ok: true }); return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFILES
// ─────────────────────────────────────────────────────────────────────────────

async function handleProfile(req: VercelRequest, res: VercelResponse) {
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    if (req.method === 'GET') {
      res.json({ ...profile, password_changed: Boolean(profile.password_changed), disabled: Boolean(profile.disabled) })

    } else if (req.method === 'PATCH') {
      const body = req.body as Partial<Pick<Profile, 'password_changed' | 'avatar_url' | 'phone'>>
      const updates: string[] = []
      const params: unknown[] = []

      if (body.password_changed !== undefined) {
        updates.push('password_changed = ?')
        params.push(body.password_changed ? 1 : 0)
      }
      if (body.avatar_url !== undefined) {
        updates.push('avatar_url = ?')
        params.push(body.avatar_url)
      }
      if (body.phone !== undefined) {
        updates.push('phone = ?')
        params.push(body.phone)
      }

      if (updates.length === 0) { res.status(400).json({ error: 'Nothing to update' }); return }

      updates.push('updated_at = ?')
      params.push(nowIso())
      params.push(clerkUserId)

      await dbExecute(`UPDATE profiles SET ${updates.join(', ')} WHERE id = ?`, params)

      const rows = await dbQuery<Profile>('SELECT * FROM profiles WHERE id = ?', [clerkUserId])
      const p = rows[0]
      res.json({ ...p, password_changed: Boolean(p.password_changed), disabled: Boolean(p.disabled) })

    } else {
      res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT ASSIGNMENTS
// ─────────────────────────────────────────────────────────────────────────────

async function handleGetAllAssignments(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { profile } = await requireAuth(req)
    requireRole(profile, 'admin')

    const rows = await dbQuery<any>(
      `SELECT pa.team_member_id, p.full_name AS profile_full_name
       FROM project_assignments pa
       LEFT JOIN profiles p ON pa.team_member_id = p.id`
    )

    const shaped = rows.map(({ profile_full_name, ...a }: any) => ({
      ...a,
      profiles: { full_name: profile_full_name },
    }))

    res.json(shaped)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleGetProjectAssignments(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    const projectId = req.query.projectId as string

    if (profile.role === 'client') {
      res.status(403).json({ error: 'Forbidden' }); return
    }
    // Team members can view assignments for any project

    const rows = await dbQuery<any>(
      `SELECT pa.*,
        p.id         AS profile_id,
        p.full_name  AS profile_full_name,
        p.email      AS profile_email,
        p.avatar_url AS profile_avatar_url
       FROM project_assignments pa
       LEFT JOIN profiles p ON pa.team_member_id = p.id
       WHERE pa.project_id = ?`,
      [projectId]
    )

    const shaped = rows.map(({ profile_id, profile_full_name, profile_email, profile_avatar_url, ...a }: any) => ({
      ...a,
      profiles: {
        id: profile_id,
        full_name: profile_full_name,
        email: profile_email,
        avatar_url: profile_avatar_url,
      },
    }))

    res.json(shaped)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TIMELINE COMMENTS
// ─────────────────────────────────────────────────────────────────────────────

async function handleGetTimelineComments(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    const projectId = req.query.projectId as string

    if (profile.role === 'client') {
      const rows = await dbQuery<{ id: string }>(
        'SELECT id FROM projects WHERE id = ? AND client_id = ?',
        [projectId, clerkUserId]
      )
      if (!rows[0]) { res.status(403).json({ error: 'Forbidden' }); return }
    }
    // Team members can view timeline comments for any project

    const comments = await dbQuery<any>(
      `SELECT tc.*,
        p.full_name  AS profile_full_name,
        p.avatar_url AS profile_avatar_url
       FROM timeline_comments tc
       LEFT JOIN profiles p ON tc.author_id = p.id
       WHERE tc.project_id = ?
       ORDER BY tc.created_at ASC`,
      [projectId]
    )

    const shaped = comments.map(({ profile_full_name, profile_avatar_url, ...c }: any) => ({
      ...c,
      profiles: { full_name: profile_full_name, avatar_url: profile_avatar_url },
    }))

    res.json(shaped)
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleCreateTimelineComment(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId, profile } = await requireAuth(req)

    const { project_id, timestamp_sec, comment_text, revision_round } = req.body

    if (!project_id || !comment_text) {
      res.status(400).json({ error: 'project_id and comment_text required' }); return
    }

    if (profile.role === 'client') {
      const projects = await dbQuery<{ id: string }>(
        'SELECT id FROM projects WHERE id = ? AND client_id = ?',
        [project_id, clerkUserId]
      )
      if (!projects[0]) { res.status(403).json({ error: 'Forbidden' }); return }
    } else {
      const [proj] = await dbQuery<{ id: string }>('SELECT id FROM projects WHERE id = ?', [project_id])
      if (!proj) { res.status(404).json({ error: 'Project not found' }); return }
    }
    // Team members can comment on any project

    const author_role = profile.role

    const id = newId()
    const now = nowIso()

    await dbExecute(
      `INSERT INTO timeline_comments (id, project_id, author_id, author_role, timestamp_sec, comment_text, revision_round, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, project_id, clerkUserId, author_role, timestamp_sec ?? null, comment_text, revision_round ?? 1, now]
    )

    res.status(201).json({ id, project_id, author_id: clerkUserId, author_role, timestamp_sec: timestamp_sec ?? null, comment_text, revision_round: revision_round ?? 1, created_at: now })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEAM NOTES
// ─────────────────────────────────────────────────────────────────────────────

async function handleTeamNotes(req: VercelRequest, res: VercelResponse) {
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    const projectId = req.query.projectId as string

    if (profile.role === 'client') { res.status(403).json({ error: 'Forbidden' }); return }

    if (req.method === 'GET') {
      let rows: TeamNote[]

      if (profile.role === 'admin') {
        rows = await dbQuery<TeamNote>(
          `SELECT n.*, p.full_name AS author_name
           FROM team_notes n
           JOIN profiles p ON p.id = n.author_id
           WHERE n.project_id = ?
           ORDER BY n.created_at ASC`,
          [projectId]
        )
      } else {
        rows = await dbQuery<TeamNote>(
          `SELECT n.*, p.full_name AS author_name
           FROM team_notes n
           JOIN profiles p ON p.id = n.author_id
           WHERE n.project_id = ? AND n.author_id = ?
           ORDER BY n.created_at ASC`,
          [projectId, clerkUserId]
        )
      }

      res.json(rows); return
    }

    if (req.method === 'POST') {
      requireRole(profile, 'team')

      const [assignment] = await dbQuery<{ id: string }>(
        'SELECT id FROM project_assignments WHERE project_id = ? AND team_member_id = ?',
        [projectId, clerkUserId]
      )
      if (!assignment) { res.status(403).json({ error: 'Forbidden' }); return }

      const { text, timestamp_sec } = req.body
      if (!text?.trim()) { res.status(400).json({ error: 'text required' }); return }

      const id = newId()
      const now = nowIso()
      await dbExecute(
        `INSERT INTO team_notes (id, project_id, author_id, timestamp_sec, text, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, projectId, clerkUserId, timestamp_sec ?? null, text.trim(), now]
      )

      const [note] = await dbQuery<TeamNote>('SELECT * FROM team_notes WHERE id = ?', [id])
      res.status(201).json(note); return
    }

    if (req.method === 'DELETE') {
      const noteId = req.query.noteId as string
      if (!noteId) { res.status(400).json({ error: 'noteId query param required' }); return }

      const [note] = await dbQuery<TeamNote>('SELECT * FROM team_notes WHERE id = ?', [noteId])
      if (!note) { res.status(404).json({ error: 'Note not found' }); return }

      if (profile.role === 'team' && note.author_id !== clerkUserId) {
        res.status(403).json({ error: 'Forbidden' }); return
      }

      await dbExecute('DELETE FROM team_notes WHERE id = ?', [noteId])
      res.json({ ok: true }); return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REVISIONS
// ─────────────────────────────────────────────────────────────────────────────

async function handleSubmitRevision(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    requireRole(profile, 'client')

    const { project_id } = req.body
    if (!project_id) { res.status(400).json({ error: 'project_id required' }); return }

    const projects = await dbQuery<Project>(
      'SELECT * FROM projects WHERE id = ? AND client_id = ?',
      [project_id, clerkUserId]
    )
    const project = projects[0]
    if (!project) { res.status(404).json({ error: 'Project not found' }); return }

    if (project.status !== 'client_reviewing') {
      res.status(403).json({ error: 'Revisions can only be requested while the project is in review' }); return
    }

    if (
      project.max_client_revisions !== -1 &&
      project.client_revision_count >= project.max_client_revisions
    ) {
      res.status(403).json({ error: 'revision_limit_reached' }); return
    }

    const now = nowIso()

    await dbExecute(
      'UPDATE projects SET status = ?, client_revision_count = ?, updated_at = ? WHERE id = ?',
      ['revision_requested', project.client_revision_count + 1, now, project_id]
    )

    const admins = await dbQuery<{ id: string }>('SELECT id FROM profiles WHERE role = ? AND disabled = 0', ['admin'])
    const assignments = await dbQuery<{ team_member_id: string }>(
      'SELECT team_member_id FROM project_assignments WHERE project_id = ?',
      [project_id]
    )

    const recipients = [
      ...admins.map((a) => a.id),
      ...assignments.map((a) => a.team_member_id),
    ]

    for (const recipient_id of recipients) {
      await dbExecute(
        'INSERT INTO notifications (id, recipient_id, project_id, type, message, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
        [newId(), recipient_id, project_id, 'revision_requested', `Client requested a revision on project "${project.title}"`, now]
      )
    }

    res.json({ ok: true })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DOWNLOADS
// ─────────────────────────────────────────────────────────────────────────────

async function handleDownload(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId, profile } = await requireAuth(req)
    requireRole(profile, 'client')

    const { projectId, fileId } = req.query as { projectId: string; fileId: string }

    const projects = await dbQuery<Project>(
      'SELECT * FROM projects WHERE id = ? AND client_id = ?',
      [projectId, clerkUserId]
    )
    const project = projects[0]
    if (!project) { res.status(404).json({ error: 'Project not found' }); return }
    if (project.status !== 'client_approved') {
      res.status(403).json({ error: 'Project not approved' }); return
    }

    const files = await dbQuery<ProjectFile>(
      "SELECT * FROM project_files WHERE id = ? AND project_id = ? AND file_type = 'deliverable'",
      [fileId, projectId]
    )
    const file = files[0]
    if (!file) { res.status(404).json({ error: 'File not found' }); return }
    if (!file.approved) { res.status(403).json({ error: 'File not approved for download' }); return }

    const signedUrl = await getPresignedDownloadUrl(file.storage_key, 3600)
    res.json({ signedUrl })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN
// ─────────────────────────────────────────────────────────────────────────────

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

async function handleAdminLibrary(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { profile } = await requireAuth(req)
    requireRole(profile, 'admin')

    const clientId = req.query.client_id as string | undefined
    const fileType = req.query.file_type as string | undefined

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

// ─────────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────────

async function handleAuthLogin(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { email, password } = req.body as { email: string; password: string }
    if (!email || !password) { res.status(400).json({ error: 'Email and password required' }); return }

    const rows = await dbQuery<Profile & { password_hash: string | null }>(
      'SELECT * FROM profiles WHERE email = ? AND disabled = 0',
      [email.toLowerCase().trim()]
    )
    const user = rows[0]
    if (!user) { res.status(401).json({ error: 'Invalid email or password' }); return }

    if (!user.password_hash) { res.status(401).json({ error: 'Account not yet activated. Contact your administrator.' }); return }

    const valid = await comparePassword(password, user.password_hash)
    if (!valid) { res.status(401).json({ error: 'Invalid email or password' }); return }

    const token = await signJwt({ sub: user.id, role: user.role })
    const { password_hash: _ph, ...profile } = user
    res.json({ token, profile: { ...profile, password_changed: Boolean(profile.password_changed), disabled: Boolean(profile.disabled) } })
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? 'Internal error' })
  }
}

async function handleAuthChangePassword(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const { clerkUserId } = await requireAuth(req)
    const { password } = req.body as { password: string }
    if (!password || password.length < 12) { res.status(400).json({ error: 'Password must be at least 12 characters' }); return }

    const hash = await hashPassword(password)
    await dbExecute(
      'UPDATE profiles SET password_hash = ?, password_changed = 1, updated_at = ? WHERE id = ?',
      [hash, nowIso(), clerkUserId]
    )
    const rows = await dbQuery<Profile>('SELECT * FROM profiles WHERE id = ?', [clerkUserId])
    const p = rows[0]
    res.json({ ...p, password_changed: Boolean(p.password_changed), disabled: Boolean(p.disabled) })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ROUTER
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // When routed via explicit routes rule, slug may be a string like "auth/login"
  // or an array. Normalize to always be a string array.
  const rawSlug = req.query.slug
  const slug: string[] = Array.isArray(rawSlug)
    ? rawSlug
    : typeof rawSlug === 'string'
      ? rawSlug.split('/').filter(Boolean)
      : (req.url?.replace(/^\/api\//, '').split('?')[0].split('/').filter(Boolean) ?? [])

  // Block cron routes — they have their own dedicated file
  if (slug[0] === 'cron') {
    res.status(404).json({ error: 'Not found' })
    return
  }

  // ── auth ───────────────────────────────────────────────────────────────────
  if (slug[0] === 'auth') {
    if (slug[1] === 'login') return handleAuthLogin(req, res)
    if (slug[1] === 'change-password') return handleAuthChangePassword(req, res)
    res.status(404).json({ error: 'Not found' }); return
  }

  // ── users ──────────────────────────────────────────────────────────────────
  if (slug[0] === 'users') {
    if (slug.length === 1) {
      return handleGetUsers(req, res)
    }
    if (slug[1] === 'clients' && slug.length === 2) {
      return handleGetClients(req, res)
    }
    if (slug[1] === 'team' && slug.length === 2) {
      return handleGetTeam(req, res)
    }
    if (slug[1] === 'create' && slug.length === 2) {
      return handleCreateUser(req, res)
    }
    // /api/users/[id] — DELETE
    if (slug.length === 2 && req.method === 'DELETE') {
      ;(req as any).query = { ...(req.query || {}), id: slug[1] }
      return handleDeleteUser(req, res)
    }
    // /api/users/[id]/update — PATCH
    if (slug.length === 3 && slug[2] === 'update') {
      ;(req as any).query = { ...(req.query || {}), id: slug[1] }
      return handleUpdateUser(req, res)
    }
    // /api/users/[id]/disable — PATCH
    if (slug.length === 3 && slug[2] === 'disable') {
      ;(req as any).query = { ...(req.query || {}), id: slug[1] }
      return handleDisableUser(req, res)
    }
    // /api/users/[id]/enable — PATCH
    if (slug.length === 3 && slug[2] === 'enable') {
      ;(req as any).query = { ...(req.query || {}), id: slug[1] }
      return handleEnableUser(req, res)
    }
    // /api/users/[id]/impersonate — POST
    if (slug.length === 3 && slug[2] === 'impersonate') {
      ;(req as any).query = { ...(req.query || {}), id: slug[1] }
      return handleImpersonateUser(req, res)
    }
    res.status(404).json({ error: 'Not found' }); return
  }

  // ── projects ───────────────────────────────────────────────────────────────
  if (slug[0] === 'projects') {
    if (slug.length === 1) {
      return handleGetProjects(req, res)
    }
    if (slug[1] === 'create' && slug.length === 2) {
      return handleCreateProject(req, res)
    }
    if (slug.length === 2) {
      ;(req as any).query = { ...(req.query || {}), id: slug[1] }
      return handleGetProject(req, res)
    }
    if (slug.length === 3 && slug[2] === 'assign') {
      ;(req as any).query = { ...(req.query || {}), id: slug[1] }
      return handleAssignProject(req, res)
    }
    if (slug.length === 3 && slug[2] === 'status') {
      ;(req as any).query = { ...(req.query || {}), id: slug[1] }
      return handleUpdateProjectStatus(req, res)
    }
    if (slug.length === 3 && slug[2] === 'approve-client') {
      ;(req as any).query = { ...(req.query || {}), id: slug[1] }
      return handleApproveClient(req, res)
    }
    res.status(404).json({ error: 'Not found' }); return
  }

  // ── project-files ──────────────────────────────────────────────────────────
  if (slug[0] === 'project-files') {
    if (slug[1] === 'project' && slug.length === 3) {
      ;(req as any).query = { ...(req.query || {}), projectId: slug[2] }
      return handleGetProjectFiles(req, res)
    }
    if (slug[1] === 'register' && slug.length === 2) {
      return handleRegisterProjectFile(req, res)
    }
    if (slug[1] === 'upload-url' && slug.length === 2) {
      return handleGetProjectFileUploadUrl(req, res)
    }
    if (slug.length === 2 && req.method === 'DELETE') {
      ;(req as any).query = { ...(req.query || {}), id: slug[1] }
      return handleDeleteProjectFile(req, res)
    }
    if (slug.length === 3 && slug[2] === 'approve') {
      ;(req as any).query = { ...(req.query || {}), id: slug[1] }
      return handleApproveProjectFile(req, res)
    }
    if (slug.length === 3 && slug[2] === 'signed-url') {
      ;(req as any).query = { ...(req.query || {}), id: slug[1] }
      return handleGetProjectFileSignedUrl(req, res)
    }
    res.status(404).json({ error: 'Not found' }); return
  }

  // ── messages ───────────────────────────────────────────────────────────────
  if (slug[0] === 'messages') {
    if (slug[1] === 'connections' && slug.length === 2) {
      if (req.method === 'GET') return handleGetConnections(req, res)
      if (req.method === 'POST') return handleCreateConnection(req, res)
      res.status(405).json({ error: 'Method not allowed' }); return
    }
    if (slug[1] === 'connections' && slug.length === 3) {
      ;(req as any).query = { ...(req.query || {}), id: slug[2] }
      return handleDeleteConnection(req, res)
    }
    if (slug[1] === 'groups' && slug.length === 2) {
      if (req.method === 'GET') return handleGetGroups(req, res)
      if (req.method === 'POST') return handleCreateGroup(req, res)
      res.status(405).json({ error: 'Method not allowed' }); return
    }
    if (slug[1] === 'groups' && slug.length === 3) {
      ;(req as any).query = { ...(req.query || {}), id: slug[2] }
      return handleGroup(req, res)
    }
    // /api/messages/[conversationId] — GET
    if (slug.length === 2) {
      ;(req as any).query = { ...(req.query || {}), conversationId: slug[1] }
      return handleGetMessages(req, res)
    }
    // /api/messages/[conversationId]/send — POST
    if (slug.length === 3 && slug[2] === 'send') {
      ;(req as any).query = { ...(req.query || {}), conversationId: slug[1] }
      return handleSendMessage(req, res)
    }
    res.status(404).json({ error: 'Not found' }); return
  }

  // ── gallery ────────────────────────────────────────────────────────────────
  if (slug[0] === 'gallery') {
    if (slug.length === 1) {
      return handleGetGallery(req, res)
    }
    if (slug[1] === 'register' && slug.length === 2) {
      return handleRegisterGalleryFile(req, res)
    }
    if (slug[1] === 'upload-url' && slug.length === 2) {
      return handleGetGalleryUploadUrl(req, res)
    }
    if (slug[1] === 'folders' && slug.length === 2) {
      return handleGalleryFolders(req, res)
    }
    if (slug[1] === 'folders' && slug.length === 3) {
      ;(req as any).query = { ...(req.query || {}), id: slug[2] }
      return handleGalleryFolder(req, res)
    }
    if (slug.length === 2) {
      ;(req as any).query = { ...(req.query || {}), id: slug[1] }
      return handleGalleryFile(req, res)
    }
    if (slug.length === 3 && slug[2] === 'signed-url') {
      ;(req as any).query = { ...(req.query || {}), id: slug[1] }
      return handleGetGallerySignedUrl(req, res)
    }
    res.status(404).json({ error: 'Not found' }); return
  }

  // ── calendar ───────────────────────────────────────────────────────────────
  if (slug[0] === 'calendar') {
    if (slug.length === 1) {
      return handleGetCalendar(req, res)
    }
    if (slug[1] === 'events' && slug.length === 2) {
      return handleCalendarEvents(req, res)
    }
    if (slug[1] === 'events' && slug.length === 3) {
      ;(req as any).query = { ...(req.query || {}), id: slug[2] }
      return handleCalendarEvent(req, res)
    }
    // /api/calendar/events/[id]/comments
    if (slug[1] === 'events' && slug[3] === 'comments' && slug.length === 4) {
      ;(req as any).query = { ...(req.query || {}), id: slug[2] }
      return handleEventComments(req, res)
    }
    // /api/calendar/events/[id]/comments/[commentId]
    if (slug[1] === 'events' && slug[3] === 'comments' && slug.length === 5) {
      ;(req as any).query = { ...(req.query || {}), id: slug[2], commentId: slug[4] }
      return handleDeleteEventComment(req, res)
    }
    res.status(404).json({ error: 'Not found' }); return
  }

  // ── deadlines ──────────────────────────────────────────────────────────────
  if (slug[0] === 'deadlines') {
    if (slug.length === 2 && slug[1] !== 'project') {
      ;(req as any).query = { ...(req.query || {}), id: slug[1] }
      return handlePatchDeadline(req, res)
    }
    if (slug[1] === 'project' && slug.length === 3) {
      ;(req as any).query = { ...(req.query || {}), projectId: slug[2] }
      return handleGetProjectDeadlines(req, res)
    }
    res.status(404).json({ error: 'Not found' }); return
  }

  // ── notifications ──────────────────────────────────────────────────────────
  if (slug[0] === 'notifications') {
    if (slug.length === 1) {
      return handleGetNotifications(req, res)
    }
    if (slug[1] === 'mark-all-read' && slug.length === 2) {
      return handleMarkAllRead(req, res)
    }
    if (slug.length === 3 && slug[2] === 'read') {
      ;(req as any).query = { ...(req.query || {}), id: slug[1] }
      return handleMarkNotificationRead(req, res)
    }
    res.status(404).json({ error: 'Not found' }); return
  }

  // ── plans ──────────────────────────────────────────────────────────────────
  if (slug[0] === 'plans') {
    if (slug.length === 1) {
      return handlePlans(req, res)
    }
    if (slug.length === 2) {
      ;(req as any).query = { ...(req.query || {}), id: slug[1] }
      return handlePlan(req, res)
    }
    res.status(404).json({ error: 'Not found' }); return
  }

  // ── profiles ───────────────────────────────────────────────────────────────
  if (slug[0] === 'profiles') {
    if (slug[1] === 'me') {
      return handleProfile(req, res)
    }
    res.status(404).json({ error: 'Not found' }); return
  }

  // ── project-assignments ────────────────────────────────────────────────────
  if (slug[0] === 'project-assignments') {
    if (slug[1] === 'all' && slug.length === 2) {
      return handleGetAllAssignments(req, res)
    }
    if (slug.length === 2) {
      ;(req as any).query = { ...(req.query || {}), projectId: slug[1] }
      return handleGetProjectAssignments(req, res)
    }
    res.status(404).json({ error: 'Not found' }); return
  }

  // ── timeline-comments ──────────────────────────────────────────────────────
  if (slug[0] === 'timeline-comments') {
    if (slug[1] === 'create' && slug.length === 2) {
      return handleCreateTimelineComment(req, res)
    }
    if (slug.length === 2) {
      ;(req as any).query = { ...(req.query || {}), projectId: slug[1] }
      return handleGetTimelineComments(req, res)
    }
    res.status(404).json({ error: 'Not found' }); return
  }

  // ── team-notes ─────────────────────────────────────────────────────────────
  if (slug[0] === 'team-notes') {
    if (slug.length === 2) {
      ;(req as any).query = { ...(req.query || {}), projectId: slug[1] }
      return handleTeamNotes(req, res)
    }
    res.status(404).json({ error: 'Not found' }); return
  }

  // ── revisions ──────────────────────────────────────────────────────────────
  if (slug[0] === 'revisions') {
    if (slug[1] === 'submit' && slug.length === 2) {
      return handleSubmitRevision(req, res)
    }
    res.status(404).json({ error: 'Not found' }); return
  }

  // ── downloads ──────────────────────────────────────────────────────────────
  if (slug[0] === 'downloads') {
    if (slug.length === 3) {
      ;(req as any).query = { ...(req.query || {}), projectId: slug[1], fileId: slug[2] }
      return handleDownload(req, res)
    }
    res.status(404).json({ error: 'Not found' }); return
  }

  // ── admin ──────────────────────────────────────────────────────────────────
  if (slug[0] === 'admin') {
    if (slug[1] === 'library' && slug.length === 2) {
      return handleAdminLibrary(req, res)
    }
    res.status(404).json({ error: 'Not found' }); return
  }

  res.status(404).json({ error: 'Not found' })
}
