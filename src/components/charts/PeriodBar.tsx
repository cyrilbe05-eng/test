import { format } from 'date-fns'
import { Segmented } from '@/components/ds'
import { PERIOD_OPTIONS, type PeriodKey } from '@/lib/period'

// Analytics period bar (This week … All time, Custom with two dates).
// Shared by admin Analytics and the editors' My Stats.

export function PeriodBar({ value, from, to, onChange }: {
  value: PeriodKey; from: string; to: string
  onChange: (next: { period: PeriodKey; from?: string; to?: string }) => void
}) {
  const today = format(new Date(), 'yyyy-MM-dd')
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-1">
        <Segmented label="Period" width={104} value={value} onChange={(k) => onChange({ period: k, from, to })}
          options={PERIOD_OPTIONS.map((o) => ({ value: o.key, label: o.label }))} />
      </div>
      {value === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" aria-label="From" value={from} max={to || today} onChange={(e) => onChange({ period: 'custom', from: e.target.value, to })}
            className="min-h-[44px] px-3 rounded-xl bg-card border border-border text-sm tabular-nums" />
          <span className="text-muted-foreground">–</span>
          <input type="date" aria-label="To" value={to} min={from} max={today} onChange={(e) => onChange({ period: 'custom', from, to: e.target.value })}
            className="min-h-[44px] px-3 rounded-xl bg-card border border-border text-sm tabular-nums" />
        </div>
      )}
    </div>
  )
}
