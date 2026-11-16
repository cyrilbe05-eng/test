import { useSearchParams } from 'react-router-dom'
import { TeamLayout } from '@/components/workspace/TeamLayout'
import { Ms } from '@/components/ds'
import { StatTile } from '@/components/charts/Charts'
import { BoardList, VideoList } from '@/components/scoreboard/Scoreboard'
import { money, monthLabel } from '@/lib/scoreboardText'
import { useScoreboard } from '@/hooks/useScoreboard'
import type { BoardRow, Scoreboard } from '@/types/scoreboard'

// Editors: this month's leaderboard, where they stand on the bonus, and
// where each of their videos' points came from.

/** One sentence on the editor's bonus standing. */
function headline(me: BoardRow | undefined, data: Scoreboard): string {
  const bonus = data.bonus ? money(data.bonus.amount) : 'the bonus'
  if (!me) return 'No videos delivered yet this month'
  const leader = data.board[0]
  const next = data.board[me.rank - 2]
  if (me.isWinner) return `You're winning ${bonus}`
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

export default function TeamLeaderboard() {
  const [params, setParams] = useSearchParams()
  const { data, isLoading, error } = useScoreboard(params.get('month') ?? '')
  const me = data?.board.find((b) => b.editorId === data.me)

  return (
    <TeamLayout>
      <main className="px-4 md:px-6 py-5 md:py-6 space-y-5 max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 style={{ fontSize: 24, fontWeight: 650, letterSpacing: '-.02em', color: 'var(--strong)' }}>Leaderboard</h1>
          <div className="flex flex-wrap items-center gap-2">
            {data?.rulebookUrl && (
              <a href={data.rulebookUrl} target="_blank" rel="noopener noreferrer" className="ds-ghost-btn inline-flex items-center gap-1.5" style={{ textDecoration: 'none' }}>
                <Ms name="menu_book" style={{ fontSize: 17, width: 17, color: 'inherit' }} />Rulebook
              </a>
            )}
            {data && (
              <select value={data.month} onChange={(e) => setParams({ month: e.target.value }, { replace: true })} aria-label="Month" className="ds-tool pr-8">
                {[...data.months].reverse().map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
        ) : error || !data ? (
          <div className="ds-panel p-6" style={{ fontSize: 13.5 }}>{(error as Error)?.message ?? 'Something went wrong'}</div>
        ) : (
          <>
            <section className="clay-card p-4 md:p-5 flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="tabular-nums" style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.03em', color: 'var(--strong)', lineHeight: 1 }}>
                {me ? `#${me.rank}` : '—'}<span style={{ fontSize: 15, fontWeight: 500, color: 'var(--faint)' }}>{me ? ` of ${data.board.length}` : ''}</span>
              </span>
              <p className="flex-1 min-w-[14rem]" style={{ fontSize: 15, fontWeight: 550, color: 'var(--strong)' }}>{headline(me, data)}</p>
            </section>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatTile label="My points" value={me ? Math.round(me.totalPoints).toLocaleString('en-US') : 0} sub={monthLabel(data.month)} />
              <StatTile label="Videos" value={`${me?.videoCount ?? 0} / ${data.rules.minVideos}`}
                sub={<span className="ds-track block mt-1.5" aria-hidden><i style={{ width: `${Math.min(100, ((me?.videoCount ?? 0) / data.rules.minVideos) * 100)}%` }} /></span>} />
              <StatTile label="Average" value={me?.finalScore != null ? Math.round(me.finalScore) : '—'} sub={`${data.rules.minFinalScore} needed`} />
              <StatTile label="Bonus" value={data.bonus ? money(data.bonus.amount) : '—'} sub={data.winnerEditorId ? `Leader: ${data.board.find((b) => b.isWinner)?.name.split(' ')[0]}` : 'No one qualified yet'} />
            </div>

            <BoardList data={data} />

            <section className="ds-panel" style={{ padding: '14px 18px 8px' }}>
              <div className="ds-panel-head"><h2>My videos</h2><span className="ds-count">{data.videos.length}</span></div>
              <VideoList videos={data.videos} />
            </section>
          </>
        )}
      </main>
    </TeamLayout>
  )
}
