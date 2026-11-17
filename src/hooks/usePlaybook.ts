import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import type { PlaybookOverview, PlaybookViewer } from '@/types/playbook'

export function usePlaybook() {
  const apiFetch = useApiFetch()
  return useQuery({ queryKey: ['playbook'], retry: false, queryFn: () => apiFetch<PlaybookOverview>('/api/playbook') })
}

export function usePlaybookViews(videoId: string | null) {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['playbook', 'views', videoId],
    enabled: !!videoId,
    queryFn: () => apiFetch<PlaybookViewer[]>(`/api/playbook/videos/${videoId}/views`),
  })
}

type Upload = { key: string; fileName: string; fileSize: number; mimeType: string }

/** Admin edits. Every call answers with the whole Playbook, kept as the cache. */
export function usePlaybookActions() {
  const apiFetch = useApiFetch()
  const qc = useQueryClient()
  const set = (o: PlaybookOverview) => qc.setQueryData(['playbook'], o)
  const send = (path: string, method: string, body?: unknown) =>
    apiFetch<PlaybookOverview>(`/api/playbook/${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) })
  const useEdit = <V,>(fn: (v: V) => Promise<PlaybookOverview>) => useMutation({ mutationFn: fn, onSuccess: set })
  return {
    addSection: useEdit((title: string) => send('sections', 'POST', { title })),
    updateSection: useEdit(({ id, ...b }: { id: string; title?: string; audience?: 'all' | 'selected'; clientIds?: string[] }) => send(`sections/${id}`, 'PATCH', b)),
    deleteSection: useEdit((id: string) => send(`sections/${id}`, 'DELETE')),
    orderSections: useEdit((ids: string[]) => send('sections/order', 'PUT', { ids })),
    addVideo: useEdit(({ sectionId, ...b }: { sectionId: string; title: string; description?: string; link?: string; upload?: Upload; thumbnailKey?: string | null }) => send(`sections/${sectionId}/videos`, 'POST', b)),
    orderVideos: useEdit(({ sectionId, ids }: { sectionId: string; ids: string[] }) => send(`sections/${sectionId}/videos/order`, 'PUT', { ids })),
    updateVideo: useEdit(({ id, ...b }: { id: string; title?: string; description?: string; status?: 'draft' | 'published'; sectionId?: string; link?: string; upload?: Upload; thumbnailKey?: string | null }) => send(`videos/${id}`, 'PATCH', b)),
    deleteVideo: useEdit((id: string) => send(`videos/${id}`, 'DELETE')),
    addAttachment: useEdit(({ videoId, ...b }: { videoId: string; kind: 'link' | 'file'; title?: string; url?: string; key?: string; fileName?: string; fileSize?: number; mimeType?: string }) => send(`videos/${videoId}/attachments`, 'POST', b)),
    deleteAttachment: useEdit((id: string) => send(`attachments/${id}`, 'DELETE')),
  }
}
