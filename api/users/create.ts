import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireRole, createClerkAdmin } from '../_helpers/auth'
import { dbExecute, newId, nowIso } from '../_helpers/db'

function generatePassword(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
  const arr = new Uint8Array(length)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => charset[b % charset.length]).join('')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const { profile: callerProfile } = await requireAuth(req)
    requireRole(callerProfile, 'admin')

    const { full_name, email, phone, role, plan_id, client_id_label } = req.body

    if (!full_name || !email || !role) {
      res.status(400).json({ error: 'Missing required fields' })
      return
    }
    if (!['client', 'team'].includes(role)) {
      res.status(400).json({ error: 'Invalid role' })
      return
    }
    if (role === 'client' && !plan_id) {
      res.status(400).json({ error: 'plan_id required for client role' })
      return
    }

    const tempPassword = generatePassword(16)
    const clerk = createClerkAdmin()

    // Add email to allowlist
    await clerk.allowlistIdentifiers.createAllowlistIdentifier({
      identifier: email,
      notify: false,
    })

    // Create Clerk user
    const clerkUser = await clerk.users.createUser({
      emailAddress: [email],
      password: tempPassword,
      firstName: full_name.split(' ')[0],
      lastName: full_name.split(' ').slice(1).join(' ') || undefined,
      publicMetadata: { role },
    })

    const clerkUserId = clerkUser.id
    const now = nowIso()

    // Insert profile into D1
    await dbExecute(
      `INSERT INTO profiles
         (id, role, full_name, email, phone, plan_id, client_id_label, password_changed, disabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      [
        clerkUserId, role, full_name, email,
        phone ?? null,
        plan_id ?? null,
        role === 'client' ? (client_id_label ?? null) : null,
        now, now,
      ]
    )

    res.status(201).json({ id: clerkUserId, email, temporary_password: tempPassword })
  } catch (e: any) {
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'Internal error' })
  }
}
