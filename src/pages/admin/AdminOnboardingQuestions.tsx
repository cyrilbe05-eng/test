import { Icon } from '@/components/ds'
import { useState } from 'react'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Switch } from '@/components/care/Switch'
import { useOnboardingQuestions, useQuestionActions } from '@/hooks/useOnboarding'
import { cn } from '@/lib/utils'
import type { Question, QuestionBody, QuestionPackages, QuestionType } from '@/types/onboarding'

// Full admins: the onboarding questions — add, reword, reorder, deactivate.

const TYPES: { value: QuestionType; label: string }[] = [
  { value: 'text', label: 'Long text' }, { value: 'short_text', label: 'Short text' }, { value: 'choice', label: 'Choice' },
  { value: 'link', label: 'Links' }, { value: 'file', label: 'Files' },
]
const PACKAGES: { value: QuestionPackages; label: string }[] = [
  { value: 'both', label: 'Both' }, { value: 'full_package', label: 'Full package' }, { value: 'editing_only', label: 'Editing only' },
]
const inputCls = 'w-full min-h-[44px] rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30'
const btn = 'min-h-[44px] px-3 rounded-lg border border-border text-sm hover:bg-muted disabled:opacity-50'
const errMsg = (e: unknown) => (e as Error)?.message ?? 'Something went wrong'

