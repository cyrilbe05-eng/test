import { createClerkClient, verifyToken } from '@clerk/backend'
import type { IncomingMessage } from 'http'
import { dbQuery } from './db'
import type { Profile } from '../../src/types'

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })

export interface AuthContext {
  clerkUserId: string
  profile: Profile
}

export async function requireAuth(req: IncomingMessage): Promise<AuthContext> {
  const authHeader = (req as any).headers?.authorization as string | undefined
  if (!authHeader?.startsWith('Bearer ')) {
    throw Object.assign(new Error('Unauthorized'), { status: 401 })
  }

  const token = authHeader.replace('Bearer ', '')

  let clerkUserId: string
  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! })
    clerkUserId = payload.sub
  } catch {
    throw Object.assign(new Error('Unauthorized'), { status: 401 })
  }

  const rows = await dbQuery<Profile>(
    'SELECT * FROM profiles WHERE id = ? AND disabled = 0',
    [clerkUserId]
  )
  if (!rows[0]) {
    throw Object.assign(new Error('Profile not found'), { status: 404 })
  }

  return { clerkUserId, profile: rows[0] }
}

export function requireRole(profile: Profile, ...roles: Profile['role'][]) {
  if (!roles.includes(profile.role)) {
    throw Object.assign(new Error('Forbidden'), { status: 403 })
  }
}

export function createClerkAdmin() {
  return clerk
}
