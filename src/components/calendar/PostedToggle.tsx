import { useState } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useUpdateCalendarEvent } from '@/hooks/useCalendar'
import { cn } from '@/lib/utils'
import type { CalendarEvent } from '@/types'

/** "Posted" control for a calendar entry — the terminal state, shown grey.
 *
 *  Handles BOTH kinds of entry, which is the whole point of it being shared:
 *   - manual planning entries → flag stored on the entry (migration 008)
 *   - entries generated from a project → flag stored on the project itself
 *     (migration 009), because those entries aren't rows and can't hold one.
 *
 *  Renders nothing when the viewer can't mark this entry, so no one is shown
 *  a button that would 403. */
export function PostedToggle({ event }: { event: CalendarEvent }) {
  const { profile } = useAuth()
  const apiFetch = useApiFetch()
  const qc = useQueryClient()
  const updateEvent = useUpdateCalendarEvent()
  const [posted, setPosted] = useState(event.posted ?? false)
  const [saving, setSaving] = useState(false)

  const isManual = event.type === 'manual'
  const isProjectEntry = event.type === 'project_created' && !!event.project_id
  const role = profile?.role

  const canMark = isManual
    ? role === 'admin'
      || event.owner_id === profile?.id
      || (event.assigned_client_ids ?? []).includes(profile?.id ?? '')
    // A client only ever sees their own projects, so any project entry they
    // can open is theirs to mark.
    : isProjectEntry && (role === 'admin' || role === 'client')

  if (!canMark) return null

  const toggle = async () => {
    const next = !posted
    setPosted(next)
    setSaving(true)
    try {
      if (isManual) {
        await updateEvent.mutateAsync({ id: event.id, posted: next })
      } else {
        await apiFetch(`/api/projects/${event.project_id}/posted`, {
          method: 'POST',
          body: JSON.stringify({ posted: next }),
        })
        qc.invalidateQueries({ queryKey: ['calendar_events'] })
        qc.invalidateQueries({ queryKey: ['projects'] })
      }
      toast.success(next ? 'Marked as posted' : 'Posted mark removed')
    } catch (e: any) {
      setPosted(!next)
      toast.error(e?.message ?? 'Could not update')
    } finally {
      setSaving(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      title="Mark once this piece is actually published"
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all disabled:opacity-50',
        posted
          ? 'bg-gray-400 text-white border-gray-400'
          : 'bg-muted text-muted-foreground border-border hover:border-gray-400 hover:text-foreground',
      )}
    >
      {posted ? '✓ Posted' : 'Mark as posted'}
    </button>
  )
}
