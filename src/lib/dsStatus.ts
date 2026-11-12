import type { ProjectStatus } from '@/types'

// Status names and colours of the design system (DESIGN.md §3).
// [dark, light]. "In review" shares Admin approved's column and colour.

export const STATUS_META: Record<ProjectStatus, { label: string; colors: [string, string] }> = {
  pending_assignment: { label: 'Pending assignment', colors: ['#9A9AA2', '#8E8E96'] },
  in_progress:        { label: 'In progress',        colors: ['#F2B35B', '#E09A2D'] },
  in_review:          { label: 'In review',          colors: ['#7B8CF7', '#5E72E4'] },
  admin_approved:     { label: 'Admin approved',     colors: ['#7B8CF7', '#5E72E4'] },
  client_reviewing:   { label: 'Client reviewing',   colors: ['#4CC9A6', '#2FAE8B'] },
  revision_requested: { label: 'Revision requested', colors: ['#F2766B', '#E5584B'] },
  client_approved:    { label: 'Client approved',    colors: ['#6FD3A2', '#1F8A57'] },
}

export const statusColor = (s: ProjectStatus, dark: boolean) => (STATUS_META[s] ?? STATUS_META.pending_assignment).colors[dark ? 0 : 1]
export const statusLabel = (s: ProjectStatus) => (STATUS_META[s] ?? { label: s }).label
