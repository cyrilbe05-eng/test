import type { ScriptStatus, ScriptType } from '@/types/scripts'

export const SCRIPT_TYPES: ScriptType[] = ['Reel', 'Carousel', 'Story', 'Post']

// Status names and dot colours ([dark, light]) for the Scripts workspace.
export const SCRIPT_STATUS: Record<ScriptStatus, { label: string; colors: [string, string] }> = {
  draft:         { label: 'Draft',         colors: ['#9A9AA2', '#8E8E96'] },
  in_review:     { label: 'In review',     colors: ['#F2B35B', '#E09A2D'] },
  needs_changes: { label: 'Needs changes', colors: ['#F2766B', '#E5584B'] },
  approved:      { label: 'Approved',      colors: ['#6CCB86', '#2E9E5B'] },
  scheduled:     { label: 'Scheduled',     colors: ['#ECECEF', '#1A1A1E'] },
}
