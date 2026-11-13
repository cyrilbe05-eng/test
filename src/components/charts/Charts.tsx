import { useState } from 'react'
import { niceTicks } from '@/lib/chartScale'
import { cn } from '@/lib/utils'

// Small chart kit for the stats pages (DESIGN.md + the dataviz rules):
// neutral ink marks, colour only for status, recessive grid, 4px rounded
// data-ends on the baseline, 2px gaps between stacked parts, a hover
// tooltip on every bar, a legend whenever there are 2+ series. Plain HTML /
// SVG with CSS variables, so both themes work and nothing re-renders on a
// theme switch.

export type Series = { name: string; color: string }
export type BarDatum = { label: string; values: number[]; title?: string }

/** Vertical bars (one series, or stacked series bottom → top). */
export function BarChart({ data, series, height = 180, ariaLabel }: { data: BarDatum[]; series: Series[]; height?: number; ariaLabel: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0))
  const ticks = niceTicks(Math.max(...totals, 0))
  const top = ticks[ticks.length - 1]
  return (
    <div>
      {series.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 mb-3" style={{ fontSize: 12, color: 'var(--faint)' }}>
          {series.map((s) => (
            <li key={s.name} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />{s.name}</li>
          ))}
        </ul>
      )}
      <div className="relative flex" style={{ height }} role="img" aria-label={ariaLabel}>
        {/* y axis */}
        <div className="relative w-7 flex-none" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-2 tabular-nums" style={{ bottom: `calc(${(t / top) * 100}% - 7px)`, fontSize: 11, color: 'var(--faint)' }}>{t}</span>
          ))}
        </div>
        <div className="relative flex-1 min-w-0">
          {ticks.map((t) => (
            <div key={t} className="absolute left-0 right-0" style={{ bottom: `${(t / top) * 100}%`, borderTop: t === 0 ? '1px solid var(--line)' : '1px dashed var(--line)' }} aria-hidden />
          ))}
          <div className="absolute inset-0 flex items-end gap-[6%] px-[3%]">
            {data.map((d, i) => {
              const total = totals[i]
              return (
                <div key={d.label} className="relative flex-1 h-full flex flex-col justify-end items-stretch"
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === i ? null : i)}>
                  {/* hit target: the whole column */}
                  <div className={cn('absolute inset-x-[-12%] inset-y-0 rounded-lg transition-colors', hover === i && 'bg-[var(--hover)]')} aria-hidden />
                  <div className="relative flex flex-col-reverse gap-[2px] ds-bar-grow" style={{ height: `${(total / top) * 100}%`, animationDelay: `${i * 45}ms` }}>
                    {d.values.map((v, si) => v > 0 && (
                      <div key={si} style={{ flex: v, background: series[si]?.color, minHeight: 3, borderRadius: si === d.values.length - 1 || d.values.slice(si + 1).every((x) => x === 0) ? '4px 4px 1px 1px' : 1 }} />
                    ))}
                  </div>
                  {hover === i && (
                    <div className="ds-tip" style={{ bottom: `calc(${(total / top) * 100}% + 8px)` }}>
                      <p style={{ fontWeight: 600, color: 'var(--strong)' }}>{d.title ?? d.label}</p>
                      {series.map((s, si) => (
                        <p key={s.name} className="flex items-center gap-1.5 whitespace-nowrap">
                          {series.length > 1 && <span className="w-2 h-2 rounded-[2px]" style={{ background: s.color }} />}
                          {s.name} <b className="tabular-nums ml-auto pl-3" style={{ color: 'var(--strong)' }}>{d.values[si] ?? 0}</b>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="flex pl-7" aria-hidden>
        <div className="flex-1 flex gap-[6%] px-[3%]">
          {data.map((d, i) => (
            <span key={d.label} className="flex-1 text-center truncate pt-2" style={{ fontSize: 11.5, color: hover === i ? 'var(--strong)' : 'var(--faint)' }}>{d.label}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

/** One headline percentage as a ring (no axis needed). */
export function Ring({ value, size = 112, stroke = 9, label, sub }: { value: number | null; size?: number; stroke?: number; label: string; sub?: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value))
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${value == null ? 'no data' : value + '%'}`} className="flex-none -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--strong)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} className="ds-ring-draw" style={{ '--c': c } as React.CSSProperties} />
      </svg>
      <div className="min-w-0">
        <p className="tabular-nums" style={{ fontSize: 30, fontWeight: 650, letterSpacing: '-.03em', color: 'var(--strong)', lineHeight: 1.1 }}>{value == null ? '—' : `${value}%`}</p>
        <p style={{ fontSize: 13, color: 'var(--text)' }}>{label}</p>
        {sub && <p style={{ fontSize: 12, color: 'var(--faint)' }}>{sub}</p>}
      </div>
    </div>
  )
}

/** Labelled horizontal bars; each row names itself (dot + label + count). */
export function HBars({ rows }: { rows: { key: string; label: string; value: number; dot?: React.ReactNode }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2.5rem] items-center gap-3" style={{ fontSize: 13 }}>
          <span className="flex items-center gap-2 min-w-0">{r.dot}<span className="truncate">{r.label}</span></span>
          <span className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--track)' }} aria-hidden>
            <span className="block h-full rounded-full ds-bar-x" style={{ width: `${(r.value / max) * 100}%`, background: 'var(--strong)', animationDelay: `${i * 50}ms` }} />
          </span>
          <span className="text-right tabular-nums" style={{ fontWeight: 600, color: 'var(--strong)' }}>{r.value}</span>
        </li>
      ))}
    </ul>
  )
}

/** A stat tile: label, big number, quiet detail. */
export function StatTile({ label, value, sub, i = 0 }: { label: string; value: React.ReactNode; sub?: React.ReactNode; i?: number }) {
  return (
    <div className="clay-card p-4 min-w-0" style={{ animationDelay: `${i * 50}ms` }}>
      <p style={{ fontSize: 12.5, color: 'var(--faint)' }}>{label}</p>
      <p className="tabular-nums mt-1" style={{ fontSize: 28, fontWeight: 650, letterSpacing: '-.03em', color: 'var(--strong)', lineHeight: 1.15 }}>{value}</p>
      {sub && <p className="mt-0.5 truncate" style={{ fontSize: 12, color: 'var(--faint)' }}>{sub}</p>}
    </div>
  )
}

/** A titled chart panel. */
export function ChartCard({ title, right, children, className, delay = 0 }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <section className={cn('ds-panel', className)} style={{ padding: '18px 20px 18px', animationDelay: `${delay}ms` }}>
      <div className="ds-panel-head" style={{ marginBottom: 14 }}><h2>{title}</h2>{right}</div>
      {children}
    </section>
  )
}
