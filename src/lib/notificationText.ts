// How a notification's text is shown: spaced dashes (" — ", " – ", " - ")
// read as a colon, and quoted names ("FAQ short", “…”) become bold parts
// without the quote marks. Hyphens inside words (How-to) are kept.

export type Part = { text: string; strong?: boolean }

export function cleanDashes(message: string): string {
  return message.replace(/\s+[—–-]\s+/g, ': ')
}

export function notificationParts(message: string): Part[] {
  const text = cleanDashes(message)
  const parts: Part[] = []
  const re = /"([^"]+)"|“([^”]+)”/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) })
    parts.push({ text: m[1] ?? m[2], strong: true })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}
