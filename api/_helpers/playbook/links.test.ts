import { describe, expect, it } from 'vitest'
import { cleanLink, linkThumbnail, parseVideoLink } from './links'

describe('parseVideoLink', () => {
  it('reads every common YouTube link shape', () => {
    for (const l of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'youtu.be/dQw4w9WgXcQ', 'https://youtube.com/shorts/dQw4w9WgXcQ', 'https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ']) {
      expect(parseVideoLink(l), l).toEqual({ source: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0' })
    }
  })

  it('reads Loom share and embed links', () => {
    expect(parseVideoLink('https://www.loom.com/share/0281766fa2d04bb788eaf19e65135184?sid=x')).toEqual({
      source: 'loom', url: 'https://www.loom.com/share/0281766fa2d04bb788eaf19e65135184', embedUrl: 'https://www.loom.com/embed/0281766fa2d04bb788eaf19e65135184',
    })
  })

  it('refuses anything else', () => {
    for (const l of ['https://vimeo.com/123456', 'https://evil.example/watch?v=dQw4w9WgXcQ', 'javascript:alert(1)', 'https://youtube.com/watch?v=<script>', '', null, 'https://www.youtube.com/channel/abc']) {
      expect(parseVideoLink(l), String(l)).toBeNull()
    }
  })
})

describe('cleanLink', () => {
  it('keeps web links only', () => {
    expect(cleanLink('example.com/checklist.pdf')).toBe('https://example.com/checklist.pdf')
    expect(cleanLink('javascript:alert(1)')).toBeNull()
    expect(cleanLink('')).toBeNull()
  })
})

describe('linkThumbnail', () => {
  it('gives YouTube videos their still, nothing for Loom or junk', () => {
    expect(linkThumbnail('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
    expect(linkThumbnail('https://www.loom.com/share/0281766fa2d04bb788eaf19e65135184')).toBeNull()
    expect(linkThumbnail(null)).toBeNull()
  })
})
