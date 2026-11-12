import type { Project, ProjectStatus } from '@/types'

// The Projects board's columns, in order.
export const COLUMNS: { statuses: ProjectStatus[]; dropTarget: ProjectStatus; label: string }[] = [
  { statuses: ['pending_assignment'], dropTarget: 'pending_assignment', label: 'Pending assignment' },
  { statuses: ['in_progress'],        dropTarget: 'in_progress',        label: 'In progress' },
  { statuses: ['in_review', 'admin_approved'], dropTarget: 'admin_approved', label: 'Admin approved' },
  { statuses: ['client_reviewing'],   dropTarget: 'client_reviewing',   label: 'Client reviewing' },
  { statuses: ['revision_requested'], dropTarget: 'revision_requested', label: 'Revision requested' },
  { statuses: ['client_approved'],    dropTarget: 'client_approved',    label: 'Client approved' },
]
export const columnLabel = (s: ProjectStatus) => COLUMNS.find((c) => c.statuses.includes(s))?.label ?? s

/** A project row as the admin board receives it. */
export type BoardProject = Project & { profiles?: { full_name: string } | null; assigned_team_names?: string | null }
