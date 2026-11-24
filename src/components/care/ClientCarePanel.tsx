import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, formatDistanceToNow, isToday } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  useCareClient, useMarkContacted, useUndoContact, useUpdateCare, useSaveInstagram,
  useCreateContract, useUpdateContract, useSetCopywriters,
} from '@/hooks/useCare'
import { usePlan } from '@/hooks/usePlans'
import { PlanEditor } from '@/components/plans/PlanEditor'
import { CheckRow } from '@/components/care/Switch'
import { InstagramInput, InstagramLinks } from '@/components/care/Instagram'
import { parseInstagramList } from '@/lib/instagram'
import { HealthBadge } from '@/components/care/HealthBadge'
import { Block } from '@/components/care/Block'
import { SopRules, RevisionBacklog } from '@/components/care/RevisionSections'
import { OnboardingAnswers } from '@/components/onboarding/OnboardingAnswers'
import { ApiKeysSection } from '@/components/care/ApiKeysSection'
import type { ClientCareDetail, Contract, ContractPackage, OnboardingStep, RenewalStatus } from '@/types/care'

// Client detail: side panel on desktop, full screen on phones. All numbers
// and rules come from the API; this only displays and edits.

const RENEWAL_OPTIONS: { value: RenewalStatus; label: string }[] = [
  { value: 'not_discussed', label: 'Not discussed' },
  { value: 'discussed', label: 'Discussed' },
  { value: 'renewed', label: 'Renewed' },
  { value: 'declined', label: 'Declined' },
]
const PACKAGE_OPTIONS: { value: ContractPackage; label: string }[] = [
  { value: 'editing_only', label: 'Editing only' },
  { value: 'full_package', label: 'Full package' },
]

const ONBOARDING_LABELS: Record<OnboardingStep, string> = {
  welcome_sent: 'Welcome message',
  call_done: 'Kick-off call',
  brief_received: 'First brief',
  first_video_delivered: 'First video delivered',
}

const STATUS_LABELS: Record<string, string> = {
  pending_assignment: 'Waiting for editor',
  in_progress: 'In progress',
  in_review: 'Admin review',
  admin_approved: 'Admin approved',
  client_reviewing: 'With client',
  revision_requested: 'Revision',
  client_approved: 'Approved',
}

const inputCls = 'w-full min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30'
const fmtDate = (d: string | null) => (d ? format(new Date(d.length === 10 ? `${d}T12:00:00Z` : d), 'd MMM yyyy') : '—')
const errMsg = (e: unknown) => (e as Error)?.message ?? 'Something went wrong'

function SaveButton({ dirty, saving, onClick, label = 'Save' }: { dirty: boolean; saving: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={!dirty || saving}
      className="min-h-[44px] px-4 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-40 hover:brightness-110 transition-all"
    >
      {saving ? 'Saving…' : label}
    </button>
  )
}

const ghostBtn = 'min-h-[44px] px-3 rounded-xl border border-border text-sm hover:bg-muted'

// ── Contacted tick ──────────────────────────────────────────────────────────

