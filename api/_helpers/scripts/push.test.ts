import { describe, expect, it } from 'vitest'
import { calendarEntryFor } from './push'

describe('calendarEntryFor', () => {
  it('puts the first link in the link field and lists the others under the script', () => {
    const e = calendarEntryFor({ type: 'Reel', body_html: '<div><b>Hook</b></div><div>Body</div>', slides: null, notes_html: '<div>Fast cuts</div>', links: ['https://a.example/', 'https://b.example/', 'https://c.example/'] })
    expect(e.inspiration_url).toBe('https://a.example/')
    expect(e.script).toBe('Hook\nBody\n\nInspo:\nhttps://b.example/\nhttps://c.example/')
    expect(e.editor_notes).toBe('Fast cuts')
    expect(e.caption).toBeNull()
    expect(e.comments).toBeNull()
  })

  it('carries the caption and the client notes', () => {
    const e = calendarEntryFor({ type: 'Reel', body_html: '<div>Hook</div>', slides: null, caption_html: '<div><b>New drop</b> 🔥</div><div>#skincare</div>', client_notes_html: '<div>Film near a window</div>', notes_html: '', links: [] })
    expect(e.caption).toBe('New drop 🔥\n#skincare')
    expect(e.comments).toBe('Film near a window')
    expect(e.editor_notes).toBeNull()
  })

  it('writes carousel slides in order, skipping empty ones', () => {
    const e = calendarEntryFor({ type: 'Carousel', body_html: '', slides: JSON.stringify(['<div>Cover</div>', '', '<div>Tip <i>one</i></div>']), notes_html: '', links: [] })
    expect(e.script).toBe('Slide 1\nCover\n\nSlide 2\nTip one')
    expect(e.inspiration_url).toBeNull()
    expect(e.editor_notes).toBeNull()
  })
})
