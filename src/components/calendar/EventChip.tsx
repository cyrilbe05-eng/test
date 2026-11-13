import { Icon } from '@/components/ds'
import { calColor } from '@/lib/calColors'
import { hexA } from '@/lib/dsColors'
import type { CalendarEvent } from '@/types'

/** One entry in a calendar day. Desktop: colour dot + title, and the client
 *  and stage underneath in quiet text (no filled pill). Phones: a tinted dot. */
export function EventChip({ event, label, onClick }: { event: CalendarEvent; label: string; onClick: (e: React.MouseEvent) => void }) {
  const c = calColor(event.color)
  // Project entries are titled "Title — Stage"; the stage goes on the second line.
  const [title, stage] = event.title.split(' — ')
  const sub = [event.client_label, stage].filter(Boolean).join(' · ')
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="ds-entry max-sm:justify-center max-sm:w-[22px] max-sm:h-[22px] max-sm:bg-[var(--chip)] max-sm:!p-0"
      style={{ '--chip': hexA(c, 0.16) } as React.CSSProperties}
    >
      <span aria-hidden="true" className="ds-entry-dot" style={{ background: c }} />
      <span className="max-sm:hidden flex-1 min-w-0">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="ds-entry-t">{title}</span>
          {event.double_down && <Icon name="local_fire_department" className="text-orange-500 flex-none" size={12} />}
          {event.posted && <Icon name="check" className="text-muted-foreground flex-none" size={12} />}
          {event.content_type && <span className="flex-none text-muted-foreground" style={{ fontSize: 10.5, fontWeight: 600 }}>{event.content_type.slice(0, 1)}</span>}
        </span>
        {sub && <span className="ds-entry-s">{sub}</span>}
      </span>
    </button>
  )
}
