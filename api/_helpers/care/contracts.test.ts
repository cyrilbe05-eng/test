import { describe, it, expect } from 'vitest'
import { currentContract, nextContractFrom, overlaps, parseContractInput } from './contracts'

const NOW = Date.UTC(2026, 10, 8, 12)   // 2026-11-08
const c = (number: number, start_date: string, end_date: string) => ({ number, start_date, end_date })

describe('currentContract', () => {
  it('is the contract whose dates include today', () => {
    const list = [c(1, '2025-11-01', '2026-10-31'), c(2, '2026-11-01', '2027-10-31')]
    expect(currentContract(list, NOW)?.number).toBe(2)
  })
  it('otherwise the most recently started one', () => {
    expect(currentContract([c(1, '2024-01-01', '2024-12-31'), c(2, '2025-01-01', '2025-12-31')], NOW)?.number).toBe(2)
  })
  it('or the earliest upcoming one if none has started; null without contracts', () => {
    expect(currentContract([c(2, '2027-06-01', '2027-12-31'), c(1, '2027-01-01', '2027-05-31')], NOW)?.number).toBe(1)
    expect(currentContract([], NOW)).toBeNull()
  })
  it('the first and last day both count', () => {
    expect(currentContract([c(1, '2026-11-08', '2026-12-01')], NOW)?.number).toBe(1)
    expect(currentContract([c(1, '2025-01-01', '2026-11-08'), c(2, '2026-11-09', '2027-11-08')], NOW)?.number).toBe(1)
  })
})

describe('nextContractFrom (automatic renewal)', () => {
  it('starts the day after, same length, same package and videos, renewal reset', () => {
    expect(nextContractFrom({ number: 1, start_date: '2026-01-01', end_date: '2026-12-31', package: 'full_package', videos_included: 24 })).toEqual({
      number: 2, start_date: '2027-01-01', end_date: '2027-12-31', package: 'full_package', videos_included: 24, renewal_status: 'not_discussed',
    })
  })
  it('keeps whole-month lengths (a 3-month contract stays 3 months)', () => {
    const n = nextContractFrom({ number: 3, start_date: '2026-09-01', end_date: '2026-11-30', package: 'editing_only', videos_included: 6 })
    expect([n.start_date, n.end_date]).toEqual(['2026-12-01', '2027-02-28'])
    const mid = nextContractFrom({ number: 1, start_date: '2026-03-15', end_date: '2026-09-14', package: 'editing_only', videos_included: 6 })
    expect([mid.start_date, mid.end_date]).toEqual(['2026-09-15', '2027-03-14'])
  })
  it('falls back to the same number of days for irregular lengths', () => {
    const n = nextContractFrom({ number: 1, start_date: '2026-01-01', end_date: '2026-01-10', package: 'editing_only', videos_included: 1 })
    expect([n.start_date, n.end_date]).toEqual(['2026-01-11', '2026-01-20'])
  })
})

describe('overlaps', () => {
  it('detects shared days only', () => {
    expect(overlaps(c(1, '2026-01-01', '2026-06-30'), c(2, '2026-06-30', '2026-12-31'))).toBe(true)
    expect(overlaps(c(1, '2026-01-01', '2026-06-30'), c(2, '2026-07-01', '2026-12-31'))).toBe(false)
  })
})

describe('parseContractInput', () => {
  it('requires both dates to create, any subset to edit', () => {
    expect(() => parseContractInput({ start_date: '2026-01-01' }, 'create')).toThrow(/end_date is required/)
    expect(parseContractInput({ package: 'full_package' }, 'update')).toEqual({ package: 'full_package' })
  })
  it('rejects bad values', () => {
    expect(() => parseContractInput({ start_date: '2026-02-30', end_date: '2026-12-31' }, 'create')).toThrow(/date/)
    expect(() => parseContractInput({ package: 'gold' }, 'update')).toThrow(/package/)
    expect(() => parseContractInput({ videos_included: -2 }, 'update')).toThrow(/whole number/)
    expect(() => parseContractInput({ renewal_status: 'maybe' }, 'update')).toThrow(/renewal_status/)
    expect(() => parseContractInput({ number: 5 }, 'update')).toThrow(/Unknown/)
    expect(() => parseContractInput({}, 'update')).toThrow(/Nothing/)
  })
})
