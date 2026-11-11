import { describe, expect, it } from 'vitest'
import { attemptKeys, isEndedSession } from './login-guard'

describe('login guard', () => {
  it('counts the email and the first forwarded address', () => {
    expect(attemptKeys('a@b.c', '1.2.3.4, 10.0.0.1')).toEqual(['email:a@b.c', 'ip:1.2.3.4'])
    expect(attemptKeys('a@b.c', undefined)).toEqual(['email:a@b.c'])
  })

  it('ends tokens issued before the cut-off, keeps the new one', () => {
    const cut = '2026-11-11T10:00:00.500Z'
    const cutSec = Math.floor(Date.parse(cut) / 1000)
    expect(isEndedSession(cutSec - 60, cut)).toBe(true)   // old device
    expect(isEndedSession(cutSec, cut)).toBe(false)       // token handed out with the change
    expect(isEndedSession(cutSec + 5, cut)).toBe(false)
    expect(isEndedSession(cutSec - 60, null)).toBe(false) // no cut-off (or pre-migration)
  })
})
