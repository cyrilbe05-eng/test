import { useQuery } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import { InstagramLinks } from '@/components/care/Instagram'

/** The client's Instagram accounts on a project page (admins + editors).
 *  Renders nothing while loading, on any error, or when none are linked —
 *  so it can never disturb the page it sits on. */
export function ProjectInstagram({ projectId }: { projectId: string }) {
  const apiFetch = useApiFetch()
  const { data } = useQuery({
    queryKey: ['instagram', 'project', projectId],
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: () => apiFetch<{ handles: string[] }>(`/api/instagram/project/${projectId}`),
  })
  if (!data?.handles.length) return null
  return <InstagramLinks handles={data.handles} size="sm" />
}
