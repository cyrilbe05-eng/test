// Instagram handle rules — shared by the admin forms and the API (browser-safe).
//
// Accepts what people naturally paste: "@bloom.bakery", "bloom.bakery",
// "instagram.com/bloom.bakery", "https://www.instagram.com/bloom.bakery/?igsh=…".
// Stores the bare handle in lowercase. Instagram usernames are 1–30 characters
// of letters, digits, "." and "_", not starting/ending with "." and no "..".

export const MAX_INSTAGRAM_ACCOUNTS = 10

/** The bare handle, or null if the input isn't a valid Instagram username. */
export function normalizeInstagramHandle(input: string): string | null {
  let s = input.trim()
  const url = s.match(/^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/([^/?#\s]+)/i)
  if (url) s = url[1]
  s = s.replace(/^@+/, '').toLowerCase()
  if (!/^[a-z0-9._]{1,30}$/.test(s)) return null
  if (s.startsWith('.') || s.endsWith('.') || s.includes('..')) return null
  return s
}

export function instagramUrl(handle: string): string {
  return `https://www.instagram.com/${encodeURIComponent(handle)}/`
}

/** Normalise a list: drops blanks and duplicates, reports invalid entries. */
export function parseInstagramList(inputs: string[]): { handles: string[]; invalid: string[] } {
  const handles: string[] = []
  const invalid: string[] = []
  for (const raw of inputs) {
    if (!raw.trim()) continue
    const h = normalizeInstagramHandle(raw)
    if (!h) invalid.push(raw.trim())
    else if (!handles.includes(h)) handles.push(h)
  }
  return { handles, invalid }
}
