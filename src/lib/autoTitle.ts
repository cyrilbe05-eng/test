import { format, isSameDay } from 'date-fns'

// Auto titles for the one-step upload: "Ellie · Nov 8", then "Ellie · Nov 8 · 2"
// for the next video asked for the same day. Always editable afterwards.

export const firstName = (fullName: string | null | undefined) => (fullName ?? '').trim().split(/\s+/)[0] || 'Video'

/**
 * `count` titles for new videos, numbered after the projects already created
 * today and never repeating a title already in use.
 */
export function autoTitles(
  fullName: string | null | undefined,
  now: Date,
  existing: { title: string; created_at: string }[],
  count: number,
): string[] {
  const base = `${firstName(fullName)} · ${format(now, 'MMM d')}`
  const used = new Set(existing.map((p) => p.title.trim()))
  let n = existing.filter((p) => isSameDay(new Date(p.created_at), now)).length + 1
  const out: string[] = []
  while (out.length < count) {
    const t = n === 1 ? base : `${base} · ${n}`
    if (!used.has(t)) { out.push(t); used.add(t) }
    n++
  }
  return out
}

const VIDEO_EXT = /\.(mp4|mov|m4v|avi|mkv|webm|mts|m2ts|hevc|3gp|wmv|flv|mxf)$/i
export const isVideo = (f: { name: string; type: string }) => f.type.startsWith('video/') || VIDEO_EXT.test(f.name)
