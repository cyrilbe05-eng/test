import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import type { Script, ScriptComment, ScriptField, ScriptPage, ScriptsOverview, ScriptStatus, ScriptType } from '@/types/scripts'

// Scripts workspace data. A page refreshes every 20s so the other person's
// saved changes show up; editors only take them in while not typing.

export function useScriptsOverview() {
  const apiFetch = useApiFetch()
  return useQuery({ queryKey: ['scripts'], queryFn: () => apiFetch<ScriptsOverview>('/api/scripts'), refetchInterval: 30_000 })
}

export function useScriptPage(clientId: string | undefined) {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['scripts', 'page', clientId],
    enabled: !!clientId,
    retry: false,
    refetchInterval: 20_000,
    queryFn: () => apiFetch<ScriptPage>(`/api/scripts/pages/${clientId}`),
  })
}

export type SaveResult = { ok: true; script: Script } | { ok: false; latest: Script }

export function useScriptActions(clientId: string) {
  const apiFetch = useApiFetch()
  const qc = useQueryClient()
  const key = ['scripts', 'page', clientId]
  const setPage = (p: ScriptPage) => qc.setQueryData(key, p)
  // Put one updated script back into the cached page (no full reload, so
  // open editors aren't disturbed).
  const putScript = (s: Script) => qc.setQueryData<ScriptPage>(key, (p) => p && ({
    ...p, groups: p.groups.map((g) => ({ ...g, scripts: g.scripts.map((x) => (x.id === s.id ? s : x)) })),
  }))
  const putComments = (scriptId: string, list: ScriptComment[]) => qc.setQueryData<ScriptPage>(key, (p) => p && ({
    ...p, comments: [...p.comments.filter((c) => c.scriptId !== scriptId), ...list],
  }))
  const send = <T,>(path: string, method: string, body?: unknown) =>
    apiFetch<T>(`/api/scripts/${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) })
  const refreshList = () => qc.invalidateQueries({ queryKey: ['scripts'], exact: true })

  return {
    putScript,
    addGroup: useMutation({ mutationFn: (name: string) => send<ScriptPage>(`pages/${clientId}/groups`, 'POST', { name }), onSuccess: setPage }),
    renameGroup: useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => send<ScriptPage>(`groups/${id}`, 'PATCH', { name }), onSuccess: setPage }),
    deleteGroup: useMutation({ mutationFn: (id: string) => send<ScriptPage>(`groups/${id}`, 'DELETE'), onSuccess: (p) => { setPage(p); refreshList() } }),
    moveGroup: useMutation({ mutationFn: ({ id, direction }: { id: string; direction: 'up' | 'down' }) => send<ScriptPage>(`groups/${id}/move`, 'POST', { direction }), onSuccess: setPage }),
    addScript: useMutation({ mutationFn: ({ groupId, title, type }: { groupId: string; title: string; type: ScriptType }) => send<ScriptPage>(`groups/${groupId}/scripts`, 'POST', { title, type }), onSuccess: (p) => { setPage(p); refreshList() } }),
    updateScript: useMutation({ mutationFn: ({ id, ...b }: { id: string; title?: string; type?: ScriptType; links?: string[] }) => send<Script>(`script/${id}`, 'PATCH', b), onSuccess: putScript }),
    moveScript: useMutation({ mutationFn: ({ id, direction }: { id: string; direction: 'up' | 'down' }) => send<ScriptPage>(`script/${id}/move`, 'POST', { direction }), onSuccess: setPage }),
    deleteScript: useMutation({ mutationFn: (id: string) => send<ScriptPage>(`script/${id}`, 'DELETE'), onSuccess: (p) => { setPage(p); refreshList() } }),
    setStatus: useMutation({ mutationFn: ({ id, status }: { id: string; status: ScriptStatus }) => send<Script>(`script/${id}/status`, 'POST', { status }), onSuccess: (s) => { putScript(s); refreshList() } }),
    /** Autosave one field. A 409 means someone saved since: hand back theirs. */
    saveContent: async (id: string, field: ScriptField, value: { html?: string; slides?: string[] }, baseVersion: number, force = false): Promise<SaveResult> => {
      try {
        const s = await send<Script>(`script/${id}/content`, 'PUT', { field, ...value, baseVersion, force })
        putScript(s)
        return { ok: true, script: s }
      } catch (e) {
        const err = e as Error & { status?: number }
        if (err.status === 409) {
          // The 409 body carries the latest script; fetch the page to get it.
          const page = await qc.fetchQuery({ queryKey: key, queryFn: () => apiFetch<ScriptPage>(`/api/scripts/pages/${clientId}`), staleTime: 0 })
          const latest = page.groups.flatMap((g) => g.scripts).find((x) => x.id === id)
          if (latest) return { ok: false, latest }
        }
        throw e
      }
    },
    addComment: useMutation({
      mutationFn: ({ scriptId, ...b }: { scriptId: string; id?: string; field: ScriptField; quote?: string; body: string; parentId?: string }) =>
        send<ScriptComment[]>(`script/${scriptId}/comments`, 'POST', b),
      onSuccess: (list, v) => putComments(v.scriptId, list),
    }),
    resolveComment: useMutation({
      mutationFn: ({ id, resolved }: { id: string; scriptId: string; resolved: boolean }) => send<ScriptComment[]>(`comments/${id}`, 'PATCH', { resolved }),
      onSuccess: (list, v) => putComments(v.scriptId, list),
    }),
    deleteComment: useMutation({
      mutationFn: ({ id }: { id: string; scriptId: string }) => send<ScriptComment[]>(`comments/${id}`, 'DELETE'),
      onSuccess: (list, v) => putComments(v.scriptId, list),
    }),
    push: useMutation({
      mutationFn: ({ id, date, type }: { id: string; date: string; type: ScriptType }) => send<{ script: Script; calendarEventId: string }>(`script/${id}/push`, 'POST', { date, type }),
      onSuccess: (r) => { putScript(r.script); refreshList(); qc.invalidateQueries({ queryKey: ['calendar_events'] }) },
    }),
  }
}
