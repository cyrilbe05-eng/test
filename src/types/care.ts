// Response shapes of the admin-only Client Care API (api/_helpers/care/).
// The pages only display these — every rule is computed server-side.

export type Health = 'at_risk' | 'needs_attention' | 'healthy'
export type RenewalStatus = 'not_discussed' | 'discussed' | 'renewed' | 'declined'

export interface HealthCard {
  client_id: string
  name: string
  instagram: string[]
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
  text_today: { client_id: string; name: string; last_contact_at: string | null; health: Health; reasons: string[] }[]
  health_board: Record<Health, HealthCard[]>
  output_rate: {
    agency: OutputRate
    per_client: (OutputRate & { client_id: string; name: string })[]
  }
  renewals: { client_id: string; name: string; contract_end: string; contract_number: number | null; days_left: number | null; renewal_status: RenewalStatus }[]
}

export type ContractPackage = 'editing_only' | 'full_package'

export interface Contract {
  id: string
  number: number
  start_date: string
  end_date: string
  package: ContractPackage
  videos_included: number | null
  renewal_status: RenewalStatus
  created_at: string
}

export type ContractBody = Partial<Pick<Contract, 'start_date' | 'end_date' | 'package' | 'videos_included' | 'renewal_status'>>

export interface CareFields {
  contract_start: string | null
  contract_end: string | null
  videos_included: number | null
  renewal_status: RenewalStatus
  care_notes: string | null
  miro_url: string | null
}

export type OnboardingStep = 'welcome_sent' | 'call_done' | 'brief_received' | 'first_video_delivered'

export interface ClientStats {
  videos_delivered_this_month: number
  videos_delivered_total: number
  videos_delivered_in_contract: number | null
  videos_included: number | null
  avg_turnaround_days: number | null
  avg_revisions_per_video: number | null
  days_since_last_brief: number | null
  days_since_last_contact: number | null
  days_left_on_contract: number | null
  includes_estimates: boolean
}

export interface ClientVideo {
  id: string
  title: string
  status: string
  created_at: string
  delivered_at: string | null
  delivered_estimated: boolean
  approved_at: string | null
  turnaround_days: number | null
  revisions: number
  on_time: boolean | null
  editors: { id: string; name: string }[]
}

export interface ClientCareDetail {
  client: { id: string; name: string; email: string; phone: string | null; client_id_label: string | null; plan_name: string | null }
  instagram: string[]
  contracts: Contract[]
  current_contract_id: string | null
  copywriters: { id: string; name: string }[]
  available_copywriters: { id: string; name: string }[]
  care: CareFields
  onboarding: Record<OnboardingStep, string | null>
  health: Health
  reasons: string[]
  alerts: { type: string; message: string; project_id?: string }[]
  stats: ClientStats
  output: OutputRate
  last_contact_at: string | null
  contacts: { id: string; contacted_at: string; contacted_by: string | null; contacted_by_name: string | null }[]
  projects: ClientVideo[]
  sop_rules: SopRule[]
  revision_backlog: RevisionEntry[]
  sop_engine: { engine: 'model' | 'words'; note: string | null }
  revision_categories: { key: RevisionCategory; label: string }[]
}

export type RevisionCategory = 'pacing' | 'captions' | 'hook' | 'music' | 'colour' | 'b-roll' | 'branding' | 'other'

export interface SopRule {
  id: string
  category: RevisionCategory
  text: string
  count: number
  first_seen: string
  last_seen: string
}

export interface RevisionEntry {
  id: string
  project_id: string
  project_title: string
  editor_id: string | null
  editor_name: string | null
  category: RevisionCategory
  category_source: 'auto' | 'manual'
  note: string
  created_at: string
  sop_rule_id: string | null
  processed: boolean
  /** The note's tick in the existing revision checklist (null = unknown). */
  resolved: boolean | null
}

export type CarePatchBody = Partial<Pick<CareFields, 'care_notes' | 'miro_url'>> & { onboarding?: Partial<Record<OnboardingStep, string | null>> }
