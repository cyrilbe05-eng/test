import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import type { CareOverview, CarePatchBody, ClientCareDetail, ContractBody, RevisionCategory } from '@/types/care'
import type { EditorPerformance, PerformancePeriod } from '@/types/editors'

export function useEditorPerformance(period: PerformancePeriod) {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['editors', 'performance', period],
    retry: false,
    queryFn: () => apiFetch<EditorPerformance>(`/api/admin/editors/performance?days=${period}`),
  })
}

/** Any range (Analytics period bar): `query` = "from=…&to=…" or "days=all". */
export function useEditorPerformanceRange(query: string) {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['editors', 'performance', query],
    retry: false,
    queryFn: () => apiFetch<EditorPerformance>(`/api/admin/editors/performance?${query}`),
  })
}

export function useCareOverview() {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['care', 'overview'],
    refetchInterval: 60_000,
    retry: false,
    queryFn: () => apiFetch<CareOverview>('/api/admin/care/overview'),
  })
}

export function useCareClient(clientId: string | null) {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['care', 'client', clientId],
    enabled: !!clientId,
    retry: false,
    queryFn: () => apiFetch<ClientCareDetail>(`/api/admin/care/clients/${clientId}`),
  })
}

/** Every care write returns the client's fresh detail: store it, and refresh
 *  the overview (health board / text-today) in the background. */
function useCareWrite<V>(request: (v: V) => Promise<ClientCareDetail>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: (detail) => {
      qc.setQueryData(['care', 'client', detail.client.id], detail)
      qc.invalidateQueries({ queryKey: ['care', 'overview'] })
    },
  })
}

export function useMarkContacted() {
  const apiFetch = useApiFetch()
  return useCareWrite((clientId: string) =>
    apiFetch<ClientCareDetail>(`/api/admin/care/clients/${clientId}/contacted`, { method: 'POST' }))
}

export function useUndoContact() {
  const apiFetch = useApiFetch()
  return useCareWrite((contactId: string) =>
    apiFetch<ClientCareDetail>(`/api/admin/care/contacts/${contactId}`, { method: 'DELETE' }))
}

export function useRecategorize() {
  const apiFetch = useApiFetch()
  return useCareWrite(({ entryId, category }: { entryId: string; category: RevisionCategory }) =>
    apiFetch<ClientCareDetail>(`/api/admin/care/revision-entries/${entryId}`, { method: 'PATCH', body: JSON.stringify({ category }) }))
}

export function useArchiveRule() {
  const apiFetch = useApiFetch()
  return useCareWrite((ruleId: string) =>
    apiFetch<ClientCareDetail>(`/api/admin/care/sop-rules/${ruleId}`, { method: 'DELETE' }))
}

export function useCreateContract() {
  const apiFetch = useApiFetch()
  return useCareWrite(({ clientId, body }: { clientId: string; body: ContractBody }) =>
    apiFetch<ClientCareDetail>(`/api/admin/care/clients/${clientId}/contracts`, { method: 'POST', body: JSON.stringify(body) }))
}

export function useUpdateContract() {
  const apiFetch = useApiFetch()
  return useCareWrite(({ contractId, body }: { contractId: string; body: ContractBody }) =>
    apiFetch<ClientCareDetail>(`/api/admin/care/contracts/${contractId}`, { method: 'PATCH', body: JSON.stringify(body) }))
}

export function useSetCopywriters() {
  const apiFetch = useApiFetch()
  return useCareWrite(({ clientId, ids }: { clientId: string; ids: string[] }) =>
    apiFetch<ClientCareDetail>(`/api/admin/care/clients/${clientId}/team`, { method: 'PUT', body: JSON.stringify({ team_member_ids: ids }) }))
}

export function useSaveInstagram() {
  const apiFetch = useApiFetch()
  return useCareWrite(({ clientId, handles }: { clientId: string; handles: string[] }) =>
    apiFetch<ClientCareDetail>(`/api/admin/care/clients/${clientId}/instagram`, { method: 'PUT', body: JSON.stringify({ handles }) }))
}

export function useUpdateCare() {
  const apiFetch = useApiFetch()
  return useCareWrite(({ clientId, body }: { clientId: string; body: CarePatchBody }) =>
    apiFetch<ClientCareDetail>(`/api/admin/care/clients/${clientId}`, { method: 'PATCH', body: JSON.stringify(body) }))
}
