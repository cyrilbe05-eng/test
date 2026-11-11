import type { Project } from '@/types'

// Admin project search: match every typed word against the project's name,
// its client and its editors; best matches first.

export type SearchRow = Project & { profiles?: { full_name: string } | null; assigned_team_names?: string | null }

// Strip accents: NFD splits "é" into "e" + a combining mark (U+0300–U+036F).
const ACCENTS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g')
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(ACCENTS, '')

/** Projects matching every word typed (in the name, client or editor), best first. */
export function searchProjects(projects: SearchRow[], query: string, limit = 8): SearchRow[] {
  const words = norm(query).split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const scored: { p: SearchRow; score: number }[] = []
  for (const p of projects) {
    const title = norm(p.title ?? '')
    const client = norm(p.profiles?.full_name ?? '')
    const editors = norm(p.assigned_team_names ?? '')
    const all = `${title} ${client} ${editors}`
    if (!words.every((w) => all.includes(w))) continue
    const q = words.join(' ')
    const score = title.startsWith(q) ? 0 : title.includes(q) ? 1 : client.startsWith(q) ? 2 : client.includes(q) ? 3 : 4
    scored.push({ p, score })
  }
  return scored
    .sort((a, b) => a.score - b.score || b.p.updated_at.localeCompare(a.p.updated_at))
    .slice(0, limit)
    .map((s) => s.p)
}

