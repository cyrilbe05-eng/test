import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Ms, Segmented } from '@/components/ds'
import { StatTile } from '@/components/charts/Charts'
import { BoardList, VideoList } from '@/components/scoreboard/Scoreboard'
import { money, monthLabel } from '@/lib/scoreboardText'
import { useScoreboard, useScoreboardActions } from '@/hooks/useScoreboard'
import type { ClientScoreSetting, Scoreboard, ScoredVideo } from '@/types/scoreboard'

// Full admins: the editors' monthly leaderboard, the winner's bonus, per-
// client coefficients / time targets, and per-video point adjustments.

const errMsg = (e: unknown) => (e as Error)?.message ?? 'Something went wrong'

function BonusTile({ data }: { data: Scoreboard }) {
  const { saveBonus, removeBonus } = useScoreboardActions()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const start = () => { setValue(data.bonus ? String(data.bonus.amount) : ''); setEditing(true) }
  const save = () => {
    const amount = Number(value)
    const done = { onSuccess: () => { setEditing(false); toast.success('Bonus saved') }, onError: (e: unknown) => toast.error(errMsg(e)) }
    if (value.trim() === '') removeBonus.mutate(data.month, done)
    else if (!Number.isFinite(amount) || amount < 0) toast.error('Enter an amount')
    else saveBonus.mutate({ month: data.month, amount }, done)
  }
  if (editing) {
    return (
      <div className="clay-card p-4 min-w-0">
        <p style={{ fontSize: 12.5, color: 'var(--faint)' }}>Bonus</p>
        <form className="flex items-center gap-2 mt-1.5" onSubmit={(e) => { e.preventDefault(); save() }}>
          <input autoFocus inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="€" aria-label="Bonus amount" className="ds-field" style={{ height: 36 }} />
          <button type="submit" className="ds-primary" style={{ height: 36, paddingLeft: 14 }} disabled={saveBonus.isPending || removeBonus.isPending}>Save</button>
        </form>
      </div>
    )
  }
  return (
    <button type="button" onClick={start} className="clay-card p-4 min-w-0 text-left cursor-pointer">
      <span className="flex items-center justify-between" style={{ fontSize: 12.5, color: 'var(--faint)' }}>Bonus <Ms name="edit" style={{ fontSize: 15, width: 15 }} /></span>
      <span className="block tabular-nums mt-1" style={{ fontSize: 28, fontWeight: 650, letterSpacing: '-.03em', color: 'var(--strong)', lineHeight: 1.15 }}>
        {data.bonus ? money(data.bonus.amount, data.bonus.currency) : '—'}
      </span>
    </button>
  )
}

function AdjustForm({ video }: { video: ScoredVideo }) {
  const { saveAdjustment, removeAdjustment } = useScoreboardActions()
  const [amount, setAmount] = useState(video.adjustment ? String(video.adjustment.amount) : '')
  const [reason, setReason] = useState(video.adjustment?.reason ?? '')
  const done = (msg: string) => ({ onSuccess: () => toast.success(msg), onError: (e: unknown) => toast.error(errMsg(e)) })
  const save = () => {
    const n = Number(amount)
    if (!Number.isFinite(n) || n === 0) { toast.error('Enter points, e.g. 10 or -5'); return }
    saveAdjustment.mutate({ projectId: video.projectId, amount: n, reason }, done('Points adjusted'))
  }
  return (
    <form className="flex flex-wrap items-center gap-2 mt-3" onSubmit={(e) => { e.preventDefault(); save() }}>
      <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="± points" aria-label="Points" className="ds-field" style={{ width: 96, height: 36 }} />
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" aria-label="Reason" maxLength={300} className="ds-field flex-1" style={{ minWidth: 160, height: 36 }} />
      <button type="submit" className="ds-primary" style={{ height: 36, paddingLeft: 14 }} disabled={saveAdjustment.isPending}>Save</button>
      {video.adjustment && (
        <button type="button" className="ds-ghost-btn" style={{ height: 36 }} disabled={removeAdjustment.isPending}
          onClick={() => removeAdjustment.mutate(video.projectId, done('Adjustment removed'))}>Remove</button>
      )}
    </form>
  )
}

