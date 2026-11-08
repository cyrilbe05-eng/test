import { describe, expect, it } from 'vitest'
import { cn, formatTimestamp, parseTimestamp, sanitizeFileName } from './utils'

describe('formatTimestamp', () => {
  it('formats zero', () => expect(formatTimestamp(0)).toBe('00:00'))
  it('formats sub-minute values', () => expect(formatTimestamp(45)).toBe('00:45'))
  it('formats minutes and seconds', () => expect(formatTimestamp(72.4)).toBe('01:12'))
  it('formats long durations past an hour as minutes', () => expect(formatTimestamp(3671)).toBe('61:11'))
})

describe('parseTimestamp', () => {
  it('parses MM:SS', () => expect(parseTimestamp('01:12')).toBe(72))
  it('round-trips with formatTimestamp', () => expect(parseTimestamp(formatTimestamp(605))).toBe(605))
  it('tolerates missing parts', () => expect(parseTimestamp(':30')).toBe(30))
})

describe('sanitizeFileName', () => {
  it('replaces whitespace with underscores', () =>
    expect(sanitizeFileName('final cut v2.mp4')).toBe('final_cut_v2.mp4'))
  it('strips unsafe characters', () =>
    expect(sanitizeFileName('éclair#1 (test).mov')).toBe('clair1_test.mov'))
})

describe('cn', () => {
  it('merges tailwind classes with later values winning', () =>
    expect(cn('p-2', 'p-4')).toBe('p-4'))
})
