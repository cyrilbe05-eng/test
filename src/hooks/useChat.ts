import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import type { ChatConnection, ChatGroup, ChatMessage } from '@/types'

export function useConnections() {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['connections'],
    queryFn: () => apiFetch<ChatConnection[]>('/api/messages/connections'),
  })
}

export function useGroups() {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['groups'],
    queryFn: () => apiFetch<ChatGroup[]>('/api/messages/groups'),
  })
}

export function useMessages(conversationId: string | null) {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['messages', conversationId],
    enabled: !!conversationId,
    refetchInterval: 30_000,
    queryFn: () => apiFetch<ChatMessage[]>(`/api/messages/${conversationId}`),
  })
}

export function useSendMessage() {
  const qc = useQueryClient()
  const apiFetch = useApiFetch()
  return useMutation({
    mutationFn: ({ conversationId, text }: { conversationId: string; text: string }) =>
      apiFetch<ChatMessage>(`/api/messages/${conversationId}/send`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['messages', variables.conversationId] })
    },
  })
}

export function useCreateConnection() {
  const qc = useQueryClient()
  const apiFetch = useApiFetch()
  return useMutation({
    mutationFn: (body: { userA: string; userB: string }) =>
      apiFetch<ChatConnection>('/api/messages/connections', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connections'] })
    },
  })
}

export function useDeleteConnection() {
  const qc = useQueryClient()
  const apiFetch = useApiFetch()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/messages/connections/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connections'] })
    },
  })
}

export function useCreateGroup() {
  const qc = useQueryClient()
  const apiFetch = useApiFetch()
  return useMutation({
    mutationFn: (body: { name: string; memberIds: string[] }) =>
      apiFetch<ChatGroup>('/api/messages/groups', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
    },
  })
}

export function useDeleteGroup() {
  const qc = useQueryClient()
  const apiFetch = useApiFetch()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/messages/groups/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
    },
  })
}

export function useUpdateGroup() {
  const qc = useQueryClient()
  const apiFetch = useApiFetch()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; memberIds?: string[] }) =>
      apiFetch<ChatGroup>(`/api/messages/groups/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
    },
  })
}
