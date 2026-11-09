import { describe, expect, it } from 'vitest'
import { bucketFor, inRange, periodRange } from './period'

const now = new Date(2026, 10, 12, 15, 0) // Thu 12 Nov 2026
const d = (y: number, m: number, day: number, h = 0) => new Date(y, m, day, h)

describe('periodRange', () => {
  it('this week starts Monday', () => {
    expect(periodRange('this_week', now)).toEqual({ from: d(2026, 10, 9), to: now })
  })
  it('last week is Monday to Sunday', () => {
    const r = periodRange('last_week', now)
    expect(r.from).toEqual(d(2026, 10, 2))
    expect(r.to.getDate()).toBe(8)
    expect(r.to.getHours()).toBe(23)
  })
  it('this and last month', () => {
    expect(periodRange('this_month', now).from).toEqual(d(2026, 10, 1))
    const lm = periodRange('last_month', now)
    expect(lm.from).toEqual(d(2026, 9, 1))
    expect(lm.to.getDate()).toBe(31)
  })
  it('last 3 months and all time', () => {
    expect(periodRange('last_3_months', now).from).toEqual(d(2026, 7, 12))
    expect(periodRange('all', now).from).toBeNull()
  })
  it('custom: inclusive days, swapped dates fixed, never past now', () => {
    const r = periodRange('custom', now, { from: '2026-10-01', to: '2026-10-05' })
    expect(r.from).toEqual(d(2026, 9, 1))
    expect(r.to.getDate()).toBe(5)
    const swapped = periodRange('custom', now, { from: '2026-10-05', to: '2026-10-01' })
    expect(swapped.from).toEqual(d(2026, 9, 1))
    expect(periodRange('custom', now, { from: '2026-11-01', to: '2027-01-01' }).to).toEqual(now)
  })
})

describe('inRange / bucketFor', () => {
  it('inRange respects both ends', () => {
    const r = periodRange('this_month', now)
    expect(inRange(d(2026, 10, 3).toISOString(), r)).toBe(true)
    expect(inRange(d(2026, 9, 31).toISOString(), r)).toBe(false)
    expect(inRange(null, r)).toBe(false)
  })
  it('bucket size by length', () => {
    expect(bucketFor(periodRange('this_month', now), now)).toBe('day')
    expect(bucketFor(periodRange('last_3_months', now), now)).toBe('week')
    expect(bucketFor(periodRange('all', now), d(2025, 0, 1))).toBe('month')
  })
})
