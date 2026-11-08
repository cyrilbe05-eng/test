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

const fmt = (n: number | null, suffix = '') => (n == null ? '—' : `${n}${suffix}`)
type Editor = EditorPerformance['editors'][number]

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

function EditorCard({ e, labels }: { e: Editor; labels: Record<string, string> }) {
  const t = e.totals
  return (
    <section className="clay-card p-4 md:p-5 min-w-0">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="font-heading font-semibold break-words">
          {e.name}
          {e.disabled && <span className="ml-2 text-xs font-medium text-muted-foreground">(disabled)</span>}
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

function topLine(s: PerfStats, labels: Record<string, string>) {
  return s.top_categories.slice(0, 2).map((c) => `${labels[c.category] ?? c.category} ${c.count}`).join(', ') || '—'
}

/** Desktop: one table, editor name spanning their client rows. */
function MatrixTable({ editors, labels }: { editors: Editor[]; labels: Record<string, string> }) {
  return (
    <table className="hidden md:table w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground border-b border-border">
          <th className="py-2 pr-3 font-medium">Editor</th>
          <th className="py-2 px-3 font-medium">Client</th>
          <th className="py-2 px-3 font-medium text-right">Videos</th>
          <th className="py-2 px-3 font-medium text-right">Revisions / video</th>
          <th className="py-2 px-3 font-medium text-right">Avg turnaround</th>
          <th className="py-2 px-3 font-medium text-right">On time</th>
          <th className="py-2 pl-3 font-medium">Top revision categories</th>
        </tr>
      </thead>
      {editors.map((e) => (
        <tbody key={e.editor_id} className="border-b border-border last:border-0">
          {e.clients.length === 0 ? (
            <tr>
              <td className="py-2.5 pr-3 font-semibold align-top">{e.name}</td>
              <td colSpan={6} className="py-2.5 px-3 text-muted-foreground">No delivered videos in this period</td>
            </tr>
          ) : e.clients.map((c, i) => (
            <tr key={c.client_id} className={cn(i > 0 && 'border-t border-border/40')}>
              {i === 0 && <td rowSpan={e.clients.length} className="py-2.5 pr-3 font-semibold align-top">{e.name}</td>}
              <td className="py-2.5 px-3">{c.name}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{c.videos}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{fmt(c.revisions_per_video)}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{fmt(c.avg_turnaround_days, ' d')}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{fmt(c.on_time_pct, '%')}</td>
              <td className="py-2.5 pl-3 text-muted-foreground">{topLine(c, labels)}</td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  )
}

/** Phone: per editor, compact client cards — top 3 first, "Show all" for the
 *  rest — so the list stays short (and never scrolls sideways). */
function MatrixCards({ editors, labels }: { editors: Editor[]; labels: Record<string, string> }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  return (
    <div className="md:hidden space-y-5">
      {editors.map((e) => {
        const all = !!expanded[e.editor_id]
        const shown = all ? e.clients : e.clients.slice(0, 3)
        return (
        <div key={e.editor_id}>
          <h4 className="font-semibold mb-2">{e.name}</h4>
          {e.clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">No delivered videos in this period</p>
          ) : (
            <>
            <ul className="space-y-2">
              {shown.map((c) => (
                <li key={c.client_id} className="rounded-xl border border-border p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium break-words min-w-0">{c.name}</span>
                    <span className="text-sm tabular-nums whitespace-nowrap">{c.videos} video{c.videos === 1 ? '' : 's'}</span>
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums mt-1">
                    {fmt(c.revisions_per_video)} revisions/video · {fmt(c.avg_turnaround_days, ' d')} turnaround · on time {fmt(c.on_time_pct, '%')}
                  </p>
                  {c.top_categories.length > 0 && <p className="text-xs text-muted-foreground mt-0.5">Top: {topLine(c, labels)}</p>}
                </li>
              ))}
            </ul>
            {e.clients.length > 3 && (
              <button
                onClick={() => setExpanded((x) => ({ ...x, [e.editor_id]: !all }))}
                className="mt-1 min-h-[44px] px-3 rounded-xl text-sm text-primary hover:bg-primary/5 font-medium"
              >
                {all ? 'Show fewer' : `Show all ${e.clients.length} clients`}
              </button>
            )}
            </>
          )}
        </div>
        )
      })}
    </div>
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
              {data.editors.map((e) => <EditorCard key={e.editor_id} e={e} labels={labels} />)}
            </div>
            <section className="clay-card p-4 md:p-5 min-w-0">
              <h3 className="font-heading font-semibold mb-3">Editor × client</h3>
              <MatrixTable editors={data.editors} labels={labels} />
              <MatrixCards editors={data.editors} labels={labels} />
            </section>
          </>
        ) : null}
      </main>
    </AdminLayout>
  )
}