type Form = { section: string; text: string; type: QuestionType; options: string[]; packages: QuestionPackages; required: boolean; admin_only: boolean }
const toForm = (q?: Question, section = ''): Form => ({
  section: q?.section ?? section, text: q?.text ?? '', type: q?.type ?? 'text', options: q?.options?.length ? q.options : ['', ''],
  packages: q?.packages ?? 'both', required: q?.required ?? true, admin_only: q?.admin_only ?? false,
})
const toBody = (f: Form): QuestionBody => ({
  section: f.section.trim(), text: f.text.trim(), type: f.type, packages: f.packages, required: f.required, admin_only: f.admin_only,
  ...(f.type === 'choice' ? { options: f.options.map((o) => o.trim()).filter(Boolean) } : {}),
})

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 p-1 rounded-lg bg-muted">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn('min-h-[40px] px-3 rounded-md text-sm', value === o.value ? 'bg-background shadow-sm font-semibold' : 'text-muted-foreground hover:text-foreground')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function QuestionForm({ initial, sections, saving, onSave, onCancel, onDelete }: { initial: Form; sections: string[]; saving: boolean; onSave: (f: Form) => void; onCancel: () => void; onDelete?: () => void }) {
  const [f, setF] = useState(initial)
  const ok = f.section.trim() && f.text.trim() && (f.type !== 'choice' || f.options.some((o) => o.trim()))
  return (
    <form className="space-y-3 py-3" onSubmit={(e) => { e.preventDefault(); if (ok) onSave(f) }}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <label className="block text-xs text-muted-foreground">Section
          <input className={cn(inputCls, 'mt-1 text-foreground')} list="onb-sections" value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })} />
        </label>
        <label className="block text-xs text-muted-foreground">Question
          <textarea className={cn(inputCls, 'mt-1 py-2 text-foreground')} rows={2} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
        </label>
      </div>
      <datalist id="onb-sections">{sections.map((s) => <option key={s} value={s} />)}</datalist>
      <Segmented label="Type" value={f.type} options={TYPES} onChange={(type) => setF({ ...f, type })} />
      {f.type === 'choice' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Options</p>
          {f.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className={cn(inputCls, 'text-foreground')} value={o} placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`}
                onChange={(e) => setF({ ...f, options: f.options.map((x, j) => (j === i ? e.target.value : x)) })} />
              <button type="button" aria-label="Remove option" disabled={f.options.length <= 1}
                className="w-11 h-11 flex-none rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30"
                onClick={() => setF({ ...f, options: f.options.filter((_, j) => j !== i) })}><Icon name="close" size={18} /></button>
            </div>
          ))}
          <button type="button" className={btn} onClick={() => setF({ ...f, options: [...f.options, ''] })}>
            <span className="inline-flex items-center gap-1.5"><Icon name="add" size={18} />Add option</span>
          </button>
        </div>
      )}
      <Segmented label="Package" value={f.packages} options={PACKAGES} onChange={(packages) => setF({ ...f, packages })} />
      <div className="flex flex-wrap gap-x-4">
        <Switch label="Required" checked={f.required} onChange={(required) => setF({ ...f, required })} />
        <Switch label="Admin only" checked={f.admin_only} onChange={(admin_only) => setF({ ...f, admin_only })} />
      </div>
      <div className="flex justify-end gap-2">
        {onDelete && (
          <button type="button" onClick={onDelete} className="mr-auto min-h-[44px] px-3 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10 inline-flex items-center gap-1.5">
            <Icon name="delete" size={18} />Delete
          </button>
        )}
        <button type="button" className={btn} onClick={onCancel}>Cancel</button>
        <button type="submit" disabled={!ok || saving} className="min-h-[44px] px-4 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50">Save</button>
      </div>
    </form>
  )
}

const chip = 'text-[12px] text-muted-foreground whitespace-nowrap'

export default function AdminOnboardingQuestions() {
  const { data, isLoading, error } = useOnboardingQuestions()
  const { create, update, reorder, remove } = useQuestionActions()
  const [editing, setEditing] = useState<string | null>(null) // question id, or 'new'
  const onErr = { onError: (e: unknown) => toast.error(errMsg(e)) }

  const list = data ?? []
  const sections = [...new Set(list.map((q) => q.section))]
  const move = (i: number, d: -1 | 1) => {
    const ids = list.map((q) => q.id)
    ;[ids[i], ids[i + d]] = [ids[i + d], ids[i]]
    reorder.mutate(ids, onErr)
  }

  return (
    <AdminLayout>
      <main className="px-4 md:px-6 py-5 md:py-6 space-y-4 max-w-4xl">
        <div className="flex items-center justify-between gap-3">
          <h1>Onboarding questions</h1>
          {editing !== 'new' && (
            <button onClick={() => setEditing('new')} className="ds-primary ds-tap whitespace-nowrap">+ New question</button>
          )}
        </div>
        {editing === 'new' && (
          <section className="clay-card px-4">
            <QuestionForm initial={toForm(undefined, sections[sections.length - 1])} sections={sections} saving={create.isPending}
              onCancel={() => setEditing(null)} onSave={(f) => create.mutate(toBody(f), { ...onErr, onSuccess: () => setEditing(null) })} />
          </section>
        )}
        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
        ) : error ? (
          <div className="clay-card p-5 text-sm">{errMsg(error)}</div>
        ) : (
          <ol className="clay-card px-3 md:px-4 py-1 divide-y divide-border/60">
            {list.map((q, i) => (
              <li key={q.id} className={cn(!q.active && 'opacity-50')}>
                {(i === 0 || list[i - 1].section !== q.section) && (
                  <p className="pt-4 pb-1" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--strong)' }}>{q.section}</p>
                )}
                {editing === q.id ? (
                  <QuestionForm initial={toForm(q)} sections={sections} saving={update.isPending} onCancel={() => setEditing(null)}
                    onSave={(f) => update.mutate({ id: q.id, ...toBody(f) }, { ...onErr, onSuccess: () => setEditing(null) })}
                    onDelete={() => {
                      if (!window.confirm('Delete this question? Answers clients gave to it are deleted too.')) return
                      remove.mutate(q.id, { ...onErr, onSuccess: () => { setEditing(null); toast.success('Question deleted') } })
                    }} />
                ) : (
                  <div className="flex items-center gap-1 py-1">
                    <span className="w-6 text-xs tabular-nums text-muted-foreground flex-shrink-0">{i + 1}</span>
                    <button onClick={() => setEditing(q.id)} className="flex-1 min-w-0 py-1.5 text-left rounded-lg hover:bg-muted/60 px-1 -mx-1">
                      <span className="block text-sm break-words">{q.text}</span>
                      <span className="flex flex-wrap gap-1 mt-1">
                        <span className={chip}>{TYPES.find((t) => t.value === q.type)?.label}</span>
                        {q.packages !== 'both' && <span className={chip}>{PACKAGES.find((p) => p.value === q.packages)?.label}</span>}
                        {!q.required && <span className={chip}>Optional</span>}
                        {q.admin_only && <span className={chip}>Admin only</span>}
                      </span>
                    </button>
                    <Switch label="" ariaLabel="Active" checked={q.active} onChange={(active) => update.mutate({ id: q.id, active }, onErr)} className="flex-shrink-0" />
                    <span className="flex flex-shrink-0">
                      <button className="w-11 h-11 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label="Move up" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)}><Icon name="arrow_upward" size={18} /></button>
                      <button className="w-11 h-11 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label="Move down" disabled={i === list.length - 1 || reorder.isPending} onClick={() => move(i, 1)}><Icon name="arrow_downward" size={18} /></button>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </main>
    </AdminLayout>
  )
}
