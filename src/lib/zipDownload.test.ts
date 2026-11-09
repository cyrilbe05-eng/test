import { describe, expect, it } from 'vitest'
import { uniqueNames } from './zipDownload'

describe('uniqueNames', () => {
  it('keeps distinct names', () => {
    expect(uniqueNames(['a.mp4', 'b.mp4'])).toEqual(['a.mp4', 'b.mp4'])
  })
  it('numbers repeats, ignoring case', () => {
    expect(uniqueNames(['a.mp4', 'A.mp4', 'a.mp4'])).toEqual(['a.mp4', 'A (2).mp4', 'a (3).mp4'])
  })
  it('no extension and slashes', () => {
    expect(uniqueNames(['clip', 'clip', 'x/y.mov'])).toEqual(['clip', 'clip (2)', 'x_y.mov'])
  })
  it('never collides with an existing "(2)" name', () => {
    const out = uniqueNames(['a (2).mp4', 'a.mp4', 'a.mp4'])
    expect(new Set(out.map((n) => n.toLowerCase())).size).toBe(3)
  })
})
