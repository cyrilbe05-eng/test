import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
const { hash, compare } = bcrypt
import type { IncomingMessage } from 'http'
import { dbQuery } from './db.js'
import type { Profile } from '../../src/types/index.js'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!)

export interface AuthContext {
  clerkUserId: string
  profile: Profile
}

export async function signJwt(payload: { sub: string; role: string }, expiresIn = '30d'): Promise<string> {
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(JWT_SECRET)
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, 12)
}

export async function comparePassword(password: string, hashed: string): Promise<boolean> {
  return compare(password, hashed)
}

export async function requireAuth(req: IncomingMessage): Promise<AuthContext> {
  const authHeader = (req as any).headers?.authorization as string | undefined
  if (!authHeader?.startsWith('Bearer ')) {
    throw Object.assign(new Error('Unauthorized'), { status: 401 })
  }

  const token = authHeader.replace('Bearer ', '')

  let clerkUserId: string
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    clerkUserId = payload.sub as string
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

// Kept for backwards compat — no longer used but avoids import errors
export function createClerkAdmin() {
  return null
}
