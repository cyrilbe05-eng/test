import { Icon } from '@/components/ds'
import { format } from 'date-fns'
import type { CalendarEvent } from '@/types'
import { calName, calStatus } from '@/lib/calStatus'

/** Every entry on one day.
 *
 *  Month cells only have room for ~3 entries and used to render a plain
 *  "+N more" label — dead text, so anything past the third entry of a busy
 *  day was unreachable. The label is now a button that opens this list. */
export function DayEventsModal({
  day,
  events,
  onSelect,
  onClose,
}: {
  day: Date
  events: CalendarEvent[]
  onSelect: (event: CalendarEvent) => void
  onClose: () => void
}) {
  return (
    <div className="ds-cal-veil" onClick={onClose}>
      <div
        className="ds-cal-sheet max-w-sm flex flex-col"
        style={{ maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b border-border flex items-center justify-between gap-2">
          <div>
            <h2 className="font-heading font-semibold">{format(day, 'EEEE d MMMM')}</h2>
            <p className="text-xs text-muted-foreground">{events.length} item{events.length === 1 ? '' : 's'}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors" title="Close">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto p-2 space-y-1">
          {events.map((event) => (
            <button
              key={event.id}
              onClick={() => onSelect(event)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl hover:bg-muted transition-colors text-left"
            >
              <span aria-hidden className="ds-dot" style={{ '--sd-d': calStatus(event).colors[0], '--sh-d': calStatus(event).colors[0] + '26', '--sd-l': calStatus(event).colors[1], '--sh-l': calStatus(event).colors[1] + '26', width: 7, height: 7, borderRadius: 999, flex: 'none' } as React.CSSProperties} />
              {event.double_down && <span className="leading-none flex-shrink-0"><Icon name="local_fire_department" className="text-orange-500" size={12} /></span>}
              <span className="text-sm font-medium truncate flex-1">{calName(event)}</span>
              <span className="text-xs text-muted-foreground flex-shrink-0">{calStatus(event).label}</span>
              {event.content_type && (
                <span className="text-[10px] font-semibold text-muted-foreground flex-shrink-0">{event.content_type}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
