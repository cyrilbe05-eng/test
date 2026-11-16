import { useState } from 'react'
import { format } from 'date-fns'
import { EditorAvatar, Ms } from '@/components/ds'
import { cn } from '@/lib/utils'
import { standing } from '@/lib/scoreboardText'
import type { Scoreboard, ScoredVideo, ScoreCategory } from '@/types/scoreboard'

// The leaderboard and a video's point breakdown — shared by the admin page
// and the editor's own page.

const pts = (n: number) => Math.round(n).toLocaleString('en-GB')
const signed = (n: number) => `${n > 0 ? '+' : ''}${Math.round(n * 10) / 10}`

export function BoardList({ data, selected, onSelect }: { data: Scoreboard; selected?: string | null; onSelect?: (editorId: string) => void }) {
  const top = data.board[0]?.totalPoints || 1
  return (
    <div className="space-y-2">
      {data.board.map((r, i) => {
        const s = standing(r, data.rules)
        const mine = data.me === r.editorId
        const on = selected === r.editorId
        return (
          <button key={r.editorId} type="button" onClick={() => onSelect?.(r.editorId)} disabled={!onSelect}
            className={cn('clay-card w-full text-left flex items-center gap-3 sm:gap-4 px-3.5 sm:px-4 py-3 animate-slide-up', onSelect && 'cursor-pointer')}
            style={{ animationDelay: `${i * 40}ms`, boxShadow: on || mine ? 'var(--card-sh), 0 0 0 1.5px var(--focus)' : undefined }}>
            <span className="w-6 text-center tabular-nums flex-none" style={{ fontSize: 15, fontWeight: 650, color: r.rank === 1 ? 'var(--strong)' : 'var(--faint)' }}>{r.rank}</span>
            <EditorAvatar name={r.name} size={34} />
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="truncate" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--strong)' }}>{r.name}{mine ? ' (you)' : ''}</span>
                {r.isWinner && <Ms name="workspace_premium" style={{ fontSize: 17, width: 17, color: 'var(--warn)' }} />}
              </span>
              <span className="flex items-center gap-2 mt-1">
                <span className="ds-track flex-1 max-w-[180px]" aria-hidden><i style={{ width: `${Math.max(3, (r.totalPoints / top) * 100)}%` }} /></span>
                <span className="truncate" style={{ fontSize: 12, color: s.tone === 'todo' ? 'var(--faint)' : 'var(--strong)', fontWeight: s.tone === 'todo' ? 400 : 600 }}>{s.text}</span>
              </span>
            </span>
            <span className="text-right flex-none">
              <span className="block tabular-nums" style={{ fontSize: 18, fontWeight: 650, letterSpacing: '-.02em', color: 'var(--strong)' }}>{pts(r.totalPoints)}</span>
              <span className="block tabular-nums" style={{ fontSize: 11.5, color: 'var(--faint)' }}>{r.videoCount} videos{r.finalScore !== null ? ` · avg ${Math.round(r.finalScore)}` : ''}</span>
            </span>
          </button>
        )
      })}
      {data.board.length === 0 && (
        <div className="ds-panel text-center py-10"><p style={{ fontSize: 13.5, color: 'var(--faint)' }}>No videos delivered yet this month</p></div>
      )}
      {data.notStarted.length > 0 && (
        <p className="px-1 pt-1" style={{ fontSize: 12.5, color: 'var(--faint)' }}>Not started: {data.notStarted.map((n) => n.name).join(', ')}</p>
      )}
    </div>
  )
}

const LABEL: Record<ScoreCategory, string> = {
  base: 'Delivery',
  revisionPenalty: 'Revision',
  revisionRecovery: 'Quick fix',
  slowRevision: 'Slow fix',
  inProgressTime: 'Editing time',
  warningHalving: 'Early warning',
  inProgressBypass: 'Card not moved',
  floor: 'Minimum score',
  manualAdjustment: 'Adjustment',
}

function Breakdown({ video }: { video: ScoredVideo }) {
  return (
    <ul className="mt-2 space-y-1">
      {video.breakdown.map((l, i) => (
        <li key={i} className="flex items-baseline gap-3" style={{ fontSize: 12.5 }}>
          <span className="w-28 flex-none" style={{ color: 'var(--soft-text)', fontWeight: 500 }}>{LABEL[l.category] ?? l.category}</span>
          <span className="flex-1 min-w-0" style={{ color: 'var(--faint)' }}>{l.detail}</span>
          <span className={cn('tabular-nums flex-none font-semibold', l.category === 'base' ? '' : l.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400')}
            style={l.category === 'base' ? { color: 'var(--strong)' } : undefined}>{l.category === 'base' ? l.amount : signed(l.amount)}</span>
        </li>
      ))}
      {video.coefficient !== 1 && (
        <li className="flex items-baseline gap-3 pt-1" style={{ fontSize: 12.5, borderTop: '1px solid var(--line)' }}>
          <span className="w-28 flex-none" style={{ color: 'var(--soft-text)', fontWeight: 500 }}>Client ×{video.coefficient}</span>
          <span className="flex-1" style={{ color: 'var(--faint)' }}>{video.score} × {video.coefficient}</span>
          <span className="tabular-nums font-semibold" style={{ color: 'var(--strong)' }}>{pts(video.points)}</span>
        </li>
      )}
    </ul>
  )
}

/** One editor's videos for the month, lowest score first; tap one to see
 *  where its points came from. `adjust` (admins) edits a video's points. */
export function VideoList({ videos, adjust }: { videos: ScoredVideo[]; adjust?: (v: ScoredVideo) => React.ReactNode }) {
  const [open, setOpen] = useState<string | null>(null)
  const sorted = [...videos].sort((a, b) => a.score - b.score)
  if (sorted.length === 0) return <p className="py-6 text-center" style={{ fontSize: 13.5, color: 'var(--faint)' }}>No videos this month</p>
  return (
    <div>
      {sorted.map((v) => {
        const isOpen = open === v.projectId
        return (
          <div key={v.projectId} style={{ borderTop: '1px solid var(--line)' }} className="first:border-t-0">
            <button type="button" onClick={() => setOpen(isOpen ? null : v.projectId)} className="w-full flex items-center gap-3 py-2.5 text-left min-h-[44px]">
              <span className="flex-1 min-w-0">
                <span className="block truncate" style={{ fontSize: 13.5, fontWeight: 550, color: 'var(--strong)' }}>{v.title}</span>
                <span className="block truncate" style={{ fontSize: 12, color: 'var(--faint)' }}>
                  {v.clientName} · {format(new Date(v.deliveredAt), 'd MMM')}{v.isFirstVideo ? ' · first video for this client' : ''}{v.flagged ? ' · card not moved' : ''}{v.adjustment ? ' · adjusted' : ''}
                </span>
              </span>
              <span className="tabular-nums flex-none" style={{ fontSize: 15, fontWeight: 650, color: v.score >= 70 ? 'var(--strong)' : 'var(--faint)' }}>{Math.round(v.score)}</span>
              <Ms name={isOpen ? 'expand_less' : 'expand_more'} style={{ fontSize: 18, width: 18 }} />
            </button>
            {isOpen && (
              <div className="pb-3 animate-fade-in">
                <Breakdown video={v} />
                {adjust?.(v)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
