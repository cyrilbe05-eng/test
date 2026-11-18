import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'

// App-wide on/off switches (admin Settings page). Anything unknown = OFF.
export interface AppSettings { batchUpload: boolean }

export function useAppSettings() {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => apiFetch<AppSettings>('/api/settings'),
    staleTime: 60_000,
  })
}

export function useSetAppSettings() {
  const apiFetch = useApiFetch()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AppSettings) => apiFetch<AppSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: (d) => qc.setQueryData(['settings'], d),
  })
}

/** Where "New video" goes: the 3-choice page when Batch upload is on,
 *  otherwise straight to today's upload page. */
export function useNewVideoPath(): string {
  const { data } = useAppSettings()
  return data?.batchUpload ? '/workspace/start' : '/workspace/new'
}
