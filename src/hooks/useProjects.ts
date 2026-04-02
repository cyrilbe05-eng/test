import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import type { Project, ProjectFile, ProjectAssignment, TimelineComment } from '@/types'

export function useProjects() {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['projects'],
    queryFn: () =>
      apiFetch<(Project & { profiles: { full_name: string; email: string; avatar_url: string | null } })[]>(
        '/api/projects'
      ),
  })
}

export function useProject(id: string | undefined) {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['project', id],
    enabled: !!id,
    queryFn: () =>
      apiFetch<Project & { profiles: { full_name: string; email: string; avatar_url: string | null; plan_id: string | null } }>(
        `/api/projects/${id}`
      ),
  })
}

export function useProjectFiles(projectId: string | undefined) {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['project_files', projectId],
    enabled: !!projectId,
    queryFn: () =>
      apiFetch<(ProjectFile & { profiles: { full_name: string } })[]>(
        `/api/project-files/project/${projectId}`
      ),
  })
}

export function useProjectAssignments(projectId: string | undefined) {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['project_assignments', projectId],
    enabled: !!projectId,
    queryFn: () =>
      apiFetch<(ProjectAssignment & { profiles: { id: string; full_name: string; email: string; avatar_url: string | null } })[]>(
        `/api/project-assignments/${projectId}`
      ),
  })
}

export function useTimelineComments(projectId: string | undefined) {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['timeline_comments', projectId],
    enabled: !!projectId,
    queryFn: () =>
      apiFetch<(TimelineComment & { profiles: { full_name: string; avatar_url: string | null } })[]>(
        `/api/timeline-comments/${projectId}`
      ),
  })
}

export function useUpdateProjectStatus() {
  const qc = useQueryClient()
  const apiFetch = useApiFetch()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Project['status'] }) =>
      apiFetch(`/api/projects/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['project'] })
    },
  })
}
