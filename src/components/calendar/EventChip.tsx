import { calColor } from '@/lib/calColors'
import { hexA } from '@/lib/dsColors'
import type { CalendarEvent } from '@/types'

/** One entry in a calendar day: soft tint of its colour, a dot, readable text. */
export function EventChip({ event, label, onClick }: { event: CalendarEvent; label: string; onClick: (e: React.MouseEvent) => void }) {
  const c = calColor(event.color)
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="flex items-center gap-1.5 text-left max-sm:justify-center max-sm:!p-0 max-sm:w-[22px] sm:w-full transition-[filter] hover:brightness-95 sm:min-h-[22px] max-sm:h-[22px] dark:hover:brightness-125"
      style={{ padding: '2px 7px', borderRadius: 7, background: hexA(c, 0.14), fontSize: 11.5, lineHeight: 1.3 }}
    >
      <span aria-hidden="true" className="flex-none rounded-full" style={{ width: 6, height: 6, background: c }} />
      {event.posted && <span className="max-sm:hidden flex-none text-muted-foreground" style={{ fontSize: 10 }} title="Posted">✓</span>}
      {event.double_down && <span className="max-sm:hidden flex-none" style={{ fontSize: 10 }}>🔥</span>}
      {event.content_type && <span className="max-sm:hidden flex-none text-muted-foreground" style={{ fontSize: 10, fontWeight: 600 }}>{event.content_type.slice(0, 1)}</span>}
      <span className="max-sm:hidden truncate text-foreground" style={{ fontWeight: 500 }}>{label}</span>
    </button>
  )
}
