// Production plans (api/_helpers/care/plan-routes.ts).

export type PlanOwner = 'pingu' | 'client' | 'both'
export type AutoRule = 'none' | 'footage_uploaded' | 'all_delivered'
export type StepState = 'done' | 'overdue' | 'next' | 'today' | 'late' | 'upcoming'

export interface PlanStep {
  id: string
  date: string
  title: string
  owner: PlanOwner
  done: boolean
  done_at: string | null
  done_by: string | null
  auto_rule: AutoRule
  sort_order: number
  state: StepState
}

export interface Plan {
  client: { id: string; name: string }
  contract: { id: string; number: number; package: 'editing_only' | 'full_package'; start_date: string; end_date: string; current: boolean }
  items: PlanStep[]
}

export interface PlanListRow {
  client_id: string
  name: string
  contract: { id: string; number: number; package: 'editing_only' | 'full_package' } | null
  steps: number
  done: number
  overdue: number
  next: { title: string; date: string; owner: PlanOwner } | null
}

export type StepBody = Partial<Pick<PlanStep, 'date' | 'title' | 'owner' | 'auto_rule' | 'done'>>
