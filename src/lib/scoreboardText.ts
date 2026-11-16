import { format } from 'date-fns'
import type { BoardRow, Scoreboard } from '@/types/scoreboard'

// Bonuses are paid in US dollars.
export const money = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)

export const monthLabel = (m: string) => format(new Date(`${m}-01T12:00:00`), 'MMMM yyyy')

/** Where the editor stands on the bonus, in a few words. */
export function standing(row: BoardRow, rules: Scoreboard['rules']): { text: string; tone: 'win' | 'ok' | 'todo' } {
  if (row.isWinner) return { text: 'Winner', tone: 'win' }
  if (row.isRunnerUp) return { text: '2nd place', tone: 'win' }
  if (row.eligible) return { text: 'Eligible', tone: 'ok' }
  const parts: string[] = []
  const left = rules.minVideos - row.videoCount
  if (left > 0) parts.push(`${left} video${left === 1 ? '' : 's'} to go`)
  if (row.finalScore !== null && row.finalScore < rules.minFinalScore) parts.push(`average ${Math.round(row.finalScore)} of ${rules.minFinalScore}`)
  return { text: parts.join(' · ') || 'Not eligible', tone: 'todo' }
}

/** One sentence on the editor's bonus standing. */
export function editorHeadline(me: BoardRow | undefined, data: Scoreboard): string {
  const bonus = data.bonus ? money(data.bonus.amount) : 'the bonus'
  if (!me) return 'No videos delivered yet this month'
  const leader = data.board[0]
  const next = data.board[me.rank - 2]
  if (me.isWinner) return `You're winning ${bonus}`
  if (me.isRunnerUp) {
    const winner = data.board.find((b) => b.isWinner)
    const second = data.bonus?.runnerUpAmount ? ` (${money(data.bonus.runnerUpAmount)})` : ''
    const gap = winner ? Math.ceil(winner.totalPoints - me.totalPoints) : 0
    return `You're in 2nd place${second}${gap > 0 ? `. ${gap} points behind 1st for ${bonus}` : ''}`
  }
  if (me.eligible) {
    const winner = data.board.find((b) => b.isWinner)
    const gap = Math.ceil((winner ?? leader).totalPoints - me.totalPoints)
    return gap > 0 ? `You qualify. ${gap} points behind the lead for ${bonus}` : `You qualify for ${bonus}`
  }
  const left = data.rules.minVideos - me.videoCount
  const parts: string[] = []
  if (left > 0) parts.push(`${left} more video${left === 1 ? '' : 's'}`)
  if (me.finalScore !== null && me.finalScore < data.rules.minFinalScore) parts.push(`an average of ${data.rules.minFinalScore}`)
  const need = parts.length ? `You need ${parts.join(' and ')} to qualify for ${bonus}` : `Not yet qualified for ${bonus}`
  return next && me.rank > 1 ? `${need}. ${Math.ceil(next.totalPoints - me.totalPoints)} points to pass ${next.name.split(' ')[0]}` : need
}
