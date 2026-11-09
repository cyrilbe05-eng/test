import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { AnswerInput } from '@/components/onboarding/AnswerInput'
import { useClientOnboarding, useSaveClientOnboarding, useUploadOnboardingFile } from '@/hooks/useOnboarding'
import type { AnswerValue, AskedQuestion } from '@/types/onboarding'

// Client onboarding: one question per screen, thin progress bar, Back / Next.
// Answers autosave; they resume at the first unanswered question.

function answered(q: AskedQuestion, v: AnswerValue | undefined) {
  if (v == null) return false
  if (Array.isArray(v)) return v.length > 0
  if (q.type === 'choice' && v === 'Other' && q.options.includes('Other')) return false
  return v.trim().length > 0
}

export default function ClientOnboarding() {
  const { data, isLoading, error } = useClientOnboarding()
  const save = useSaveClientOnboarding()
  const upload = useUploadOnboardingFile('/api/client/onboarding/files')
  const navigate = useNavigate()

  const [values, setValues] = useState<Record<string, AnswerValue>>({})
  const [index, setIndex] = useState<number | null>(null)
  const pending = useRef<Map<string, AnswerValue>>(new Map())
  const timer = useRef<ReturnType<typeof setTimeout>>()

  // First load: answers so far, and start at the first unanswered question.
  useEffect(() => {
    if (!data || index !== null) return
    setValues(Object.fromEntries(data.questions.map((q) => [q.id, q.value])))
    const first = data.questions.findIndex((q) => !answered(q, q.value))
    setIndex(first === -1 ? Math.max(0, data.questions.length - 1) : first)
  }, [data, index])

  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    if (!pending.current.size) return
    const answers = [...pending.current].map(([question_id, value]) => ({ question_id, value }))
    pending.current.clear()
    try { await save.mutateAsync({ answers }) } catch (e) { toast.error((e as Error).message) }
  }, [save])

  // Save whatever is left when they leave the page.
  useEffect(() => () => { void flush() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || (data && index === null)) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
  }
  if (error || !data) return <div className="min-h-screen p-6 bg-background text-sm">{(error as Error)?.message}</div>
  if (data.status === 'done' || !data.questions.length) return <Navigate to="/workspace" replace />

  const i = index!
  const q = data.questions[i]
  const last = i === data.questions.length - 1
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
    if (!last) { setIndex(i + 1); return }
    try {
      await save.mutateAsync({ done: true })
      navigate('/workspace', { replace: true })
    } catch (e) {
      toast.error((e as Error).message)
      const missing = data.questions.findIndex((x) => x.required && !answered(x, values[x.id]))
      if (missing !== -1) setIndex(missing)
    }
  }
  const back = async () => { await flush(); setIndex(Math.max(0, i - 1)) }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="fixed top-0 inset-x-0 h-1 bg-muted z-10" role="progressbar" aria-valuemin={0} aria-valuemax={data.questions.length} aria-valuenow={i + 1}>
        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${((i + 1) / data.questions.length) * 100}%` }} />
      </div>
      <main className="flex-1 w-full max-w-xl mx-auto px-4 pt-16 pb-8 flex flex-col">
        <form key={q.id} noValidate className="flex-1 flex flex-col" onSubmit={(e) => { e.preventDefault(); if (ok && !save.isPending) void next() }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{q.section}</p>
          <h1 className="mt-2 mb-6 text-xl md:text-2xl font-heading font-semibold leading-snug break-words">{q.text}</h1>
          <AnswerInput q={q} value={values[q.id] ?? null} onChange={change} upload={upload} big />
          <div className="mt-auto pt-8 flex items-center gap-3">
            {i > 0 && (
              <button type="button" onClick={back} className="min-h-[48px] px-5 rounded-xl border border-border text-sm font-medium hover:bg-muted">Back</button>
            )}
            <button type="submit" disabled={!ok || save.isPending}
              className="ml-auto min-h-[48px] px-6 rounded-xl bg-primary text-white text-sm font-semibold hover:brightness-110 disabled:opacity-40">
              {last ? 'Finish' : 'Next'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
