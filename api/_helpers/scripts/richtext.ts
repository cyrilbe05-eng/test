// Script text is a tiny subset of HTML, cleaned here on every save before it
// is stored or shown to anyone else:
//
//   bold <b>, italic <i>, underline <u>, line breaks <br>, lines <div>,
//   and comment highlights <mark data-c="commentId">.
//
// Everything else is dropped: other tags (their text is kept), every
// attribute (except a highlight's comment id), comments, and the content of
// script/style-like tags. Text is re-escaped, so nothing can turn back into
// markup. Pure functions, unit-tested in richtext.test.ts.

export const MAX_RICH_TEXT = 100_000

const ALIAS: Record<string, string> = { b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', ins: 'u', div: 'div', p: 'div', br: 'br', mark: 'mark' }
const DROP_WITH_CONTENT = /<(script|style|template|noscript|iframe|object|embed|textarea|title|svg|math|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const COMMENT_ID = /^[A-Za-z0-9_-]{1,64}$/

const escapeText = (s: string) =>
  s
    // A bare & becomes &amp;, an existing entity is kept as it is.
    .replace(/&(?!(?:#\d{1,7}|#x[0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export function sanitizeRichText(input: unknown): string {
  if (typeof input !== 'string') return ''
  const html = input
    .slice(0, MAX_RICH_TEXT * 2)
    .replace(/<!--[\s\S]*?(-->|$)/g, '')
    .replace(DROP_WITH_CONTENT, '')

  const out: string[] = []
  const open: string[] = []
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = tag.exec(html))) {
    out.push(escapeText(html.slice(last, m.index)))
    last = tag.lastIndex
    const closing = m[1] === '/'
    const name = ALIAS[m[2].toLowerCase()]
    if (!name) continue // unknown tag: drop it, keep the text around it
    if (name === 'br') { if (!closing) out.push('<br>'); continue }
    if (closing) {
      // Close only a tag that is actually open (and anything opened inside it).
      const at = open.lastIndexOf(name)
      if (at === -1) continue
      while (open.length > at) out.push(`</${open.pop()}>`)
      continue
    }
    if (name === 'mark') {
      const a = /\bdata-c\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(m[3])
      const id = a ? (a[1] ?? a[2] ?? a[3]) : undefined
      if (!id || !COMMENT_ID.test(id)) continue
      out.push(`<mark data-c="${id}">`)
    } else {
      out.push(`<${name}>`)
    }
    open.push(name)
  }
  out.push(escapeText(html.slice(last)))
  while (open.length) out.push(`</${open.pop()}>`)
  return out.join('').slice(0, MAX_RICH_TEXT)
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

/** Plain text with line breaks — for calendar entries (clients see this). */
export function richTextToPlain(html: string): string {
  return sanitizeRichText(html)
    .replace(/<br>/g, '\n')
    .replace(/<\/div>/g, '\n')
    .replace(/<div>/g, (_m, offset: number, all: string) => (offset > 0 && !/\n$/.test(all.slice(0, offset).replace(/<[^>]+>/g, '')) ? '\n' : ''))
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, e: string) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ''
      }
      return ENTITIES[e] ?? whole
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Inspo links: http(s) only, "www…" gets https://, at most 20. */
export function cleanLinks(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  for (const raw of input) {
    if (typeof raw !== 'string' || !raw.trim()) continue
    const s = raw.trim().slice(0, 2000)
    let u: URL
    try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`) } catch { continue }
    if ((u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.')) out.push(u.toString())
    if (out.length >= 20) break
  }
  return out
}
