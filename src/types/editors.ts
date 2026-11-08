// Response of GET /api/admin/editors/performance (admin-only).
import type { RevisionCategory } from '@/types/care'

export type PerformancePeriod = '30' | '90' | '365' | 'all'

export interface PerfStats {
  videos: number
  revisions_per_video: number | null
  avg_turnaround_days: number | null
  on_time_pct: number | null
  deadlines_met: number
  deadlines_missed: number
  revision_notes: number
  top_categories: { category: RevisionCategory; count: number; share: number }[]
}

export interface EditorPerformance {
  generated_at: string
  period: PerformancePeriod
  categories: { key: RevisionCategory; label: string }[]
  editors: {
    editor_id: string
    name: string
    team_role: string
    disabled: boolean
    totals: PerfStats
    clients: (PerfStats & { client_id: string; name: string })[]
  }[]
}
