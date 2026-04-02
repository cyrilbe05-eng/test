import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import type { Notification } from '@/types'

export function useNotifications(userId: string | undefined) {
  const queryClient = useQueryClient()
  const apiFetch = useApiFetch()

  const query = useQuery({
    queryKey: ['notifications', userId],
    enabled: !!userId,
    refetchInterval: 30_000, // Poll every 30s (replaces Supabase realtime)
    queryFn: () => apiFetch<Notification[]>('/api/notifications'),
  })

  const markRead = async (id: string) => {
    await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' })
    queryClient.invalidateQueries({ queryKey: ['notifications', userId] })
  }

  const markAllRead = async () => {
    if (!userId) return
    await apiFetch('/api/notifications/mark-all-read', { method: 'POST' })
    queryClient.invalidateQueries({ queryKey: ['notifications', userId] })
  }

  const unreadCount = (query.data ?? []).filter((n) => !n.read).length

  return { notifications: query.data ?? [], unreadCount, markRead, markAllRead, isLoading: query.isLoading }
}
