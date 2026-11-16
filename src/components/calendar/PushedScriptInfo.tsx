import { Link } from 'react-router-dom'
import { Ms } from '@/components/ds'
import type { CalendarEvent } from '@/types'

/** A calendar entry pushed from Scripts: its editor notes, apart from the
 *  script, and a link back to the script (`scriptsBase` null = no link,
 *  e.g. editors, who don't have Scripts). Staff only: the API never sends
 *  these fields to clients. */
export function PushedScriptInfo({ event, scriptsBase }: { event: CalendarEvent; scriptsBase: string | null }) {
  const clientId = event.assigned_client_ids?.[0]
  if (!event.editor_notes && !event.script_id) return null
  return (
    <div className="space-y-3">
      {event.editor_notes && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Editor notes</p>
          <p className="text-sm rounded-xl px-3 py-2 whitespace-pre-wrap" style={{ background: 'var(--panel)', boxShadow: 'inset 0 0 0 1px var(--panel-ring)', color: 'var(--text)' }}>{event.editor_notes}</p>
        </div>
      )}
      {event.script_id && clientId && scriptsBase && (
        <Link to={`${scriptsBase}/${clientId}?script=${event.script_id}`} className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--strong)' }}>
          <Ms name="edit_note" style={{ fontSize: 18, width: 18, color: 'inherit' }} />Open script
        </Link>
      )}
    </div>
  )
}
