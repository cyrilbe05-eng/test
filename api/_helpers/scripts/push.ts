// What a script becomes on the client's calendar ("Push to calendar"). Pure.
//
//   script           the script as plain text — a carousel's slides in order
//                    ("Slide 1", "Slide 2"…); inspo links after the first are
//                    listed under it.
//   inspiration_url  the first inspo link.
//   caption          the caption (the client sees it).
//   comments         the client notes — the calendar entry's "Notes" (the
//                    client sees them).
//   editor_notes     the editor notes as plain text, kept apart (never sent
//                    to clients).

import { richTextToPlain } from './richtext.js'

export const SCRIPT_TYPES = ['Reel', 'Carousel', 'Story', 'Post'] as const
export type ScriptType = (typeof SCRIPT_TYPES)[number]

export function parseSlides(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []
  } catch { return [] }
}

export function calendarEntryFor(s: { type: string; body_html: string; slides: string | null; caption_html?: string | null; client_notes_html?: string | null; notes_html: string; links: string[] }) {
  const text = s.type === 'Carousel'
    ? parseSlides(s.slides)
        .map((html, i) => ({ i, text: richTextToPlain(html) }))
        .filter((x) => x.text)
        .map((x, n) => `Slide ${n + 1}\n${x.text}`)
        .join('\n\n')
    : richTextToPlain(s.body_html)
  const more = s.links.slice(1)
  const script = [text, more.length ? `Inspo:\n${more.join('\n')}` : ''].filter(Boolean).join('\n\n')
  const notes = richTextToPlain(s.notes_html)
  return {
    script: script || null,
    inspiration_url: s.links[0] ?? null,
    caption: richTextToPlain(s.caption_html ?? '') || null,
    comments: richTextToPlain(s.client_notes_html ?? '') || null,
    editor_notes: notes || null,
  }
}