function ClientRow({ c }: { c: ClientScoreSetting }) {
  const { saveClient, resetClient } = useScoreboardActions()
  const [coef, setCoef] = useState(String(c.coefficient))
  const [hours, setHours] = useState(String(c.timeTargetHours))
  useEffect(() => { setCoef(String(c.coefficient)); setHours(String(c.timeTargetHours)) }, [c.coefficient, c.timeTargetHours])
  const dirty = Number(coef) !== c.coefficient || Number(hours) !== c.timeTargetHours
  const done = (msg: string) => ({ onSuccess: () => toast.success(msg), onError: (e: unknown) => toast.error(errMsg(e)) })
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5" style={{ borderTop: '1px solid var(--line)' }}>
      <span className="flex-1 min-w-[10rem]">
        <span className="block truncate" style={{ fontSize: 14, fontWeight: 550, color: 'var(--strong)' }}>{c.name}</span>
        <span className="block" style={{ fontSize: 12, color: 'var(--faint)' }}>{c.videoCount} scored videos{c.isDefault ? ' · default' : ''}</span>
      </span>
      <label className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: 'var(--faint)' }}>×
        <input inputMode="decimal" value={coef} onChange={(e) => setCoef(e.target.value)} aria-label={`${c.name} coefficient`} className="ds-field tabular-nums" style={{ width: 70, height: 36 }} />
      </label>
      <label className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: 'var(--faint)' }}>
        <input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} aria-label={`${c.name} time target in hours`} className="ds-field tabular-nums" style={{ width: 64, height: 36 }} />h
      </label>
      <span className="flex gap-1.5 w-[148px] justify-end">
        {dirty && <button type="button" className="ds-primary" style={{ height: 36, paddingLeft: 14 }} disabled={saveClient.isPending}
          onClick={() => saveClient.mutate({ clientId: c.clientId, coefficient: Number(coef), timeTargetHours: Number(hours) }, done('Saved'))}>Save</button>}
        {!c.isDefault && !dirty && <button type="button" className="ds-ghost-btn" style={{ height: 36 }} disabled={resetClient.isPending}
          onClick={() => resetClient.mutate(c.clientId, done('Back to default'))}>Reset</button>}
      </span>
    </div>
  )
}

export default function AdminLeaderboard() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'clients' ? 'clients' : 'board'
  const { data, isLoading, error } = useScoreboard(params.get('month') ?? '')
  const [selected, setSelected] = useState<string | null>(null)
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }) }

  const editorId = selected && data?.board.some((b) => b.editorId === selected) ? selected : data?.board[0]?.editorId ?? null
  const editor = data?.board.find((b) => b.editorId === editorId)
  const winner = data?.board.find((b) => b.isWinner)

  return (
    <AdminLayout>
      <main className="px-4 md:px-6 py-5 md:py-6 space-y-5 max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 style={{ fontSize: 24, fontWeight: 650, letterSpacing: '-.02em', color: 'var(--strong)' }}>Leaderboard</h1>
          <div className="flex flex-wrap items-center gap-2">
            {data && (
              <select value={data.month} onChange={(e) => set('month', e.target.value)} aria-label="Month" className="ds-tool pr-8">
                {[...data.months].reverse().map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            )}
            <Segmented label="View" width={84} value={tab} onChange={(t) => set('tab', t === 'board' ? null : t)}
              options={[{ value: 'board', label: 'Board' }, { value: 'clients', label: 'Clients' }]} />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
        ) : error || !data ? (
          <div className="ds-panel p-6" style={{ fontSize: 13.5 }}>{errMsg(error)}</div>
        ) : tab === 'clients' ? (
          <section className="ds-panel" style={{ padding: '8px 18px' }}>
            <div className="flex items-center gap-3 py-2" style={{ fontSize: 12.5, color: 'var(--faint)' }}>
              <span className="flex-1">Client</span><span className="w-[86px]">Coefficient</span><span className="w-[84px]">Time target</span><span className="w-[148px]" />
            </div>
            {data.clients.map((c) => <ClientRow key={c.clientId} c={c} />)}
            {data.clients.length === 0 && <p className="py-6 text-center" style={{ fontSize: 13.5, color: 'var(--faint)' }}>No scored videos yet</p>}
          </section>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatTile label="Winner" value={winner?.name ?? '—'} sub={winner ? `${Math.round(winner.totalPoints)} points` : 'No one eligible yet'} />
              <BonusTile data={data} />
              <StatTile label="Videos" value={data.videos.length} sub={monthLabel(data.month)} />
              <StatTile label="Eligible" value={`${data.board.filter((b) => b.eligible).length} of ${data.board.length}`} sub={`${data.rules.minVideos}+ videos, average ${data.rules.minFinalScore}+`} />
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
              <BoardList data={data} selected={editorId} onSelect={setSelected} />
              {editor && (
                <section className="ds-panel" style={{ padding: '14px 18px 8px' }}>
                  <div className="ds-panel-head"><h2>{editor.name}</h2><span className="ds-count">{editor.videoCount} videos</span></div>
                  <VideoList videos={data.videos.filter((v) => v.editorId === editor.editorId)} adjust={(v) => <AdjustForm key={v.projectId} video={v} />} />
                </section>
              )}
            </div>
          </>
        )}
      </main>
    </AdminLayout>
  )
}
