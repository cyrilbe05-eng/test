import { useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { usePlanActions } from '@/hooks/usePlans'
import type { AutoRule, Plan, PlanOwner, PlanStep } from '@/types/plans'

// Production plan list + editing (copywriters: assigned clients; admins: all).
// Compact rows: tick · date · step · owner. Done steps faded, the next step
// highlighted, overdue client steps marked.

const OWNER_LABEL: Record<PlanOwner, string> = { pingu: 'Pingu', client: 'Client', both: 'Both' }
const AUTO_LABEL: Record<AutoRule, string> = { none: '—', footage_uploaded: 'Footage uploaded', all_delivered: 'All delivered' }
const inputCls = 'w-full min-h-[44px] rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30'
const btn = 'min-h-[44px] px-3 rounded-lg border border-border text-sm hover:bg-muted disabled:opacity-50'
const day = (d: string) => format(new Date(`${d}T12:00:00Z`), 'd MMM')
const errMsg = (e: unknown) => (e as Error)?.message ?? 'Something went wrong'
const todayStr = () => new Date().toISOString().slice(0, 10)

function OwnerTag({ owner }: { owner: PlanOwner }) {
  return (
    <span className={cn('text-xs px-2 py-0.5 rounded-full whitespace-nowrap',
      owner === 'client' ? 'bg-primary/10 text-primary' : owner === 'both' ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300' : 'bg-muted text-muted-foreground')}>
      {OWNER_LABEL[owner]}
    </span>
  )
}

type Draft = { date: string; title: string; owner: PlanOwner; auto_rule: AutoRule }

function StepFields({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[9rem_minmax(0,1fr)] gap-2">
      <input type="date" aria-label="Date" className={inputCls} value={draft.date} onChange={(e) => onChange({ ...draft, date: e.target.value })} />
      <input aria-label="Step" className={inputCls} value={draft.title} onChange={(e) => onChange({ ...draft, title: e.target.value })} />
      <select aria-label="Owner" className={inputCls} value={draft.owner} onChange={(e) => onChange({ ...draft, owner: e.target.value as PlanOwner })}>
        {(Object.keys(OWNER_LABEL) as PlanOwner[]).map((o) => <option key={o} value={o}>{OWNER_LABEL[o]}</option>)}
      </select>
      <select aria-label="Auto tick" className={inputCls} value={draft.auto_rule} onChange={(e) => onChange({ ...draft, auto_rule: e.target.value as AutoRule })}>
        {(Object.keys(AUTO_LABEL) as AutoRule[]).map((r) => <option key={r} value={r}>{r === 'none' ? 'Auto: —' : `Auto: ${AUTO_LABEL[r]}`}</option>)}
      </select>
    </div>
  )
}

function StepRow({ step, index, steps, actions }: { step: PlanStep; index: number; steps: PlanStep[]; actions: ReturnType<typeof usePlanActions> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Draft>({ date: step.date, title: step.title, owner: step.owner, auto_rule: step.auto_rule })
  const busy = actions.update.isPending || actions.remove.isPending || actions.reorder.isPending
  const onErr = { onError: (e: unknown) => toast.error(errMsg(e)) }

  const move = (dir: -1 | 1) => {
    const ids = steps.map((s) => s.id)
    const j = index + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    actions.reorder.mutate(ids, onErr)
  }

  return (
    <li className={cn('rounded-lg', step.state === 'next' && 'bg-primary/5 ring-1 ring-primary/30', step.state === 'overdue' && 'bg-red-500/5 ring-1 ring-red-500/30')}>
      <div className={cn('flex items-center gap-2 pr-1', step.done && 'opacity-50')}>
        <button
          role="checkbox"
          aria-checked={step.done}
          aria-label={step.title}
          disabled={busy}
          onClick={() => actions.update.mutate({ id: step.id, body: { done: !step.done } }, onErr)}
          className="w-11 h-11 flex items-center justify-center flex-shrink-0"
        >
          <span className={cn('w-5 h-5 rounded-md border-2 flex items-center justify-center text-xs font-bold',
            step.done ? 'bg-primary border-primary text-white' : 'border-muted-foreground/40')}>{step.done ? '✓' : ''}</span>
        </button>
        <span className={cn('w-14 flex-shrink-0 text-xs tabular-nums', step.state === 'overdue' ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-muted-foreground')}>{day(step.date)}</span>
        <span className={cn('flex-1 min-w-0 text-sm truncate', step.state === 'next' && 'font-semibold')}>{step.title}</span>
        <OwnerTag owner={step.owner} />
        <button onClick={() => { setDraft({ date: step.date, title: step.title, owner: step.owner, auto_rule: step.auto_rule }); setEditing((v) => !v) }}
          aria-label={`Edit ${step.title}`} aria-expanded={editing}
          className="w-11 h-11 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted flex-shrink-0">⋯</button>
      </div>
      {editing && (
        <div className="px-2 pb-3 pt-1 space-y-2">
          <StepFields draft={draft} onChange={setDraft} />
          <div className="flex flex-wrap gap-2">
            <button className={cn(btn, 'bg-primary text-white border-primary')} disabled={busy}
              onClick={() => actions.update.mutate({ id: step.id, body: draft }, { onSuccess: () => setEditing(false), ...onErr })}>Save</button>
            <button className={btn} disabled={busy || index === 0} onClick={() => move(-1)} aria-label="Move up">↑</button>
            <button className={btn} disabled={busy || index === steps.length - 1} onClick={() => move(1)} aria-label="Move down">↓</button>
            <button className={cn(btn, 'text-destructive ml-auto')} disabled={busy}
              onClick={() => { if (confirm(`Delete “${step.title}”?`)) actions.remove.mutate(step.id, onErr) }}>Delete</button>
          </div>
        </div>
      )}
    </li>
  )
}

export function PlanEditor({ plan }: { plan: Plan }) {
  const actions = usePlanActions(plan.contract.id)
  const [start, setStart] = useState(() => (plan.contract.start_date > todayStr() ? plan.contract.start_date : todayStr()))
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Draft>({ date: todayStr(), title: '', owner: 'pingu', auto_rule: 'none' })
  const onErr = { onError: (e: unknown) => toast.error(errMsg(e)) }

  if (plan.contract.package !== 'full_package') return <p className="text-sm text-muted-foreground">—</p>

  if (!plan.items.length) {
    return (
      <div className="flex flex-col sm:flex-row gap-2">
        <input type="date" aria-label="Start" className={cn(inputCls, 'sm:w-44')} value={start} onChange={(e) => setStart(e.target.value)} />
        <button className={cn(btn, 'bg-primary text-white border-primary font-semibold')} disabled={actions.fromTemplate.isPending}
          onClick={() => actions.fromTemplate.mutate(start, onErr)}>
          {actions.fromTemplate.isPending ? 'Creating…' : 'From template'}
        </button>
      </div>
    )
  }

  return (
    <div>
      <ol className="space-y-0.5">
        {plan.items.map((s, i) => <StepRow key={s.id} step={s} index={i} steps={plan.items} actions={actions} />)}
      </ol>
      {adding ? (
        <div className="mt-3 space-y-2">
          <StepFields draft={draft} onChange={setDraft} />
          <div className="flex gap-2">
            <button className={cn(btn, 'bg-primary text-white border-primary')} disabled={actions.add.isPending || !draft.title.trim()}
              onClick={() => actions.add.mutate(draft, { onSuccess: () => { setAdding(false); setDraft({ ...draft, title: '' }) }, ...onErr })}>Add</button>
            <button className={btn} onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className={cn(btn, 'mt-2 border-dashed')} onClick={() => setAdding(true)}>+ Step</button>
      )}
    </div>
  )
}
