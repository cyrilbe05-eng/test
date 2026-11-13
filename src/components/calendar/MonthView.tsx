import { useRef } from 'react'
import { addMonths, format, isSameDay, isSameMonth, subMonths } from 'date-fns'
import { EventChip } from '@/components/calendar/EventChip'
import { Icon, Ms } from '@/components/ds'
import { calendarLabel } from '@/lib/calendarLabel'
import { cn } from '@/lib/utils'
import type { CalendarEvent } from '@/types'

// The month calendar shared by the admin, team and client calendars: header
// (month, ‹ ›, Today, the page's filters) and the grid. Each page keeps its own
// data, filters and modals; this only draws them.

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TYPES = ['Reel', 'Story', 'Carousel', 'Post']
const STATUSES = ['Idea', 'Drafting', 'Scheduled']

interface Props {
  viewDate: Date
  onMonth: (d: Date) => void
  days: Date[]
  eventsForDay: (d: Date) => CalendarEvent[]
  onCreate: (d: Date) => void
  onSelect: (e: CalendarEvent) => void
  onMore: (d: Date) => void
  filters?: React.ReactNode
}

export function MonthView({ viewDate, onMonth, days, eventsForDay, onCreate, onSelect, onMore, filters }: Props) {
  // Slide direction of the month change (+1 next, -1 previous).
  const dir = useRef(0)
  const go = (d: Date, n: number) => { dir.current = n; onMonth(d) }
  const today = new Date()

  return (
    <>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-3 pt-5 pb-5">
        <h1 className="tabular-nums" style={{ minWidth: 0 }}>{format(viewDate, 'MMMM yyyy')}</h1>
        <div className="flex items-center">
          <button type="button" className="ds-ibtn" aria-label="Previous month" onClick={() => go(subMonths(viewDate, 1), -1)}><Ms name="chevron_left" /></button>
          <button type="button" className="ds-ibtn" aria-label="Next month" onClick={() => go(addMonths(viewDate, 1), 1)}><Ms name="chevron_right" /></button>
        </div>
        <button type="button" className="ds-ghost-btn ds-tap" style={{ height: 34 }} onClick={() => go(new Date(), Math.sign(+new Date() - +viewDate))}>Today</button>
        <div className="flex-1" />
        {filters && <div className="flex items-center gap-2 overflow-x-auto max-w-full -mx-4 px-4 md:mx-0 md:px-0 pb-1 md:pb-0">{filters}</div>}
      </header>

      <div className="ds-month">
        <div className="ds-month-head">
          {DAY_NAMES.map((d) => <div key={d}>{d}</div>)}
        </div>
        <div key={format(viewDate, 'yyyy-MM')} className="ds-month-grid" style={{ '--dir': dir.current } as React.CSSProperties}>
          {days.map((day, idx) => {
            const dayEvents = eventsForDay(day)
            const inMonth = isSameMonth(day, viewDate)
            const isToday = isSameDay(day, today)
            const visible = dayEvents.slice(0, 3)
            const overflow = dayEvents.length - visible.length
            const weekend = idx % 7 === 0 || idx % 7 === 6
            return (
              <div key={idx} onClick={() => onCreate(day)} className={cn('ds-day', !inMonth && 'out', weekend && 'weekend')}>
                <div className="ds-day-top">
                  <span className={cn('ds-day-n', isToday && 'today')}>{format(day, 'd')}</span>
                  <Icon name="add" size={16} className="ds-day-add" />
                </div>
                <div className="flex flex-wrap gap-1 sm:block sm:space-y-0.5">
                  {visible.map((event) => (
                    <EventChip key={event.id} event={event} label={calendarLabel(event)} onClick={(e) => { e.stopPropagation(); onSelect(event) }} />
                  ))}
                  {overflow > 0 && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); onMore(day) }} className="ds-day-more">
                      +{overflow}<span className="hidden sm:inline"> more</span>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex items-center gap-x-4 gap-y-1 mt-4 flex-wrap" style={{ fontSize: 12, color: 'var(--faint)' }}>
        {TYPES.map((t) => <span key={t}><b className="font-semibold mr-1" style={{ color: 'var(--soft-text)' }}>{t.slice(0, 1)}</b>{t}</span>)}
        <span className="w-px h-3" style={{ background: 'var(--line)' }} />
        {STATUSES.map((s) => <span key={s}>{s}</span>)}
        <span className="ml-auto inline-flex items-center gap-1"><Icon name="local_fire_department" className="text-orange-500" /> Double Down</span>
      </div>
    </>
  )
}
