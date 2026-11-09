import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'

// Admins: editors' "Request urgent" asks (see api/_helpers/care/urgent.ts).

export type UrgentRequest = {
  id: string; project_id: string; editor_id: string; editor_name: string; project_title: string
  status: 'pending' | 'approved' | 'declined' | 'used'; created_at: string
}

export function useUrgentRequests(enabled: boolean) {
  const apiFetch = useApiFetch()
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['urgent-requests'],
    enabled,
    retry: false,
    queryFn: () => apiFetch<UrgentRequest[]>('/api/admin/urgent-requests'),
  })
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'decline' }) =>
      apiFetch(`/api/admin/urgent-requests/${id}`, { method: 'POST', body: JSON.stringify({ decision }) }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['urgent-requests'] }),
  })
  return Object.assign(query, { decide })
}
