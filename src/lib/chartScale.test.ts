import { describe, expect, it } from 'vitest'
import { niceTicks } from './chartScale'

describe('niceTicks', () => {
  it('handles an empty chart', () => {
    expect(niceTicks(0)).toEqual([0, 1])
  })
  it('steps in whole, round numbers that cover the max', () => {
    expect(niceTicks(3)).toEqual([0, 1, 2, 3])
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8])
    expect(niceTicks(23)).toEqual([0, 10, 20, 30])
    const t = niceTicks(137)
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(137)
    expect(t.length).toBeLessThanOrEqual(6)
  })
})
