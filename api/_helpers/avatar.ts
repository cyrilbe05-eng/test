// Profile pictures are small square images made in the browser (cropped and
// shrunk before upload) and stored inline as a data URL. Only that shape is
// accepted, so a profile can't point its picture at an outside address.

/** Largest accepted data URL, in characters (~11 KB of image). */
export const AVATAR_MAX_CHARS = 16_000

const AVATAR_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/

/** `null` removes the picture; otherwise it must be a small inline image. */
export function isValidAvatar(v: unknown): v is string | null {
  if (v === null) return true
  return typeof v === 'string' && v.length <= AVATAR_MAX_CHARS && AVATAR_RE.test(v)
}
