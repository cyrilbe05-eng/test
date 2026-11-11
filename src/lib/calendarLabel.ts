import type { CalendarEvent } from '@/types'

/** What a calendar entry shows: "Client · Title" on staff calendars (the
 *  server sends client_label there), just the title for clients. */
export function calendarLabel(event: Pick<CalendarEvent, 'title' | 'client_label'>): string {
  return event.client_label ? `${event.client_label} · ${event.title}` : event.title
}
