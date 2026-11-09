import { describe, expect, it } from 'vitest'
import { computeTimeSaved, packageOn } from './time-saved'

const c1 = { start_date: '2026-01-01', end_date: '2026-06-30', package: 'editing_only' as const }
const c2 = { start_date: '2026-07-01', end_date: '2026-12-31', package: 'full_package' as const }

describe('packageOn', () => {
  it('the contract running that day', () => {
    expect(packageOn('2026-03-10', [c1, c2])).toBe('editing_only')
    expect(packageOn('2026-08-10', [c2, c1])).toBe('full_package')
  })
  it('between or after contracts: the latest one started before', () => {
    expect(packageOn('2027-02-01', [c1, c2])).toBe('full_package')
  })
  it('before any contract: the first; no contract: editing only', () => {
    expect(packageOn('2025-12-01', [c2, c1])).toBe('editing_only')
    expect(packageOn('2026-03-10', [])).toBe('editing_only')
  })
})

describe('computeTimeSaved', () => {
  it('2 h editing only, 3.5 h full package, 1 h carousel, plus extra', () => {
    const r = computeTimeSaved([
      { delivered_at: '2026-03-10T10:00:00Z' },
      { delivered_at: '2026-08-10T10:00:00Z' },
      { delivered_at: '2026-08-11T10:00:00Z', kind: 'carousel' },
    ], [c1, c2], 4)
    expect(r).toEqual({ auto: 6.5, extra: 4, total: 10.5 })
  })
  it('nothing delivered, nothing typed', () => {
    expect(computeTimeSaved([], [], null)).toEqual({ auto: 0, extra: 0, total: 0 })
  })
})
