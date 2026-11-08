import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { useEditorPerformance } from '@/hooks/useCare'
import { cn } from '@/lib/utils'
import type { EditorPerformance, PerfStats, PerformancePeriod } from '@/types/editors'

// Editor Performance (admin-only). Every number is computed by the API
// (api/_helpers/care/editors.ts) with the same definitions as Client Care.

const PERIODS: { key: PerformancePeriod; label: string }[] = [
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
  { key: '365', label: '12 months' },
  { key: 'all', label: 'All time' },
]

// Editor colours: validated categorical palette (colour-blind safe, light and
// dark steps). Assigned by the API's stable legend order, so an editor keeps
// the same colour on every row and every period. Names + % are always written
// next to the bar, so colour is never the only cue.
const EDITOR_COLORS = [
  'bg-[#2a78d6] dark:bg-[#3987e5]',
  'bg-[#eb6834] dark:bg-[#d95926]',
  'bg-[#1baf7a] dark:bg-[#199e70]',
  'bg-[#eda100] dark:bg-[#c98500]',
  'bg-[#e87ba4] dark:bg-[#d55181]',
  'bg-[#008300] dark:bg-[#008300]',
  'bg-[#6250d6] dark:bg-[#9085e9]',
  'bg-[#e34948] dark:bg-[#e66767]',
]
const NEUTRAL = { other: 'bg-zinc-400 dark:bg-zinc-500', unassigned: 'bg-zinc-300 dark:bg-zinc-600' }

const fmt = (n: number | null, suffix = '') => (n == null ? '—' : `${n}${suffix}`)
type Editor = EditorPerformance['editors'][number]
type Split = EditorPerformance['client_split']

