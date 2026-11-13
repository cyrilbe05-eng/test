import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { PostedToggle } from './PostedToggle'
import { calName, calStatus } from '@/lib/calStatus'
import type { CalendarEvent } from '@/types'

/** A project's calendar entry: its date, where it stands, and a way into the
 *  project. (Script entries keep their own editable window.) */
export function ProjectEntryModal({ event, onClose, projectBase }: { event: CalendarEvent; onClose: () => void; projectBase: string }) {
  return (
    <div className="ds-cal-veil" onClick={onClose}>
      <div className="ds-cal-sheet max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-4 flex items-start gap-3">
          <span aria-hidden className="ds-dot mt-2.5" style={{ '--sd-d': calStatus(event).colors[0], '--sh-d': calStatus(event).colors[0] + '26', '--sd-l': calStatus(event).colors[1], '--sh-l': calStatus(event).colors[1] + '26', width: 8, height: 8, borderRadius: 999, flex: 'none' } as React.CSSProperties} />
          <h2 className="text-lg font-heading font-semibold min-w-0 break-words">{calName(event)}</h2>
        </div>
        <div className="px-6 pb-4 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Status</span>
            <span>{calStatus(event).label}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Date</span>
            <span>{format(parseISO(event.date), 'd MMMM yyyy')}</span>
          </div>
          {event.due_date && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Due</span>
              <span>{format(parseISO(event.due_date), 'd MMMM yyyy')}</span>
            </div>
          )}
          {event.type === 'project_created' && (
            <div className="flex items-center justify-between gap-3 min-h-[44px]">
              <span className="text-muted-foreground">Posted</span>
              <PostedToggle event={event} />
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          <button onClick={onClose} className="min-h-[44px] px-4 text-sm text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted">Close</button>
          {event.project_id && (
            <Link to={`${projectBase}/${event.project_id}`} className="min-h-[44px] px-5 inline-flex items-center rounded-xl bg-primary text-white text-sm font-semibold hover:brightness-110">
              Open project
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
