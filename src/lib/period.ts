import {
  addDays, endOfDay, endOfMonth, startOfDay, startOfMonth, startOfWeek, subMonths, subWeeks, differenceInCalendarDays,
} from 'date-fns'

// Analytics period bar. Weeks start on Monday. Ranges are in local time;
// `to` is never in the future (nothing can be delivered tomorrow).

export type PeriodKey = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'last_3_months' | 'all' | 'custom'

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'this_week', label: 'This week' },
  { key: 'last_week', label: 'Last week' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'last_3_months', label: 'Last 3 months' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' },
]

export const isPeriodKey = (k: string | null): k is PeriodKey => PERIOD_OPTIONS.some((o) => o.key === k)

export interface Range { from: Date | null; to: Date }

/** `custom` takes YYYY-MM-DD strings (inclusive days). */
export function periodRange(key: PeriodKey, now: Date, custom?: { from?: string | null; to?: string | null }): Range {
  const wk = { weekStartsOn: 1 as const }
  const cap = (d: Date) => (d > now ? now : d)
  switch (key) {
    case 'this_week': return { from: startOfWeek(now, wk), to: now }
    case 'last_week': {
      const s = startOfWeek(subWeeks(now, 1), wk)
      return { from: s, to: endOfDay(addDays(s, 6)) }
    }
    case 'this_month': return { from: startOfMonth(now), to: now }
    case 'last_month': {
      const s = startOfMonth(subMonths(now, 1))
      return { from: s, to: endOfMonth(s) }
    }
    case 'last_3_months': return { from: startOfDay(subMonths(now, 3)), to: now }
    case 'all': return { from: null, to: now }
    case 'custom': {
      const f = custom?.from ? startOfDay(new Date(`${custom.from}T00:00:00`)) : null
      const t = custom?.to ? endOfDay(new Date(`${custom.to}T00:00:00`)) : now
      if (f && t < f) return { from: startOfDay(t), to: cap(endOfDay(f)) }
      return { from: f, to: cap(t) }
    }
  }
}

export const inRange = (iso: string | null | undefined, r: Range) => {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return (r.from == null || t >= r.from.getTime()) && t <= r.to.getTime()
}

/** Chart bucket for a range: days up to ~5 weeks, weeks up to ~4 months, else months. */
export function bucketFor(r: Range, earliest: Date): 'day' | 'week' | 'month' {
  const days = differenceInCalendarDays(r.to, r.from ?? earliest)
  return days <= 35 ? 'day' : days <= 120 ? 'week' : 'month'
}

/** Query string for the API: from/to ISO, or days=all. */
export const rangeQuery = (r: Range) =>
  r.from ? `from=${encodeURIComponent(r.from.toISOString())}&to=${encodeURIComponent(r.to.toISOString())}` : 'days=all'
