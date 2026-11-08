import { useQuery } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import type { CareOverview } from '@/types/care'

export function useCareOverview() {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['care', 'overview'],
    refetchInterval: 60_000,
    retry: false,
    queryFn: () => apiFetch<CareOverview>('/api/admin/care/overview'),
  })
}
