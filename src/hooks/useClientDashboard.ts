import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'

export type DashboardOwner = 'pingu' | 'client' | 'both'

export interface ClientDashboard {
  name: string
  contract: { number: number; package: string; start_date: string; end_date: string; day: number; total_days: number; days_left: number; progress: number } | null
  needs: (
    | { type: 'plan_step'; id: string; title: string; date: string; days_late: number }
    | { type: 'review'; project_id: string; title: string }
    | { type: 'footage'; project_id: string; title: string }
  )[]
  plan: { id: string; date: string; title: string; owner: DashboardOwner; done: boolean; state: string; can_tick: boolean }[]
  style: string[]
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
