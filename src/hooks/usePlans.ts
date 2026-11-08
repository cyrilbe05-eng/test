import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import type { Plan, PlanListRow, StepBody } from '@/types/plans'

export function useTeamPlans() {
  const apiFetch = useApiFetch()
  return useQuery({ queryKey: ['plans', 'list'], retry: false, queryFn: () => apiFetch<PlanListRow[]>('/api/team/plans') })
}

export function usePlan(contractId: string | null | undefined) {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['plans', 'contract', contractId],
    enabled: !!contractId,
    retry: false,
    queryFn: () => apiFetch<Plan>(`/api/team/plans/${contractId}`),
  })
}

/** Every plan write returns the fresh plan: store it and refresh the lists
 *  and Client Care (overdue client steps are Client Care alerts). */
function usePlanWrite<V>(request: (v: V) => Promise<Plan>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: (plan) => {
      qc.setQueryData(['plans', 'contract', plan.contract.id], plan)
      qc.invalidateQueries({ queryKey: ['plans', 'list'] })
      qc.invalidateQueries({ queryKey: ['care'] })
    },
  })
}

export function usePlanActions(contractId: string) {
  const apiFetch = useApiFetch()
  const base = `/api/team/plans/${contractId}`
  const json = (method: string, body?: unknown) => ({ method, body: body === undefined ? undefined : JSON.stringify(body) })
  return {
    fromTemplate: usePlanWrite((startDate: string) => apiFetch<Plan>(`${base}/from-template`, json('POST', { start_date: startDate }))),
    add: usePlanWrite((body: StepBody) => apiFetch<Plan>(`${base}/items`, json('POST', body))),
    update: usePlanWrite(({ id, body }: { id: string; body: StepBody }) => apiFetch<Plan>(`/api/team/plans/items/${id}`, json('PATCH', body))),
    remove: usePlanWrite((id: string) => apiFetch<Plan>(`/api/team/plans/items/${id}`, json('DELETE'))),
    reorder: usePlanWrite((ids: string[]) => apiFetch<Plan>(`${base}/reorder`, json('POST', { ids }))),
  }
}
