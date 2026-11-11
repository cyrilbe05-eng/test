import { describe, expect, it } from 'vitest'
import { publicProfile, stripSecrets } from './secrets'

describe('secrets', () => {
  it('publicProfile drops the password hash and keeps the rest', () => {
    expect(publicProfile({ id: 'u1', email: 'a@b.c', password_hash: '$2a$10$x' })).toEqual({ id: 'u1', email: 'a@b.c' })
  })

  it('stripSecrets removes password_hash at any depth', () => {
    const body = {
      token: 't',
      profile: { id: 'u1', password_hash: 'h1' },
      list: [{ id: 'u2', password_hash: 'h2', nested: { password_hash: 'h3', ok: 1 } }],
    }
    const out = JSON.stringify(stripSecrets(body))
    expect(out).not.toContain('password_hash')
    expect(stripSecrets(body)).toEqual({ token: 't', profile: { id: 'u1' }, list: [{ id: 'u2', nested: { ok: 1 } }] })
  })

  it('stripSecrets leaves other values untouched', () => {
    expect(stripSecrets(null)).toBeNull()
    expect(stripSecrets('x')).toBe('x')
    expect(stripSecrets([1, 2])).toEqual([1, 2])
    const d = new Date(0)
    expect(stripSecrets({ d })).toEqual({ d })
  })
})
