import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import type { AnswerValue, Brief, ClientOnboarding, FileRef, Question, QuestionBody, TeamOnboarding } from '@/types/onboarding'

const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) })
type AnswerItem = { question_id: string; value: AnswerValue }

// ── Client ──────────────────────────────────────────────────────────────────

export function useClientOnboarding() {
  const apiFetch = useApiFetch()
  return useQuery({ queryKey: ['client', 'onboarding'], queryFn: () => apiFetch<ClientOnboarding>('/api/client/onboarding') })
}

export function useSaveClientOnboarding() {
  const apiFetch = useApiFetch()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { answers?: AnswerItem[]; done?: true }) => apiFetch<ClientOnboarding>('/api/client/onboarding', json('PUT', body)),
    onSuccess: (d) => {
      // The question-by-question screen keeps its own draft, so this never
      // overwrites what they are typing.
      qc.setQueryData<ClientOnboarding>(['client', 'onboarding'], d)
      qc.invalidateQueries({ queryKey: ['client', 'dashboard'] })
    },
  })
}

// ── Team (admins + assigned copywriters) ────────────────────────────────────

export function useTeamOnboarding(clientId: string | null | undefined) {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['onboarding', clientId],
    enabled: !!clientId,
    retry: false,
    queryFn: () => apiFetch<TeamOnboarding>(`/api/team/clients/${clientId}/onboarding`),
  })
}

export function useUpdateTeamOnboarding(clientId: string) {
  const apiFetch = useApiFetch()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { answers?: AnswerItem[]; status?: 'done' | 'not_started' }) =>
      apiFetch<TeamOnboarding>(`/api/team/clients/${clientId}/onboarding`, json('PATCH', body)),
    onSuccess: (d) => {
      qc.setQueryData(['onboarding', clientId], d)
      qc.invalidateQueries({ queryKey: ['care'] })
    },
  })
}

// ── Files (both sides): get a signed URL, then PUT the bytes ────────────────

export function useUploadOnboardingFile(endpoint: string) {
  const apiFetch = useApiFetch()
  return async (questionId: string, file: File, onProgress?: (pct: number) => void): Promise<FileRef> => {
    const { key, name, size, upload_url } = await apiFetch<FileRef & { upload_url: string }>(endpoint,
      json('POST', { question_id: questionId, file_name: file.name, size: file.size, mime_type: file.type }))
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', upload_url)
      if (file.type) xhr.setRequestHeader('Content-Type', file.type)
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)) }
      xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error('Upload failed')))
      xhr.onerror = () => reject(new Error('Upload failed'))
      xhr.send(file)
    })
    return { key, name, size }
  }
}

// ── Admin: questions ────────────────────────────────────────────────────────

export function useOnboardingQuestions() {
  const apiFetch = useApiFetch()
  return useQuery({ queryKey: ['onboarding-questions'], queryFn: () => apiFetch<Question[]>('/api/admin/onboarding-questions') })
}

export function useQuestionActions() {
  const apiFetch = useApiFetch()
  const qc = useQueryClient()
  const store = { onSuccess: (d: Question[]) => qc.setQueryData(['onboarding-questions'], d) }
  const base = '/api/admin/onboarding-questions'
  return {
    create: useMutation({ mutationFn: (b: QuestionBody) => apiFetch<Question[]>(base, json('POST', b)), ...store }),
    update: useMutation({ mutationFn: ({ id, ...b }: QuestionBody & { id: string }) => apiFetch<Question[]>(`${base}/${id}`, json('PATCH', b)), ...store }),
    reorder: useMutation({ mutationFn: (order: string[]) => apiFetch<Question[]>(base, json('PATCH', { order })), ...store }),
  }
}

// ── Brief (Miro, SOPs, style) for the copywriter's client page ─────────────

export function useClientBrief(clientId: string | null | undefined) {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: ['brief', clientId],
    enabled: !!clientId,
    retry: false,
    queryFn: () => apiFetch<Brief>(`/api/team/clients/${clientId}/brief`),
  })
}
