import { describe, it, expect } from 'vitest'
import { normalizeInstagramHandle, parseInstagramList, instagramUrl } from './instagram'

describe('normalizeInstagramHandle', () => {
  it('accepts handles, @handles and profile links', () => {
    expect(normalizeInstagramHandle('bloom.bakery')).toBe('bloom.bakery')
    expect(normalizeInstagramHandle('  @Bloom_Bakery ')).toBe('bloom_bakery')
    expect(normalizeInstagramHandle('instagram.com/bloombakery')).toBe('bloombakery')
    expect(normalizeInstagramHandle('https://www.instagram.com/bloombakery/?igsh=abc123')).toBe('bloombakery')
    expect(normalizeInstagramHandle('https://m.instagram.com/bloombakery')).toBe('bloombakery')
  })

  it('rejects things that cannot be Instagram usernames', () => {
    for (const bad of ['', '@', 'bloom bakery', 'bloom-bakery', '.bloom', 'bloom.', 'bloom..bakery', 'a'.repeat(31), 'javascript:alert(1)', 'https://evil.com/bloom']) {
      expect(normalizeInstagramHandle(bad)).toBeNull()
    }
  })
})

describe('parseInstagramList', () => {
  it('drops blanks and duplicates, and reports invalid entries', () => {
    expect(parseInstagramList(['@bloom', '', 'BLOOM', 'instagram.com/bloom.cafe', 'not valid'])).toEqual({
      handles: ['bloom', 'bloom.cafe'],
      invalid: ['not valid'],
    })
  })
})

it('builds the profile link', () => {
  expect(instagramUrl('bloom.bakery')).toBe('https://www.instagram.com/bloom.bakery/')
})
