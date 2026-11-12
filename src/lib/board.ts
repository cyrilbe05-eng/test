import type { ProjectStatus } from '@/types'

// The Projects board's columns, in order (also the sheet's "Step n of 6").
export const COLUMNS: { statuses: ProjectStatus[]; dropTarget: ProjectStatus; label: string }[] = [
  { statuses: ['pending_assignment'], dropTarget: 'pending_assignment', label: 'Pending assignment' },
  { statuses: ['in_progress'],        dropTarget: 'in_progress',        label: 'In progress' },
  { statuses: ['in_review', 'admin_approved'], dropTarget: 'admin_approved', label: 'Admin approved' },
  { statuses: ['client_reviewing'],   dropTarget: 'client_reviewing',   label: 'Client reviewing' },
  { statuses: ['revision_requested'], dropTarget: 'revision_requested', label: 'Revision requested' },
  { statuses: ['client_approved'],    dropTarget: 'client_approved',    label: 'Client approved' },
]
export const STEPS = COLUMNS.map((c) => c.statuses)
export const columnLabel = (s: ProjectStatus) => COLUMNS.find((c) => c.statuses.includes(s))?.label ?? s

export type SheetOrigin = { dx: number; dy: number; s: number }

/** Where the project sheet grows from: the clicked element's centre and width. */
export function originFrom(el: Element): SheetOrigin {
  const r = el.getBoundingClientRect()
  const vw = window.innerWidth, vh = window.innerHeight, w = Math.min(560, vw - 32)
  return { dx: Math.round(r.left + r.width / 2 - vw / 2), dy: Math.round(r.top + r.height / 2 - vh / 2), s: +(r.width / w).toFixed(3) }
}
