import { Icon } from '@/components/ds'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ClientLayout } from '@/components/workspace/ClientLayout'
import { AnswerInput } from '@/components/onboarding/AnswerInput'
import { Answer } from '@/components/onboarding/OnboardingAnswers'
import { useClientOnboarding, useSaveClientOnboarding, useUploadOnboardingFile } from '@/hooks/useOnboarding'
import type { ClientDashboard } from '@/hooks/useClientDashboard'
import type { AnswerValue, AskedQuestion, ClientOnboarding as Data } from '@/types/onboarding'

// Client "Onboarding" tab. Until it's done: one question at a time, thin
// progress bar, Back / Next, autosave, resume at the first unanswered
// question. Once done: their answers, by section, editable.

function answered(q: AskedQuestion, v: AnswerValue | undefined) {
  if (v == null) return false
  if (Array.isArray(v)) return v.length > 0
  if (q.type === 'choice' && v === 'Other' && q.options.includes('Other')) return false
  return v.trim().length > 0
}

const errMsg = (e: unknown) => (e as Error)?.message ?? 'Something went wrong'
const spinner = <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>

// ── Questions, one at a time ────────────────────────────────────────────────

function Flow({ data }: { data: Data }) {
  const save = useSaveClientOnboarding()
  const upload = useUploadOnboardingFile('/api/client/onboarding/files')
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [values, setValues] = useState<Record<string, AnswerValue>>(() => Object.fromEntries(data.questions.map((q) => [q.id, q.value])))
  const [index, setIndex] = useState(() => {
    const first = data.questions.findIndex((q) => !answered(q, q.value))
    return first === -1 ? Math.max(0, data.questions.length - 1) : first
  })
  const pending = useRef<Map<string, AnswerValue>>(new Map())
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    if (!pending.current.size) return
    const answers = [...pending.current].map(([question_id, value]) => ({ question_id, value }))
    pending.current.clear()
    try { await save.mutateAsync({ answers }) } catch (e) { toast.error(errMsg(e)) }
  }, [save])

  // Save whatever is left when they leave the page.
  useEffect(() => () => { void flush() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const q = data.questions[index]
  const last = index === data.questions.length - 1
  const ok = !q.required || answered(q, values[q.id])

  const change = (v: AnswerValue) => {
    setValues((s) => ({ ...s, [q.id]: v }))
    pending.current.set(q.id, v)
    clearTimeout(timer.current)
    // Files are saved straight away; typing waits for a pause.
    timer.current = setTimeout(() => { void flush() }, q.type === 'file' ? 0 : 700)
  }
  const next = async () => {
    await flush()
    if (!last) { setIndex(index + 1); return }
    try {
      await save.mutateAsync({ done: true })
      // Home must not send them back here while it refreshes.
      qc.setQueryData<ClientDashboard>(['client', 'dashboard'], (d) => (d ? { ...d, needs_onboarding: false } : d))
      navigate('/workspace', { replace: true })
    } catch (e) {
      toast.error(errMsg(e))
      const missing = data.questions.findIndex((x) => x.required && !answered(x, values[x.id]))
      if (missing !== -1) setIndex(missing)
    }
  }
  const back = async () => { await flush(); setIndex(Math.max(0, index - 1)) }

  return (
    <form key={q.id} noValidate className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (ok && !save.isPending) void next() }}>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={data.questions.length} aria-valuenow={index + 1}>
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${((index + 1) / data.questions.length) * 100}%` }} />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{index + 1}/{data.questions.length}</span>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{q.section}</p>
        <h1 className="mt-1.5 text-xl md:text-2xl font-heading font-semibold leading-snug break-words">{q.text}</h1>
      </div>
      <AnswerInput q={q} value={values[q.id] ?? null} onChange={change} upload={upload} big />
      <div className="flex items-center gap-3 pt-2">
        {index > 0 && (
          <button type="button" onClick={back} className="min-h-[48px] px-5 rounded-xl border border-border text-sm font-medium hover:bg-muted">Back</button>
        )}
        <button type="submit" disabled={!ok || save.isPending}
          className="ml-auto min-h-[48px] px-6 rounded-xl bg-primary text-white text-sm font-semibold hover:brightness-110 disabled:opacity-40">
          {last ? 'Finish' : 'Next'}
        </button>
      </div>
    </form>
  )
}

// ── Done: their answers ─────────────────────────────────────────────────────

function DoneRow({ q }: { q: Data['questions'][number] }) {
  const [draft, setDraft] = useState<AnswerValue | undefined>(undefined)
  const save = useSaveClientOnboarding()
  const upload = useUploadOnboardingFile('/api/client/onboarding/files')
  const editing = draft !== undefined
  const ok = !q.required || answered(q, draft ?? null)
  return (
    <li className="py-2 flex items-start gap-2">
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-xs text-muted-foreground break-words">{q.text}</p>
        {editing ? (
          <div className="pt-1 space-y-2">
            <AnswerInput q={q} value={draft ?? null} onChange={setDraft} upload={upload} />
            <div className="flex gap-2 justify-end">
              <button className="min-h-[44px] px-3 rounded-lg border border-border text-sm hover:bg-muted" onClick={() => setDraft(undefined)}>Cancel</button>
              <button className="min-h-[44px] px-4 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50" disabled={!ok || save.isPending}
                onClick={() => save.mutate({ answers: [{ question_id: q.id, value: draft ?? null }] }, { onSuccess: () => setDraft(undefined), onError: (e) => toast.error(errMsg(e)) })}>
                Save
              </button>
            </div>
          </div>
        ) : <Answer q={q} />}
      </div>
      {!editing && (
        <button onClick={() => setDraft(q.value)} aria-label="Edit" className="-mr-2 w-11 h-11 rounded-lg flex-shrink-0 text-muted-foreground hover:bg-muted"><Icon name="edit" size={18} /></button>
      )}
    </li>
  )
}

function Done({ data }: { data: Data }) {
  const sections: { name: string; questions: Data['questions'] }[] = []
  for (const q of data.questions) {
    if (sections[sections.length - 1]?.name !== q.section) sections.push({ name: q.section, questions: [] })
    sections[sections.length - 1].questions.push(q)
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-heading font-semibold tracking-tight">Onboarding</h2>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full ds-tag bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
          Done{data.done_at && ` · ${format(new Date(data.done_at), 'd MMM yyyy')}`}
        </span>
      </div>
      {sections.map((s) => (
        <section key={s.name} className="clay-card px-4 md:px-5 py-3">
          <h3 className="text-sm font-semibold">{s.name}</h3>
          <ul className="divide-y divide-border/60">
            {s.questions.map((q) => <DoneRow key={q.id} q={q} />)}
          </ul>
        </section>
      ))}
    </div>
  )
}

export default function ClientOnboarding() {
  const { data, isLoading, error } = useClientOnboarding()
  return (
    <ClientLayout>
      <main className="px-4 md:px-6 py-5 md:py-8 max-w-2xl">
        {isLoading ? spinner
          : error || !data ? <div className="clay-card p-5 text-sm">{errMsg(error)}</div>
          : !data.questions.length ? <p className="text-sm text-muted-foreground">—</p>
          : data.status === 'done' ? <Done data={data} />
          : <Flow data={data} />}
      </main>
    </ClientLayout>
  )
}
