import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import type { Brief } from '@/types/onboarding'

export type DashboardOwner = 'pingu' | 'client' | 'both'

export interface ClientDashboard extends Brief {
  name: string
  needs_onboarding: boolean
  contract: { number: number; package: string; start_date: string; end_date: string; day: number; total_days: number; days_left: number; progress: number } | null
  needs: (
    | { type: 'plan_step'; id: string; title: string; date: string; days_late: number }
    | { type: 'review'; project_id: string; title: string }
    | { type: 'footage'; project_id: string; title: string }
  )[]
  plan: { id: string; date: string; title: string; owner: DashboardOwner; done: boolean; state: string; can_tick: boolean }[]
  /** Calendar scripts not made into a video yet. */
  scripts?: { id: string; title: string; date: string; script: string | null; caption: string | null; comments: string | null; inspiration_url: string | null }[]
}

export function useClientDashboard() {
  const apiFetch = useApiFetch()
  return useQuery({ queryKey: ['client', 'dashboard'], queryFn: () => apiFetch<ClientDashboard>('/api/client/dashboard') })
}

export function useTickClientStep() {
  const apiFetch = useApiFetch()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      apiFetch<ClientDashboard>(`/api/client/plan-items/${id}/done`, { method: 'POST', body: JSON.stringify({ done }) }),
    onSuccess: (d) => qc.setQueryData(['client', 'dashboard'], d),
  })
}
