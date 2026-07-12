import { describe, expect, it } from 'vitest'
import { createRecoveryGate } from './playbackRecovery'

describe('createRecoveryGate', () => {
  it('allows the first attempt immediately', () => {
    const gate = createRecoveryGate()
    expect(gate.canAttempt(0)).toBe(true)
  })

  it('blocks attempts inside the cooldown window', () => {
    const gate = createRecoveryGate({ cooldownMs: 5000 })
    gate.recordAttempt(1000)
    expect(gate.canAttempt(2000)).toBe(false)
    expect(gate.canAttempt(5999)).toBe(false)
    expect(gate.canAttempt(6000)).toBe(true)
  })

  it('stops after maxConsecutive failures', () => {
    const gate = createRecoveryGate({ cooldownMs: 0, maxConsecutive: 3 })
    gate.recordAttempt(0)
    gate.recordAttempt(1)
    gate.recordAttempt(2)
    expect(gate.attempts()).toBe(3)
    expect(gate.canAttempt(10_000)).toBe(false)
  })

  it('reset() clears the failure streak but not the cooldown', () => {
    const gate = createRecoveryGate({ cooldownMs: 5000, maxConsecutive: 2 })
    gate.recordAttempt(0)
    gate.recordAttempt(5000)
    expect(gate.canAttempt(20_000)).toBe(false)
    gate.reset()
    expect(gate.attempts()).toBe(0)
    // cooldown from the last attempt still applies
    expect(gate.canAttempt(5001)).toBe(false)
    expect(gate.canAttempt(10_000)).toBe(true)
  })
})
