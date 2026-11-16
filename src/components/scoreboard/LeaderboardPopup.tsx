import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Ms } from '@/components/ds'
import { useScoreboard } from '@/hooks/useScoreboard'
import { editorHeadline } from '@/lib/scoreboardText'

// Editor Home: a small card sliding in at the top right with where they
// stand on this month's leaderboard. Closing it hides it for the rest of
// the day (stored on this device only).

const todayKey = () => `pingu-lb-popup-${new Date().toISOString().slice(0, 10)}`
const wasClosed = () => { try { return localStorage.getItem(todayKey()) === '1' } catch { return false } }

export function LeaderboardPopup() {
  const [closed, setClosed] = useState(wasClosed)
  const { data } = useScoreboard('')
  if (closed || !data?.me) return null
  const me = data.board.find((b) => b.editorId === data.me)
  const close = () => { try { localStorage.setItem(todayKey(), '1') } catch { /* private mode: closes for this visit */ } setClosed(true) }

  return (
    <aside className="ds-lb-pop" aria-label="Leaderboard">
      <span className="grid place-items-center rounded-[11px] flex-none" style={{ width: 40, height: 40, background: 'var(--ds-accent)', color: 'var(--accent-fg)' }}>
        <Ms name={me?.rank === 1 ? 'crown' : 'leaderboard'} style={{ fontSize: 21, width: 21, color: 'inherit' }} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block tabular-nums" style={{ fontSize: 14.5, fontWeight: 650, color: 'var(--strong)' }}>
          {me ? `#${me.rank} of ${data.board.length} · ${Math.round(me.totalPoints).toLocaleString('en-US')} pts` : 'Leaderboard'}
        </span>
        <span className="block mt-0.5" style={{ fontSize: 12.5, lineHeight: 1.4, color: 'var(--soft-text)' }}>{editorHeadline(me, data)}</span>
        <Link to="/team/leaderboard" className="inline-flex items-center gap-1 mt-2" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--strong)', textDecoration: 'none' }}>
          View leaderboard <Ms name="arrow_forward" style={{ fontSize: 15, width: 15, color: 'inherit' }} />
        </Link>
      </span>
      <button type="button" onClick={close} aria-label="Close" className="ds-ibtn flex-none" style={{ width: 32, height: 32, marginTop: -6, marginRight: -8 }}>
        <Ms name="close" style={{ fontSize: 17, width: 17 }} />
      </button>
    </aside>
  )
}