function PeriodPicker({ value, onChange }: { value: PerformancePeriod; onChange: (p: PerformancePeriod) => void }) {
  return (
    <div role="radiogroup" aria-label="Period" className="inline-flex rounded-xl border border-border bg-muted/40 p-1 gap-1">
      {PERIODS.map((p) => (
        <button
          key={p.key}
          role="radio"
          aria-checked={value === p.key}
          onClick={() => onChange(p.key)}
          className={cn('min-h-[44px] px-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
            value === p.key ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-2.5 min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-heading font-semibold tabular-nums mt-0.5">{value}</p>
    </div>
  )
}

/** Labelled bars, one hue; the number and % are always written out. */
function CategoryBars({ stats, labels }: { stats: PerfStats; labels: Record<string, string> }) {
  if (!stats.top_categories.length) return <p className="text-sm text-muted-foreground">No client revision notes in this period.</p>
  return (
    <ul className="space-y-1.5">
      {stats.top_categories.slice(0, 4).map((c) => (
        <li key={c.category} className="grid grid-cols-[6.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-sm">
          <span className="truncate">{labels[c.category] ?? c.category}</span>
          <span className="h-2.5 rounded-full bg-muted overflow-hidden" aria-hidden>
            <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(c.share, 3)}%` }} />
          </span>
          <span className="text-right tabular-nums text-muted-foreground">{c.count} · {c.share}%</span>
        </li>
      ))}
    </ul>
  )
}

function EditorCard({ e, labels, colorClass }: { e: Editor; labels: Record<string, string>; colorClass?: string }) {
  const t = e.totals
  return (
    <section className="clay-card p-4 md:p-5 min-w-0">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="font-heading font-semibold break-words flex items-center gap-2">
          {colorClass && <span className={cn('w-3 h-3 rounded-full flex-shrink-0 self-center', colorClass)} aria-hidden />}
          {e.name}
          {e.disabled && <span className="text-xs font-medium text-muted-foreground">(disabled)</span>}
        </h3>
        <span className="text-xs text-muted-foreground capitalize whitespace-nowrap">{e.team_role}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Videos delivered" value={String(t.videos)} />
        <Stat label="Revisions per video" value={fmt(t.revisions_per_video)} />
        <Stat label="Avg turnaround" value={fmt(t.avg_turnaround_days, ' d')} />
        <Stat label="On time" value={fmt(t.on_time_pct, '%')} />
      </div>
      <h4 className="text-sm font-semibold mt-4 mb-2">
        Top revision categories
        {t.revision_notes > 0 && <span className="ml-1.5 font-normal text-muted-foreground">({t.revision_notes} notes)</span>}
      </h4>
      <CategoryBars stats={t} labels={labels} />
    </section>
  )
}

// ── Who edits each client (client-first percentage bars) ────────────────────

function colorFor(key: string, legend: Split['legend']): string {
  if (key === 'other') return NEUTRAL.other
  if (key === 'unassigned') return NEUTRAL.unassigned
  const i = legend.find((l) => l.key === key)?.color_index ?? -1
  return i >= 0 ? EDITOR_COLORS[i % EDITOR_COLORS.length] : NEUTRAL.other
}

function ClientSplit({ split }: { split: Split }) {
  const [all, setAll] = useState(false)
  const names = Object.fromEntries(split.legend.map((l) => [l.key, l.name]))
  if (!split.clients.length) return <p className="text-sm text-muted-foreground">No delivered videos in this period.</p>
  const shown = all ? split.clients : split.clients.slice(0, 10)
  return (
    <>
      {/* Legend: same colour per editor on every row. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4 text-sm">
        {split.legend.map((l) => (
          <li key={l.key} className="flex items-center gap-1.5">
            <span className={cn('w-3 h-3 rounded-sm', colorFor(l.key, split.legend))} aria-hidden />{l.name}
          </li>
        ))}
      </ul>

      <ul className="grid gap-x-10 gap-y-4 lg:grid-cols-2">
        {shown.map((c) => {
          const label = c.split.map((s) => `${names[s.key]} ${s.share}%`).join(', ')
          return (
            <li key={c.client_id} className="min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold break-words min-w-0">{c.name}</span>
                <span className="text-sm tabular-nums whitespace-nowrap text-muted-foreground">{c.videos} video{c.videos === 1 ? '' : 's'}</span>
              </div>
              {/* 100% stacked bar; 2px surface gap between segments. */}
              <div className="flex h-3.5 gap-[2px] rounded-full overflow-hidden mt-1.5 bg-muted" role="img" aria-label={`${c.name}: ${label}`}>
                {c.split.filter((s) => s.share > 0).map((s) => (
                  <span
                    key={s.key}
                    className={cn('h-full first:rounded-l-full last:rounded-r-full', colorFor(s.key, split.legend))}
                    style={{ width: `${s.share}%` }}
                    title={`${names[s.key]}: ${s.videos} of ${c.videos} video${c.videos === 1 ? '' : 's'} (${s.share}%)`}
                  />
                ))}
              </div>
              <p className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-muted-foreground">
                {c.split.map((s) => (
                  <span key={s.key} className="flex items-center gap-1 tabular-nums">
                    <span className={cn('w-2 h-2 rounded-full', colorFor(s.key, split.legend))} aria-hidden />
                    <span className="text-foreground">{names[s.key]}</span> {s.share}%
                  </span>
                ))}
              </p>
            </li>
          )
        })}
      </ul>
      {split.clients.length > 10 && (
        <button onClick={() => setAll((a) => !a)} className="mt-3 min-h-[44px] px-3 rounded-xl text-sm text-primary hover:bg-primary/5 font-medium">
          {all ? 'Show fewer' : `Show all ${split.clients.length} clients`}
        </button>
      )}
    </>
  )
}

export default function AdminEditorPerformance() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('period')
  const period: PerformancePeriod = raw === '30' || raw === '365' || raw === 'all' ? raw : '90'
  const { data, isLoading, error } = useEditorPerformance(period)
  const labels = Object.fromEntries((data?.categories ?? []).map((c) => [c.key, c.label]))

  return (
    <AdminLayout>
      <main className="px-4 md:px-6 py-6 md:py-8 space-y-4 md:space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-heading font-semibold tracking-tight">Editor Performance</h2>
            <p className="text-muted-foreground text-sm mt-0.5">
              Delivered = first version sent to the client · turnaround = request → first version · on time = editor deadline met.
              {data && <> Updated {format(new Date(data.generated_at), 'HH:mm')}.</>}
            </p>
          </div>
          <PeriodPicker value={period} onChange={(p) => setParams(p === '90' ? {} : { period: p })} />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
        ) : error ? (
          <div className="clay-card p-5 text-sm">
            <p className="font-semibold">Couldn't load Editor Performance</p>
            <p className="text-muted-foreground mt-1">{(error as Error).message}</p>
          </div>
        ) : data && data.editors.length === 0 ? (
          <div className="clay-card p-5 text-sm text-muted-foreground">No editors yet.</div>
        ) : data ? (
          <>
            <div className="grid gap-4 md:gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {data.editors.map((e) => {
                const inLegend = data.client_split.legend.find((l) => l.key === e.editor_id)
                return <EditorCard key={e.editor_id} e={e} labels={labels} colorClass={inLegend ? colorFor(e.editor_id, data.client_split.legend) : undefined} />
              })}
            </div>
            <section className="clay-card p-4 md:p-5 min-w-0">
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <h3 className="font-heading font-semibold">Who edits each client</h3>
                <span className="text-xs text-muted-foreground text-right">Share of each client's delivered videos · shared videos count half each</span>
              </div>
              <ClientSplit split={data.client_split} />
            </section>
          </>
        ) : null}
      </main>
    </AdminLayout>
  )
}
