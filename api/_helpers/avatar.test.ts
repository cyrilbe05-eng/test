import { describe, expect, it } from 'vitest'
import { AVATAR_MAX_CHARS, isValidAvatar } from './avatar'

describe('isValidAvatar', () => {
  it('accepts removing the picture', () => {
    expect(isValidAvatar(null)).toBe(true)
  })
  it('accepts small inline png / jpeg / webp images', () => {
    expect(isValidAvatar('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
    expect(isValidAvatar('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBe(true)
    expect(isValidAvatar('data:image/webp;base64,UklGRg==')).toBe(true)
  })
  it('rejects outside addresses and other content', () => {
    expect(isValidAvatar('https://example.com/me.png')).toBe(false)
    expect(isValidAvatar('javascript:alert(1)')).toBe(false)
    expect(isValidAvatar('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false)
    expect(isValidAvatar('data:text/html;base64,PGgxPg==')).toBe(false)
    expect(isValidAvatar('data:image/png;base64,abc"onerror=x')).toBe(false)
    expect(isValidAvatar('')).toBe(false)
    expect(isValidAvatar(42)).toBe(false)
    expect(isValidAvatar(undefined)).toBe(false)
  })
  it('rejects pictures that are too big', () => {
    expect(isValidAvatar('data:image/png;base64,' + 'A'.repeat(AVATAR_MAX_CHARS))).toBe(false)
  })
})
