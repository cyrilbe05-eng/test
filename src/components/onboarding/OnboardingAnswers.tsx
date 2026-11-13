import { useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { AnswerInput } from '@/components/onboarding/AnswerInput'
import { useTeamOnboarding, useUpdateTeamOnboarding, useUploadOnboardingFile } from '@/hooks/useOnboarding'
import { cn } from '@/lib/utils'
import type { AnswerValue, FileRef, TeamOnboarding } from '@/types/onboarding'

// A client's onboarding answers, by section (Client Care tab + copywriter
// page). Admins and assigned copywriters can edit; admins also mark it done
// or send the client through it again.

type Q = TeamOnboarding['sections'][number]['questions'][number]
const btn = 'min-h-[44px] px-3 rounded-lg border border-border text-sm hover:bg-muted disabled:opacity-50'
const errMsg = (e: unknown) => (e as Error)?.message ?? 'Something went wrong'

/** Read-only answer: text, clickable links, downloadable files. */
export function Answer({ q }: { q: Pick<Q, 'type' | 'value'> }) {
  const v = q.value
  if (v == null || (Array.isArray(v) && !v.length)) return <p className="text-sm text-muted-foreground">—</p>
  if (q.type === 'link') {
    return (
      <ul className="space-y-1">
        {(v as string[]).map((l) => <li key={l} className="min-w-0"><a href={l} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline break-all">{l}</a></li>)}
      </ul>
    )
  }
  if (q.type === 'file') {
    return (
      <ul className="space-y-1">
        {(v as FileRef[]).map((f) => <li key={f.key} className="min-w-0"><a href={f.url} className="text-sm text-primary hover:underline break-all">{f.name}</a></li>)}
      </ul>
    )
  }
  return <p className="text-sm whitespace-pre-wrap break-words">{v as string}</p>
}

function Row({ q, clientId }: { q: Q; clientId: string }) {
  const [draft, setDraft] = useState<AnswerValue | undefined>(undefined)
  const update = useUpdateTeamOnboarding(clientId)
  const upload = useUploadOnboardingFile(`/api/team/clients/${clientId}/onboarding/files`)
  const editing = draft !== undefined
  const saveDraft = () => update.mutate({ answers: [{ question_id: q.id, value: draft ?? null }] }, {
    onSuccess: () => setDraft(undefined),
    onError: (e) => toast.error(errMsg(e)),
  })
  return (
    <li className="py-2 flex items-start gap-2">
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-xs text-muted-foreground break-words">
          {q.text}{q.admin_only && <span className="ml-1.5 px-1.5 py-0.5 rounded ds-tag bg-muted text-[10px] font-semibold">Admin</span>}
        </p>
      {editing ? (
        <div className="mt-1.5 space-y-2">
          <AnswerInput q={q} value={draft ?? null} onChange={setDraft} upload={upload} />
          <div className="flex gap-2 justify-end">
            <button className={btn} onClick={() => setDraft(undefined)}>Cancel</button>
            <button className="min-h-[44px] px-4 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50" disabled={update.isPending} onClick={saveDraft}>Save</button>
          </div>
        </div>
      ) : <Answer q={q} />}
      </div>
      {!editing && (
        <button onClick={() => setDraft(q.value)} aria-label="Edit" className="-mr-2 w-11 h-11 rounded-lg flex-shrink-0 text-muted-foreground hover:bg-muted">✎</button>
      )}
    </li>
  )
}

const STATUS: Record<TeamOnboarding['status'], string> = { not_started: 'Not started', in_progress: 'In progress', done: 'Done' }

export function OnboardingAnswers({ clientId, compact }: { clientId: string; compact?: boolean }) {
  const { data, isLoading, error } = useTeamOnboarding(clientId)
  const update = useUpdateTeamOnboarding(clientId)
  if (isLoading) return <div className="flex justify-center py-10"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
  if (error || !data) return <p className="p-4 text-sm">{errMsg(error)}</p>
  const setStatus = (status: 'done' | 'not_started') => update.mutate({ status }, { onError: (e) => toast.error(errMsg(e)) })

  return (
    <div className={cn(compact ? '' : 'space-y-3')}>
      <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', compact ? 'px-4 md:px-5 py-3 border-b border-border/60' : 'clay-card px-4 py-3')}>
        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full ds-tag',
          data.status === 'done' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : data.status === 'in_progress' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-muted text-muted-foreground')}>
          {STATUS[data.status]}
        </span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {data.answered}/{data.total}{data.done_at && ` · ${format(new Date(data.done_at), 'd MMM yyyy')}`}
        </span>
        {data.can_set_status && (
          <span className="ml-auto flex gap-2">
            {data.status !== 'done' && <button className={btn} disabled={update.isPending} onClick={() => setStatus('done')}>Mark done</button>}
            {data.status !== 'not_started' && <button className={btn} disabled={update.isPending} onClick={() => setStatus('not_started')}>Send through</button>}
          </span>
        )}
      </div>
      {data.sections.map((s) => (
        <section key={s.name} className={cn(compact ? 'px-4 md:px-5 py-3 border-b border-border/60' : 'clay-card px-4 py-3')}>
          <h4 className="text-sm font-semibold">{s.name}</h4>
          <ul className="divide-y divide-border/60">
            {s.questions.map((q) => <Row key={q.id} q={q} clientId={clientId} />)}
          </ul>
        </section>
      ))}
    </div>
  )
}
