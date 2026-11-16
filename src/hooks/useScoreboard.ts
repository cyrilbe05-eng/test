import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import type { Scoreboard } from '@/types/scoreboard'

/** The leaderboard for a month ("" = the current month). */
export function useScoreboard(month: string) {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['scoreboard', month],
    retry: false,
    // Switching month keeps the current board until the next one arrives.
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
    queryFn: () => apiFetch<Scoreboard>(`/api/scoreboard${month ? `?month=${month}` : ''}`),
  })
}

/** Admin edits: client settings, video adjustments, the month's bonus. */
export function useScoreboardActions() {
  const apiFetch = useApiFetch()
  const qc = useQueryClient()
  const done = { onSuccess: () => qc.invalidateQueries({ queryKey: ['scoreboard'] }) }
  const send = (path: string, method: 'PUT' | 'DELETE', body?: unknown) =>
    apiFetch<{ ok: true }>(`/api/scoreboard/${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) })
  return {
    saveClient: useMutation({ mutationFn: ({ clientId, coefficient, timeTargetHours }: { clientId: string; coefficient: number; timeTargetHours: number }) => send(`clients/${clientId}`, 'PUT', { coefficient, timeTargetHours }), ...done }),
    resetClient: useMutation({ mutationFn: (clientId: string) => send(`clients/${clientId}`, 'DELETE'), ...done }),
    saveAdjustment: useMutation({ mutationFn: ({ projectId, amount, reason }: { projectId: string; amount: number; reason: string }) => send(`adjustments/${projectId}`, 'PUT', { amount, reason }), ...done }),
    removeAdjustment: useMutation({ mutationFn: (projectId: string) => send(`adjustments/${projectId}`, 'DELETE'), ...done }),
    saveBonus: useMutation({ mutationFn: ({ month, amount }: { month: string; amount: number }) => send(`bonus/${month}`, 'PUT', { amount }), ...done }),
    removeBonus: useMutation({ mutationFn: (month: string) => send(`bonus/${month}`, 'DELETE'), ...done }),
    saveRulebook: useMutation({ mutationFn: (url: string) => send('rulebook', 'PUT', { url }), ...done }),
    removeRulebook: useMutation({ mutationFn: () => send('rulebook', 'DELETE'), ...done }),
  }
}