function ContactedTick({ detail }: { detail: ClientCareDetail }) {
  const mark = useMarkContacted()
  const undo = useUndoContact()
  const latest = detail.contacts[0] ?? null
  const checked = !!latest && isToday(new Date(latest.contacted_at))
  const busy = mark.isPending || undo.isPending

  const toggle = () => {
    if (busy) return
    if (!checked) mark.mutate(detail.client.id, { onError: (e) => toast.error(errMsg(e)) })
    else if (latest) undo.mutate(latest.id, { onError: (e) => toast.error(errMsg(e)) })
  }

  return (
    <div className="px-4 md:px-5 py-4 border-b border-border/60">
      <button
        role="checkbox"
        aria-checked={checked}
        onClick={toggle}
        disabled={busy}
        className={cn(
          'w-full min-h-[56px] rounded-xl border-2 flex items-center gap-3 px-4 text-left transition-colors disabled:opacity-60',
          checked ? 'border-emerald-500 bg-emerald-500/10' : 'border-border hover:border-primary/50 hover:bg-muted/50',
        )}
      >
        <span className={cn(
          'w-8 h-8 rounded-lg border-2 flex items-center justify-center flex-shrink-0 text-lg font-bold',
          checked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-muted-foreground/40',
        )} aria-hidden>
          {checked ? '✓' : ''}
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">Contacted</span>
          <span className="block text-sm text-muted-foreground">
            {checked ? `Today ${format(new Date(latest!.contacted_at), 'HH:mm')}`
              : latest ? formatDistanceToNow(new Date(latest.contacted_at), { addSuffix: true })
                : 'Never'}
          </span>
        </span>
      </button>
      <div className="flex flex-wrap gap-2 mt-3">
        {detail.client.phone && (
          <>
            <a href={`tel:${detail.client.phone}`} className={cn(ghostBtn, 'inline-flex items-center')}>Call</a>
            <a href={`https://wa.me/${detail.client.phone.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer" className={cn(ghostBtn, 'inline-flex items-center')}>WhatsApp</a>
          </>
        )}
        <a href={`mailto:${detail.client.email}`} className={cn(ghostBtn, 'inline-flex items-center break-all')}>{detail.client.email}</a>
      </div>
    </div>
  )
}

// ── Instagram ───────────────────────────────────────────────────────────────

function InstagramSection({ detail }: { detail: ClientCareDetail }) {
  const save = useSaveInstagram()
  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState<string[]>(detail.instagram)
  const start = () => { setRows(detail.instagram.length ? detail.instagram : ['']); setEditing(true) }
  const submit = () => {
    const { handles, invalid } = parseInstagramList(rows)
    if (invalid.length) { toast.error(`Invalid username: ${invalid.join(', ')}`); return }
    save.mutate({ clientId: detail.client.id, handles }, {
      onSuccess: () => setEditing(false),
      onError: (e) => toast.error(errMsg(e)),
    })
  }
  return (
    <Block
      title="Instagram"
      action={editing ? (
        <span className="flex gap-2">
          <button onClick={() => setEditing(false)} className={ghostBtn}>Cancel</button>
          <SaveButton dirty saving={save.isPending} onClick={submit} />
        </span>
      ) : (
        <button onClick={start} className={ghostBtn}>{detail.instagram.length ? 'Edit' : '+ Add'}</button>
      )}
    >
      {editing
        ? <InstagramInput value={rows} onChange={setRows} inputClassName={inputCls} />
        : detail.instagram.length
          ? <InstagramLinks handles={detail.instagram} />
          : <p className="text-sm text-muted-foreground">—</p>}
    </Block>
  )
}

// ── Stats ───────────────────────────────────────────────────────────────────

function Stats({ detail }: { detail: ClientCareDetail }) {
  const s = detail.stats
  const days = (n: number | null) => (n == null ? '—' : `${n} d`)
  const items: [string, string][] = [
    ['Videos', s.videos_included != null ? `${s.videos_delivered_in_contract ?? 0} / ${s.videos_included}` : String(s.videos_delivered_in_contract ?? s.videos_delivered_total)],
    ['This month', String(s.videos_delivered_this_month)],
    ['Turnaround', days(s.avg_turnaround_days)],
    ['Revisions / video', s.avg_revisions_per_video == null ? '—' : String(s.avg_revisions_per_video)],
    ['Last brief', days(s.days_since_last_brief)],
    ['Last contact', days(s.days_since_last_contact)],
  ]
  return (
    <Block title="Stats">
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-muted/50 px-3 py-2 min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-heading font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </Block>
  )
}

// ── Contracts ───────────────────────────────────────────────────────────────

type ContractForm = { start_date: string; end_date: string; package: ContractPackage; videos_included: string; renewal_status: RenewalStatus }
const toForm = (c: Contract): ContractForm => ({
  start_date: c.start_date, end_date: c.end_date, package: c.package,
  videos_included: c.videos_included == null ? '' : String(c.videos_included), renewal_status: c.renewal_status,
})
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const addYearMinusDay = (d: string) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCFullYear(x.getUTCFullYear() + 1); return addDays(x.toISOString().slice(0, 10), -1) }

function ContractFields({ form, onChange, withRenewal }: { form: ContractForm; onChange: (f: ContractForm) => void; withRenewal: boolean }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label className="text-sm space-y-1">
        <span className="text-muted-foreground">Start</span>
        <input type="date" className={inputCls} value={form.start_date} onChange={(e) => onChange({ ...form, start_date: e.target.value })} />
      </label>
      <label className="text-sm space-y-1">
        <span className="text-muted-foreground">End</span>
        <input type="date" className={inputCls} value={form.end_date} onChange={(e) => onChange({ ...form, end_date: e.target.value })} />
      </label>
      <label className="text-sm space-y-1">
        <span className="text-muted-foreground">Package</span>
        <select className={inputCls} value={form.package} onChange={(e) => onChange({ ...form, package: e.target.value as ContractPackage })}>
          {PACKAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="text-sm space-y-1">
        <span className="text-muted-foreground">Videos included</span>
        <input type="number" min={0} inputMode="numeric" className={inputCls} value={form.videos_included} onChange={(e) => onChange({ ...form, videos_included: e.target.value })} />
      </label>
      {withRenewal && (
        <label className="text-sm space-y-1 sm:col-span-2">
          <span className="text-muted-foreground">Renewal</span>
          <select className={inputCls} value={form.renewal_status} onChange={(e) => onChange({ ...form, renewal_status: e.target.value as RenewalStatus })}>
            {RENEWAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      )}
    </div>
  )
}

function Contracts({ detail }: { detail: ClientCareDetail }) {
  const update = useUpdateContract()
  const create = useCreateContract()
  const list = detail.contracts
  const [selectedId, setSelectedId] = useState<string | null>(detail.current_contract_id)
  const [creating, setCreating] = useState(false)
  const selected = list.find((c) => c.id === selectedId) ?? list.find((c) => c.id === detail.current_contract_id) ?? list.at(-1) ?? null
  const [form, setForm] = useState<ContractForm | null>(selected ? toForm(selected) : null)
  useEffect(() => { setForm(selected ? toForm(selected) : null) }, [selected?.id, selected?.start_date, selected?.end_date, selected?.package, selected?.videos_included, selected?.renewal_status]) // eslint-disable-line react-hooks/exhaustive-deps

  const last = list.at(-1)
  const newDefaults = (): ContractForm => {
    const start = last ? addDays(last.end_date, 1) : new Date().toISOString().slice(0, 10)
    return { start_date: start, end_date: addYearMinusDay(start), package: last?.package ?? 'editing_only', videos_included: last?.videos_included == null ? '' : String(last.videos_included), renewal_status: 'not_discussed' }
  }
  const [draft, setDraft] = useState<ContractForm>(newDefaults)

  const body = (f: ContractForm) => ({
    start_date: f.start_date, end_date: f.end_date, package: f.package,
    videos_included: f.videos_included === '' ? null : Number(f.videos_included), renewal_status: f.renewal_status,
  })
  const save = () => {
    if (!selected || !form) return
    const count = list.length
    update.mutate({ contractId: selected.id, body: body(form) }, {
      onSuccess: (d) => { if (d.contracts.length > count) toast.success(`Contract ${d.contracts.at(-1)!.number} created`) },
      onError: (e) => toast.error(errMsg(e)),
    })
  }
  const add = () => create.mutate({ clientId: detail.client.id, body: body(draft) }, {
    onSuccess: (d) => { setCreating(false); setSelectedId(d.contracts.at(-1)!.id) },
    onError: (e) => toast.error(errMsg(e)),
  })

  const dirty = !!selected && !!form && JSON.stringify(form) !== JSON.stringify(toForm(selected))

  return (
    <Block
      title="Contracts"
      action={creating
        ? <button onClick={() => setCreating(false)} className={ghostBtn}>Cancel</button>
        : <button onClick={() => { setDraft(newDefaults()); setCreating(true) }} className={ghostBtn}>+ New</button>}
    >
      {creating ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold">Contract {(last?.number ?? 0) + 1}</p>
          <ContractFields form={draft} onChange={setDraft} withRenewal={false} />
          <SaveButton dirty saving={create.isPending} onClick={add} label="Create" />
        </div>
      ) : !selected || !form ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <div className="space-y-3">
          {list.length > 1 && (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Contract">
              {list.map((c) => (
                <button
                  key={c.id}
                  role="radio"
                  aria-checked={c.id === selected.id}
                  onClick={() => setSelectedId(c.id)}
                  className={cn('min-h-[44px] min-w-[44px] px-3 rounded-xl border text-sm font-medium',
                    c.id === selected.id ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted')}
                >
                  {c.number}{c.id === detail.current_contract_id ? ' · now' : ''}
                </button>
              ))}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold">Contract {selected.number}</p>
            <p className="text-sm text-muted-foreground tabular-nums">{fmtDate(selected.start_date)} – {fmtDate(selected.end_date)}</p>
          </div>
          <ContractFields form={form} onChange={setForm} withRenewal />
          <SaveButton dirty={dirty} saving={update.isPending} onClick={save} />
        </div>
      )}
    </Block>
  )
}

// ── Copywriters + production plan ───────────────────────────────────────────

function Copywriters({ detail }: { detail: ClientCareDetail }) {
  const set = useSetCopywriters()
  const assigned = new Set(detail.copywriters.map((c) => c.id))
  const toggle = (id: string) => {
    const next = new Set(assigned)
    if (next.has(id)) next.delete(id); else next.add(id)
    set.mutate({ clientId: detail.client.id, ids: [...next] }, { onError: (e) => toast.error(errMsg(e)) })
  }
  // Multi-select: every ticked copywriter sees and edits this client's plan.
  return (
    <Block title="Copywriters">
      {detail.available_copywriters.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
        <div className="space-y-0.5">
          {detail.available_copywriters.map((c) => (
            <CheckRow key={c.id} checked={assigned.has(c.id)} disabled={set.isPending} onChange={() => toggle(c.id)} label={c.name} />
          ))}
        </div>
      )}
    </Block>
  )
}

function PlanSection({ detail }: { detail: ClientCareDetail }) {
  const current = detail.contracts.find((c) => c.id === detail.current_contract_id)
  const { data } = usePlan(current?.package === 'full_package' ? current.id : null)
  if (current?.package !== 'full_package') return null
  return (
    <Block title="Plan">
      {data ? <PlanEditor plan={data} /> : <div className="h-11" />}
    </Block>
  )
}

// ── Notes + Miro ────────────────────────────────────────────────────────────

function NotesForm({ detail }: { detail: ClientCareDetail }) {
  const update = useUpdateCare()
  const [notes, setNotes] = useState(detail.care.care_notes ?? '')
  useEffect(() => { setNotes(detail.care.care_notes ?? '') }, [detail.care.care_notes])
  const dirty = notes.trim() !== (detail.care.care_notes ?? '')
  const save = () => update.mutate({ clientId: detail.client.id, body: { care_notes: notes } }, { onError: (e) => toast.error(errMsg(e)) })
  return (
    <Block title="Notes" action={<SaveButton dirty={dirty} saving={update.isPending} onClick={save} />}>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={4}
        aria-label="Notes"
        className={cn(inputCls, 'py-2.5 min-h-[110px] resize-y')}
      />
    </Block>
  )
}

function MiroForm({ detail }: { detail: ClientCareDetail }) {
  const update = useUpdateCare()
  const [url, setUrl] = useState(detail.care.miro_url ?? '')
  useEffect(() => { setUrl(detail.care.miro_url ?? '') }, [detail.care.miro_url])
  const dirty = url.trim() !== (detail.care.miro_url ?? '')
  const save = () => update.mutate({ clientId: detail.client.id, body: { miro_url: url } }, { onError: (e) => toast.error(errMsg(e)) })
  // Shown inside the Client SOPs section (the board holds the client's SOPs).
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-sm font-medium">Miro</span>
        <SaveButton dirty={dirty} saving={update.isPending} onClick={save} />
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input type="url" inputMode="url" aria-label="Miro board link" className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} />
        {detail.care.miro_url && (
          <a href={detail.care.miro_url} target="_blank" rel="noopener noreferrer"
            className="min-h-[44px] inline-flex items-center justify-center px-4 rounded-xl border border-border text-sm font-medium hover:bg-muted whitespace-nowrap">
            Open ↗
          </a>
        )}
      </div>
    </div>
  )
}

// ── Onboarding ──────────────────────────────────────────────────────────────

function Onboarding({ detail }: { detail: ClientCareDetail }) {
  const update = useUpdateCare()
  const steps = Object.keys(ONBOARDING_LABELS) as OnboardingStep[]
  const done = steps.filter((s) => detail.onboarding[s]).length
  const toggle = (step: OnboardingStep) => update.mutate(
    { clientId: detail.client.id, body: { onboarding: { [step]: detail.onboarding[step] ? null : new Date().toISOString() } } },
    { onError: (e) => toast.error(errMsg(e)) },
  )
  return (
    <Block title={`Onboarding steps · ${done}/${steps.length}`}>
      <div className="space-y-0.5">
        {steps.map((step) => {
          const at = detail.onboarding[step]
          return (
            <CheckRow key={step} checked={!!at} disabled={update.isPending} onChange={() => toggle(step)} label={ONBOARDING_LABELS[step]}
              aside={at ? <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{fmtDate(at)}</span> : undefined} />
          )
        })}
      </div>
    </Block>
  )
}

// ── Videos ──────────────────────────────────────────────────────────────────

function Videos({ detail }: { detail: ClientCareDetail }) {
  const [all, setAll] = useState(false)
  const list = all ? detail.projects : detail.projects.slice(0, 5)
  if (!detail.projects.length) return null
  return (
    <Block title={`Videos · ${detail.projects.length}`}>
      <ul className="divide-y divide-border/60 -my-1">
        {list.map((v) => (
          <li key={v.id}>
            <Link to={`/admin/projects/${v.id}`} className="block min-h-[44px] py-3 px-2 -mx-2 rounded-xl hover:bg-muted/60 transition-colors">
              <span className="flex items-start justify-between gap-3">
                <span className="font-medium text-sm break-words min-w-0">{v.title}</span>
                <span className="text-xs px-2 py-0.5 rounded-full ds-tag bg-muted whitespace-nowrap text-foreground">{STATUS_LABELS[v.status] ?? v.status}</span>
              </span>
              <span className="block text-xs text-muted-foreground mt-1 tabular-nums">
                {fmtDate(v.delivered_at ?? v.created_at)}
                {v.editors.length > 0 && ` · ${v.editors.map((e) => e.name).join(', ')}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {detail.projects.length > 5 && (
        <button onClick={() => setAll((a) => !a)} className="mt-2 min-h-[44px] px-3 rounded-xl text-sm text-primary hover:bg-primary/5">
          {all ? 'Less' : `All ${detail.projects.length}`}
        </button>
      )}
    </Block>
  )
}

// ── Panel ───────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'plan' | 'feedback' | 'account' | 'onboarding'
const TABS: [Tab, string][] = [['overview', 'Overview'], ['plan', 'Plan'], ['feedback', 'Feedback'], ['account', 'Account'], ['onboarding', 'Onboarding']]

export function ClientCarePanel({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const { data, isLoading, error } = useCareClient(clientId)
  // One focused tab at a time instead of every section in one long column.
  const [tab, setTab] = useState<Tab>('overview')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="hidden md:block absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={data ? `Client care: ${data.client.name}` : 'Client care'}
        className="relative w-full md:w-[560px] lg:w-[620px] h-full bg-background md:border-l border-border shadow-2xl flex flex-col animate-slide-in-right"
      >
        <header className="flex items-center gap-3 px-4 md:px-5 h-[56px] border-b border-border flex-shrink-0 bg-card/80 backdrop-blur-xl">
          <button onClick={onClose} className="w-11 h-11 -ml-2 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <h3 className="min-w-0 flex-1 font-heading font-semibold truncate">{data?.client.name ?? ''}</h3>
          {data && <HealthBadge health={data.health} />}
        </header>
        <div role="tablist" className="flex gap-1 px-4 md:px-5 border-b border-border flex-shrink-0 overflow-x-auto">
          {TABS.map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={cn('min-h-[44px] px-3 -mb-px border-b-2 text-sm whitespace-nowrap', tab === t ? 'border-primary font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain pb-10">
          {tab === 'onboarding' ? (
            <>
              {data && <Onboarding detail={data} />}
              <OnboardingAnswers clientId={clientId} compact />
            </>
          ) : isLoading ? (
            <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
          ) : error ? (
            <p className="p-6 text-sm">{errMsg(error)}</p>
          ) : data ? (
            tab === 'overview' ? (
              <>
                <ContactedTick detail={data} />
                {(data.health !== 'healthy' || data.info.length > 0) && (
                  <Block title="Why">
                    <ul className="space-y-1.5 text-sm">
                      {data.health !== 'healthy' && data.reasons.map((r) => <li key={r} className="break-words">{r}</li>)}
                      {data.info.map((r) => <li key={r} className="break-words text-primary">{r}</li>)}
                    </ul>
                  </Block>
                )}
                <Stats detail={data} />
                <Videos detail={data} />
              </>
            ) : tab === 'plan' ? (
              <>
                <PlanSection detail={data} />
                <Copywriters detail={data} />
              </>
            ) : tab === 'feedback' ? (
              <>
                <SopRules detail={data} miro={<MiroForm detail={data} />} />
                <RevisionBacklog detail={data} />
              </>
            ) : (
              <>
                <Contracts detail={data} />
                <InstagramSection detail={data} />
                <NotesForm detail={data} />
                <ApiKeysSection clientId={data.client.id} />
              </>
            )
          ) : null}
        </div>
      </aside>
    </div>
  )
}
