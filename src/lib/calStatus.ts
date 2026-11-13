import type { CalendarEvent } from '@/types'

// Calendar status of an entry (DESIGN.md §6 Calendar): the dot shows it, so
// titles never repeat it. Colours are [dark, light].
//  - Hand-made posts: their content status (Idea / Drafting / Scheduled).
//  - Project entries: the stage the server writes after " — " in the title
//    (Waiting / Editing / In review / Approved / Posted / Late).

export type CalStatus = { key: string; label: string; colors: [string, string] }

export const CAL_STATUSES: Record<string, CalStatus> = {
  idea:      { key: 'idea',      label: 'Idea',      colors: ['#C3A8F2', '#8A62D0'] },
  drafting:  { key: 'drafting',  label: 'Drafting',  colors: ['#F2B35B', '#C7811A'] },
  created:   { key: 'created',   label: 'Created',   colors: ['#9A9AA2', '#8E8E96'] },
  review:    { key: 'review',    label: 'In review', colors: ['#E89AC0', '#C2578A'] },
  approved:  { key: 'approved',  label: 'Approved',  colors: ['#6CCB86', '#2E9E5B'] },
  scheduled: { key: 'scheduled', label: 'Scheduled', colors: ['#4CC9A6', '#1F9C7C'] },
  late:      { key: 'late',      label: 'Late',      colors: ['#F2766B', '#E5584B'] },
}

/** Project stages, in the order a video moves through them (for the legend). */
export const PROJECT_STAGES: { stage: string; status: CalStatus }[] = [
  { stage: 'Waiting', status: CAL_STATUSES.created },
  { stage: 'Editing', status: CAL_STATUSES.drafting },
  { stage: 'In review', status: CAL_STATUSES.review },
  { stage: 'Approved', status: CAL_STATUSES.approved },
  { stage: 'Posted', status: CAL_STATUSES.scheduled },
  { stage: 'Late', status: CAL_STATUSES.late },
]

// Project entries keep their own stage name ("Editing"), with the matching colour.
const BY_STAGE: Record<string, CalStatus> = Object.fromEntries(PROJECT_STAGES.map((s) => [s.stage, { ...s.status, label: s.stage }]))
const BY_CONTENT: Record<string, CalStatus> = { Idea: CAL_STATUSES.idea, Drafting: CAL_STATUSES.drafting, Scheduled: CAL_STATUSES.scheduled }

/** The entry's title without the " — Stage" the server appends. */
export function calTitle(event: Pick<CalendarEvent, 'title'>): string {
  return event.title.split(' — ')[0]
}

/** "Client · Title" on staff calendars, just the title for clients. */
export function calName(event: Pick<CalendarEvent, 'title' | 'client_label'>): string {
  const t = calTitle(event)
  return event.client_label ? `${event.client_label} · ${t}` : t
}

export function calStatus(event: Pick<CalendarEvent, 'title' | 'content_status' | 'posted'>): CalStatus {
  const stage = event.title.split(' — ')[1]
  if (stage && BY_STAGE[stage]) return BY_STAGE[stage]
  if (event.posted) return CAL_STATUSES.scheduled
  return (event.content_status && BY_CONTENT[event.content_status]) || CAL_STATUSES.created
}
