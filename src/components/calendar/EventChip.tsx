import { Icon } from '@/components/ds'
import { calName, calStatus } from '@/lib/calStatus'
import { markSheetOrigin } from '@/lib/sheetOrigin'
import type { CalendarEvent } from '@/types'

/** One post in a calendar day (DESIGN.md §6 Calendar): a mini raised chip
 *  with its status dot and title. The dot shows the status, so the title
 *  doesn't repeat it. On phones only the dot shows. */
export function EventChip({ event, onClick }: { event: CalendarEvent; label?: string; onClick: (e: React.MouseEvent) => void }) {
  const st = calStatus(event)
  const [d, l] = st.colors
  const name = calName(event)
  return (
    <button
      type="button"
      onClick={(e) => { markSheetOrigin(e.currentTarget); onClick(e) }}
      title={`${name} · ${st.label}`}
      className="ds-post"
    >
      <span aria-hidden="true" className="ds-dot" style={{ '--sd-d': d, '--sh-d': d + '26', '--sd-l': l, '--sh-l': l + '26', width: 6, height: 6, borderRadius: 999, flex: 'none' } as React.CSSProperties} />
      <span className="ds-post-t">{name}</span>
      {event.double_down && <Icon name="local_fire_department" className="ds-post-x text-orange-500 flex-none" size={12} />}
      {event.content_type && <span className="ds-post-x flex-none" style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--faint)' }}>{event.content_type.slice(0, 1)}</span>}
    </button>
  )
}
