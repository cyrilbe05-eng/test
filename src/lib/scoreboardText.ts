import { format } from 'date-fns'
import type { BoardRow, Scoreboard } from '@/types/scoreboard'

// Bonuses are paid in US dollars.
export const money = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)

export const monthLabel = (m: string) => format(new Date(`${m}-01T12:00:00`), 'MMMM yyyy')

/** Where the editor stands on the bonus, in a few words. */
export function standing(row: BoardRow, rules: Scoreboard['rules']): { text: string; tone: 'win' | 'ok' | 'todo' } {
  if (row.isWinner) return { text: 'Winner', tone: 'win' }
  if (row.eligible) return { text: 'Eligible', tone: 'ok' }
  const parts: string[] = []
  const left = rules.minVideos - row.videoCount
  if (left > 0) parts.push(`${left} video${left === 1 ? '' : 's'} to go`)
  if (row.finalScore !== null && row.finalScore < rules.minFinalScore) parts.push(`average ${Math.round(row.finalScore)} of ${rules.minFinalScore}`)
  return { text: parts.join(' · ') || 'Not eligible', tone: 'todo' }
}
