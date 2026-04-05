import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import type { CalendarEvent, CalendarEventComment } from '@/types'

export function useCalendarEvents(from?: string, to?: string) {
  const apiFetch = useApiFetch()
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to)   params.set('to', to)
  const qs = params.toString()
  return useQuery({
    queryKey: ['calendar_events', from, to],
    queryFn: () =>
      apiFetch<CalendarEvent[]>(`/api/calendar${qs ? `?${qs}` : ''}`),
  })
}

export type CreateCalendarEventBody = {
  title: string
  date: string
  color?: string
  content_type?: string | null
  content_status?: string | null
  comments?: string | null
  double_down?: boolean
  inspiration_url?: string | null
  script?: string | null
  caption?: string | null
  assigned_client_ids?: string[]
  assigned_team_ids?: string[]
}

export type UpdateCalendarEventBody = {
  id: string
  title?: string
  date?: string
  color?: string
  content_type?: string | null
  content_status?: string | null
  comments?: string | null
  double_down?: boolean
  inspiration_url?: string | null
  script?: string | null
  caption?: string | null
  assigned_client_ids?: string[]
  assigned_team_ids?: string[]
}

export function useCreateCalendarEvent() {
  const qc = useQueryClient()
  const apiFetch = useApiFetch()
  return useMutation({
    mutationFn: (body: CreateCalendarEventBody) =>
      apiFetch<CalendarEvent>('/api/calendar/events', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar_events'] })
    },
  })
}

export function useUpdateCalendarEvent() {
  const qc = useQueryClient()
  const apiFetch = useApiFetch()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateCalendarEventBody) =>
      apiFetch<CalendarEvent>(`/api/calendar/events/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar_events'] })
    },
  })
}

export function useDeleteCalendarEvent() {
  const qc = useQueryClient()
  const apiFetch = useApiFetch()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/calendar/events/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar_events'] })
    },
  })
}

export function useEventComments(eventId: string | null) {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['calendar_event_comments', eventId],
    queryFn: () => apiFetch<CalendarEventComment[]>(`/api/calendar/events/${eventId}/comments`),
    enabled: !!eventId,
  })
}

export function useAddEventComment(eventId: string) {
  const qc = useQueryClient()
  const apiFetch = useApiFetch()
  return useMutation({
    mutationFn: (text: string) =>
      apiFetch<CalendarEventComment>(`/api/calendar/events/${eventId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar_event_comments', eventId] })
    },
  })
}

export function useDeleteEventComment(eventId: string) {
  const qc = useQueryClient()
  const apiFetch = useApiFetch()
  return useMutation({
    mutationFn: (commentId: string) =>
      apiFetch(`/api/calendar/events/${eventId}/comments/${commentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar_event_comments', eventId] })
    },
  })
}
