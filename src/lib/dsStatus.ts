import type { ProjectStatus } from '@/types'

// Status names and colours of the design system (DESIGN.md §3).
// [dark, light]. "In review" shares Admin approved's column and colour.

export const STATUS_META: Record<ProjectStatus, { label: string; colors: [string, string] }> = {
  pending_assignment: { label: 'Pending assignment', colors: ['#9A9AA2', '#8E8E96'] },
  in_progress:        { label: 'In progress',        colors: ['#F2B35B', '#E09A2D'] },
  in_review:          { label: 'In review',          colors: ['#6CCB86', '#2E9E5B'] },
  admin_approved:     { label: 'Admin approved',     colors: ['#6CCB86', '#2E9E5B'] },
  client_reviewing:   { label: 'Client reviewing',   colors: ['#E89AC0', '#C2578A'] },
  revision_requested: { label: 'Revision requested', colors: ['#F2766B', '#E5584B'] },
  client_approved:    { label: 'Client approved',    colors: ['#6FD3A2', '#1F8A57'] },
}

export const statusLabel = (s: ProjectStatus) => (STATUS_META[s] ?? { label: s }).label
