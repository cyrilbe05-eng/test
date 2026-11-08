// Response shapes of the admin-only Client Care API (api/_helpers/care/).
// The pages only display these — every rule is computed server-side.

export type Health = 'at_risk' | 'needs_attention' | 'healthy'
export type RenewalStatus = 'not_discussed' | 'discussed' | 'renewed' | 'declined'

export interface HealthCard {
  client_id: string
  name: string
  health: Health
  reasons: string[]
  alerts_count: number
  days_left_on_contract: number | null
  days_since_last_contact: number | null
}

export interface OutputRate {
  window_days: number
  delivered: number
  per_day: number
  per_week: number
  avg_turnaround_days: number | null
  on_time_pct: number | null
  deadlines_met: number
  deadlines_missed: number
}

export interface CareOverview {
  generated_at: string
  text_today: { client_id: string; name: string; health: Health; reasons: string[] }[]
  health_board: Record<Health, HealthCard[]>
  output_rate: {
    agency: OutputRate
    per_client: (OutputRate & { client_id: string; name: string })[]
  }
  renewals: { client_id: string; name: string; contract_end: string; days_left: number | null; renewal_status: RenewalStatus }[]
}
