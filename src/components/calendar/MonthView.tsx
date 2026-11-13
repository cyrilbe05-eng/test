import { useRef } from 'react'
import { addMonths, format, isSameDay, isSameMonth, subMonths } from 'date-fns'
import { EventChip } from '@/components/calendar/EventChip'
import { Ms } from '@/components/ds'
import { ToolMenu } from '@/components/ds/ToolMenu'
import { CAL_STATUSES, PROJECT_STAGES } from '@/lib/calStatus'
import { markSheetOrigin } from '@/lib/sheetOrigin'
import { cn } from '@/lib/utils'
import type { CalendarEvent, ContentStatus, ContentType } from '@/types'

// The month calendar shared by the admin, team and client calendars
// (DESIGN.md §6 Calendar): header (month, ‹ ›, Today, type + status menus,
// "New post") and the grid of raised day cards. Each page keeps its own data,
// filters and sheets; this only draws them.

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TYPES: ContentType[] = ['Reel', 'Story', 'Carousel', 'Post']
const STATUSES: { value: ContentStatus; key: keyof typeof CAL_STATUSES }[] = [
  { value: 'Idea', key: 'idea' }, { value: 'Drafting', key: 'drafting' }, { value: 'Scheduled', key: 'scheduled' },
]

interface Props {
  viewDate: Date
  onMonth: (d: Date) => void
  days: Date[]
  eventsForDay: (d: Date) => CalendarEvent[]
  onCreate: (d: Date) => void
  onSelect: (e: CalendarEvent) => void
  onMore: (d: Date) => void
  type: ContentType | 'all'
  onType: (v: ContentType | 'all') => void
  status: ContentStatus | 'all'
  onStatus: (v: ContentStatus | 'all') => void
  /** Extra filter (the copywriter's client picker). */
  extra?: React.ReactNode
}

export function MonthView({ viewDate, onMonth, days, eventsForDay, onCreate, onSelect, onMore, type, onType, status, onStatus, extra }: Props) {
  const dir = useRef(0)
  const go = (d: Date, n: number) => { dir.current = n; onMonth(d) }
  const today = new Date()
  const monthKey = format(viewDate, 'yyyy-MM')

  return (
    <div className="ds-cal">
      <header className="flex flex-wrap items-center gap-x-2.5 gap-y-3 pt-5 pb-5">
        <h1 className="tabular-nums mr-1" style={{ minWidth: 0 }}>{format(viewDate, 'MMMM yyyy')}</h1>
        <div className="flex items-center">
          <button type="button" className="ds-ibtn" aria-label="Previous month" onClick={() => go(subMonths(viewDate, 1), -1)}><Ms name="chevron_left" /></button>
          <button type="button" className="ds-ibtn" aria-label="Next month" onClick={() => go(addMonths(viewDate, 1), 1)}><Ms name="chevron_right" /></button>
        </div>
        <button type="button" className="ds-ghost-btn ds-tap" onClick={() => go(new Date(), Math.sign(+new Date() - +viewDate))}>Today</button>
        <div className="flex-1" />
        <div className="flex items-center gap-2 flex-wrap">
          {extra}
          <ToolMenu label="Type" value={type} onChange={onType}
            options={[{ value: 'all', label: 'All types' }, ...TYPES.map((t) => ({ value: t, label: t }))]} />
          <ToolMenu label="Status" value={status} onChange={onStatus}
            options={[{ value: 'all', label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s.value, label: s.value, dot: CAL_STATUSES[s.key].colors }))]}
            notes={PROJECT_STAGES.map((s) => ({ label: s.stage, dot: s.status.colors }))} />
          <button type="button" className="ds-primary ds-tap" onClick={(e) => { markSheetOrigin(e.currentTarget); onCreate(new Date()) }}>
            <Ms name="add" style={{ fontSize: 18, width: 18, color: 'inherit' }} />New post
          </button>
        </div>
      </header>

      <div className="ds-cal-head" aria-hidden>
        {DAY_NAMES.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div key={monthKey} className={cn('ds-cal-grid', dir.current < 0 ? 'from-left' : dir.current > 0 ? 'from-right' : '')}>
        {days.map((day, idx) => {
          const dayEvents = eventsForDay(day)
          const inMonth = isSameMonth(day, viewDate)
          const isToday = isSameDay(day, today)
          const visible = dayEvents.slice(0, 3)
          const overflow = dayEvents.length - visible.length
          return (
            <div key={idx} onClick={(e) => { markSheetOrigin(e.currentTarget); onCreate(day) }}
              className={cn(inMonth ? 'ds-dcard' : 'ds-dout')} style={{ animationDelay: `${Math.min(idx, 34) * 9}ms` }}>
              <div className="ds-day-top">
                <span className={cn('ds-day-n', isToday && 'today')}>{format(day, 'd')}</span>
                <Ms name="add" className="ds-day-add" style={{ fontSize: 16, width: 16 }} />
              </div>
              <div className="ds-day-posts">
                {visible.map((event) => (
                  <EventChip key={event.id} event={event} onClick={(e) => { e.stopPropagation(); onSelect(event) }} />
                ))}
                {overflow > 0 && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); markSheetOrigin(e.currentTarget.closest('.ds-dcard, .ds-dout')); onMore(day) }} className="ds-day-more">
                    {overflow}<span className="hidden sm:inline"> more</span>
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
