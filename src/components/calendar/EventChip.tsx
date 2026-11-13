import { calColor } from '@/lib/calColors'
import { hexA } from '@/lib/dsColors'
import type { CalendarEvent } from '@/types'

/** One entry in a calendar day: a colour dot and the label, no filled pill
 *  (a soft hover row). On phones only the dot shows, on a soft tint. */
export function EventChip({ event, label, onClick }: { event: CalendarEvent; label: string; onClick: (e: React.MouseEvent) => void }) {
  const c = calColor(event.color)
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="flex items-center gap-2 text-left rounded-md transition-colors sm:w-full sm:h-[22px] sm:px-1.5 sm:hover:bg-[var(--hover)] max-sm:justify-center max-sm:w-[22px] max-sm:h-[22px] max-sm:bg-[var(--chip)]"
      style={{ '--chip': hexA(c, 0.16), fontSize: 12, lineHeight: 1.2 } as React.CSSProperties}
    >
      <span aria-hidden="true" className="flex-none rounded-full" style={{ width: 7, height: 7, background: c }} />
      <span className="max-sm:hidden truncate flex-1 min-w-0 text-foreground">{label}</span>
      {event.double_down && <span className="max-sm:hidden flex-none" style={{ fontSize: 10 }}>🔥</span>}
      {event.posted && <span className="max-sm:hidden flex-none text-muted-foreground" style={{ fontSize: 11 }} title="Posted">✓</span>}
      {event.content_type && <span className="max-sm:hidden flex-none text-muted-foreground" style={{ fontSize: 10.5, fontWeight: 600 }}>{event.content_type.slice(0, 1)}</span>}
    </button>
  )
}
