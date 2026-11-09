import { describe, expect, it } from 'vitest'
import { autoTitles, firstName, isVideo } from './autoTitle'

const now = new Date(2026, 10, 8, 15, 0)
const today = new Date(2026, 10, 8, 9, 0).toISOString()
const yesterday = new Date(2026, 10, 7, 9, 0).toISOString()

describe('autoTitles', () => {
  it('first video of the day', () => {
    expect(autoTitles('Ellie Martin', now, [], 1)).toEqual(['Ellie · Nov 8'])
  })
  it('numbers after videos already asked for today', () => {
    expect(autoTitles('Ellie', now, [{ title: 'Ellie · Nov 8', created_at: today }], 1)).toEqual(['Ellie · Nov 8 · 2'])
  })
  it('ignores other days', () => {
    expect(autoTitles('Ellie', now, [{ title: 'Ellie · Nov 7', created_at: yesterday }], 1)).toEqual(['Ellie · Nov 8'])
  })
  it('several at once', () => {
    expect(autoTitles('Ellie', now, [], 3)).toEqual(['Ellie · Nov 8', 'Ellie · Nov 8 · 2', 'Ellie · Nov 8 · 3'])
  })
  it('never repeats a title in use', () => {
    const existing = [{ title: 'Renamed', created_at: today }, { title: 'Ellie · Nov 8 · 2', created_at: yesterday }]
    expect(autoTitles('Ellie', now, existing, 1)).toEqual(['Ellie · Nov 8 · 3'])
  })
  it('first name fallback', () => {
    expect(firstName('  ')).toBe('Video')
    expect(firstName('Bloom Bakery')).toBe('Bloom')
  })
})

describe('isVideo', () => {
  it('by type or extension', () => {
    expect(isVideo({ name: 'a.MOV', type: '' })).toBe(true)
    expect(isVideo({ name: 'a.bin', type: 'video/mp4' })).toBe(true)
    expect(isVideo({ name: 'logo.png', type: 'image/png' })).toBe(false)
  })
})
