import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, formatDistanceToNow, isToday } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useCareClient, useMarkContacted, useUndoContact, useUpdateCare } from '@/hooks/useCare'
import { HealthBadge } from '@/components/care/HealthBadge'
import { Block } from '@/components/care/Block'
import { SopRules, RevisionBacklog } from '@/components/care/RevisionSections'
import type { CareFields, ClientCareDetail, OnboardingStep, RenewalStatus } from '@/types/care'

// Client detail: side panel on desktop, full screen on phones. All numbers
// and rules come from the API; this only displays and edits.

const RENEWAL_OPTIONS: { value: RenewalStatus; label: string }[] = [
  { value: 'not_discussed', label: 'Not discussed' },
  { value: 'discussed', label: 'Discussed' },
  { value: 'renewed', label: 'Renewed' },
  { value: 'declined', label: 'Declined' },
]

const ONBOARDING_LABELS: Record<OnboardingStep, string> = {
  welcome_sent: 'Welcome message sent',
  call_done: 'Kick-off call done',
  brief_received: 'First brief received',
  first_video_delivered: 'First video delivered',
}

const STATUS_LABELS: Record<string, string> = {
  pending_assignment: 'Waiting for editor',
  in_progress: 'In progress',
  in_review: 'Admin review',
  admin_approved: 'Admin approved',
  client_reviewing: 'With client',
  revision_requested: 'Revision requested',
  client_approved: 'Approved',
}

const inputCls = 'w-full min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30'
const fmtDate = (d: string | null) => (d ? format(new Date(d.length === 10 ? `${d}T12:00:00Z` : d), 'd MMM yyyy') : '—')
const errMsg = (e: unknown) => (e as Error)?.message ?? 'Something went wrong'

function SaveButton({ dirty, saving, onClick }: { dirty: boolean; saving: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!dirty || saving}
      className="min-h-[44px] px-4 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-40 hover:brightness-110 transition-all"
    >
      {saving ? 'Saving…' : 'Save'}
    </button>
  )
}

// ── Contacted tick ──────────────────────────────────────────────────────────

function ContactedTick({ detail }: { detail: ClientCareDetail }) {
  const mark = useMarkContacted()
  const undo = useUndoContact()
  const latest = detail.contacts[0] ?? null
  const checked = !!latest && isToday(new Date(latest.contacted_at))
  const busy = mark.isPending || undo.isPending

  const toggle = () => {
    if (busy) return
    if (!checked) {
      mark.mutate(detail.client.id, {
        onSuccess: () => toast.success(`Marked ${detail.client.name} as contacted`),
        onError: (e) => toast.error(errMsg(e)),
      })
    } else if (latest) {
      undo.mutate(latest.id, {
        onSuccess: () => toast.success("Today's contact removed"),
        onError: (e) => toast.error(errMsg(e)),
      })
    }
  }

  return (
    <div className="px-4 md:px-5 py-4 border-b border-border/60">
      <button
        role="checkbox"
        aria-checked={checked}
        onClick={toggle}
        disabled={busy}
        className={cn(
          'w-full min-h-[64px] rounded-2xl border-2 flex items-center gap-4 px-4 text-left transition-colors disabled:opacity-60',
          checked ? 'border-emerald-500 bg-emerald-500/10' : 'border-border hover:border-primary/50 hover:bg-muted/50',
        )}
      >
        <span className={cn(
          'w-9 h-9 rounded-xl border-2 flex items-center justify-center flex-shrink-0 text-lg font-bold',
          checked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-muted-foreground/40',
        )} aria-hidden>
          {checked ? '✓' : ''}
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">{checked ? 'Contacted today' : 'Contacted'}</span>
          <span className="block text-sm text-muted-foreground">
            {busy ? 'Saving…'
              : checked ? `Ticked at ${format(new Date(latest!.contacted_at), 'HH:mm')} · tap again to undo`
                : latest ? `Last contact ${formatDistanceToNow(new Date(latest.contacted_at), { addSuffix: true })} · tap when you've messaged them`
                  : 'No contact logged yet · tap when you\'ve messaged them'}
          </span>
        </span>
      </button>
      <div className="flex flex-wrap gap-2 mt-3">
        {detail.client.phone && (
          <>
            <a href={`tel:${detail.client.phone}`} className="min-h-[44px] inline-flex items-center px-3 rounded-xl border border-border text-sm hover:bg-muted">Call</a>
            <a href={`https://wa.me/${detail.client.phone.replace(/[^\d]/g, '')}`} target="_blank" rel="noopener noreferrer" className="min-h-[44px] inline-flex items-center px-3 rounded-xl border border-border text-sm hover:bg-muted">WhatsApp</a>
          </>
        )}
        <a href={`mailto:${detail.client.email}`} className="min-h-[44px] inline-flex items-center px-3 rounded-xl border border-border text-sm hover:bg-muted break-all">{detail.client.email}</a>
      </div>
    </div>
  )
}

// ── Stats ───────────────────────────────────────────────────────────────────

function Stats({ detail }: { detail: ClientCareDetail }) {
  const s = detail.stats
  const days = (n: number | null, none = '—') => (n == null ? none : `${n} day${n === 1 ? '' : 's'}`)
  const contract = s.days_left_on_contract == null ? '—'
    : s.days_left_on_contract < 0 ? `Ended ${-s.days_left_on_contract}d ago` : days(s.days_left_on_contract)
  const items: [string, string][] = [
    ['Delivered this month', String(s.videos_delivered_this_month)],
    ['Delivered in total', String(s.videos_delivered_total)],
    ['Used vs included', s.videos_included != null && s.videos_delivered_in_contract != null ? `${s.videos_delivered_in_contract} / ${s.videos_included}` : s.videos_included != null ? `— / ${s.videos_included}` : '—'],
    ['Avg turnaround', s.avg_turnaround_days == null ? '—' : `${s.avg_turnaround_days} d`],
    ['Revisions per video', s.avg_revisions_per_video == null ? '—' : String(s.avg_revisions_per_video)],
    ['Since last brief', days(s.days_since_last_brief, 'Never')],
    ['Since last contact', days(s.days_since_last_contact, 'Never')],
    ['Contract left', contract],
  ]
  return (
    <Block title="Stats">
      <dl className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-2 lg:grid-cols-4 gap-2">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-muted/50 p-2.5 min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-heading font-semibold tabular-nums mt-0.5">{value}</dd>
          </div>
        ))}
      </dl>
      {s.includes_estimates && (
        <p className="text-xs text-muted-foreground mt-2">Some older videos have estimated delivery dates (they predate the status history).</p>
      )}
    </Block>
  )
}

// ── Contract & renewal ──────────────────────────────────────────────────────

function ContractForm({ detail }: { detail: ClientCareDetail }) {
  const update = useUpdateCare()
  const pick = (c: CareFields) => ({
    contract_start: c.contract_start ?? '',
    contract_end: c.contract_end ?? '',
    videos_included: c.videos_included == null ? '' : String(c.videos_included),
    renewal_status: c.renewal_status,
  })
  const [form, setForm] = useState(() => pick(detail.care))
  // Keep in sync when the server copy changes (after a save or a refetch).
  useEffect(() => { setForm(pick(detail.care)) }, [detail.care.contract_start, detail.care.contract_end, detail.care.videos_included, detail.care.renewal_status]) // eslint-disable-line react-hooks/exhaustive-deps
  const saved = pick(detail.care)
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)

  const save = () => update.mutate({
    clientId: detail.client.id,
    body: {
      contract_start: form.contract_start || null,
      contract_end: form.contract_end || null,
      videos_included: form.videos_included === '' ? null : Number(form.videos_included),
      renewal_status: form.renewal_status,
    },
  }, { onSuccess: () => toast.success('Contract saved'), onError: (e) => toast.error(errMsg(e)) })

  return (
    <Block title="Contract & renewal" action={<SaveButton dirty={dirty} saving={update.isPending} onClick={save} />}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm space-y-1">
          <span className="text-muted-foreground">Contract start</span>
          <input type="date" className={inputCls} value={form.contract_start} onChange={(e) => setForm({ ...form, contract_start: e.target.value })} />
        </label>
        <label className="text-sm space-y-1">
          <span className="text-muted-foreground">Contract end</span>
          <input type="date" className={inputCls} value={form.contract_end} onChange={(e) => setForm({ ...form, contract_end: e.target.value })} />
        </label>
        <label className="text-sm space-y-1">
          <span className="text-muted-foreground">Videos included</span>
          <input type="number" min={0} inputMode="numeric" className={inputCls} value={form.videos_included} onChange={(e) => setForm({ ...form, videos_included: e.target.value })} />
        </label>
        <label className="text-sm space-y-1">
          <span className="text-muted-foreground">Renewal</span>
          <select className={inputCls} value={form.renewal_status} onChange={(e) => setForm({ ...form, renewal_status: e.target.value as RenewalStatus })}>
            {RENEWAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>
    </Block>
  )
}

// ── Notes + Miro ────────────────────────────────────────────────────────────

function NotesForm({ detail }: { detail: ClientCareDetail }) {
  const update = useUpdateCare()
  const [notes, setNotes] = useState(detail.care.care_notes ?? '')
  useEffect(() => { setNotes(detail.care.care_notes ?? '') }, [detail.care.care_notes])
  const dirty = notes.trim() !== (detail.care.care_notes ?? '')
  const save = () => update.mutate({ clientId: detail.client.id, body: { care_notes: notes } },
    { onSuccess: () => toast.success('Notes saved'), onError: (e) => toast.error(errMsg(e)) })
  return (
    <Block title="Care notes" action={<SaveButton dirty={dirty} saving={update.isPending} onClick={save} />}>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={4}
        placeholder="How they like to be contacted, preferences, things to remember…"
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
  const save = () => update.mutate({ clientId: detail.client.id, body: { miro_url: url } },
    { onSuccess: () => toast.success('Miro link saved'), onError: (e) => toast.error(errMsg(e)) })
  // Shown inside the Client SOPs section (the board holds the client's SOPs).
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="text-sm font-medium">Miro board</span>
        <SaveButton dirty={dirty} saving={update.isPending} onClick={save} />
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input type="url" inputMode="url" placeholder="https://miro.com/app/board/…" aria-label="Miro board link" className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} />
        {detail.care.miro_url && (
          <a href={detail.care.miro_url} target="_blank" rel="noopener noreferrer"
            className="min-h-[44px] inline-flex items-center justify-center px-4 rounded-xl border border-border text-sm font-medium hover:bg-muted whitespace-nowrap">
            Open board ↗
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
    <Block title={`Onboarding · ${done}/${steps.length}`}>
      <ul className="space-y-1">
        {steps.map((step) => {
          const at = detail.onboarding[step]
          return (
            <li key={step}>
              <button
                role="checkbox"
                aria-checked={!!at}
                disabled={update.isPending}
                onClick={() => toggle(step)}
                className="w-full min-h-[44px] flex items-center gap-3 px-2 rounded-xl hover:bg-muted/60 text-left disabled:opacity-60"
              >
                <span className={cn('w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 text-sm font-bold',
                  at ? 'bg-primary border-primary text-white' : 'border-muted-foreground/40')} aria-hidden>
                  {at ? '✓' : ''}
                </span>
                <span className={cn('flex-1 text-sm', at && 'text-muted-foreground line-through decoration-muted-foreground/40')}>{ONBOARDING_LABELS[step]}</span>
                {at && <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{fmtDate(at)}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </Block>
  )
}

// ── Videos ──────────────────────────────────────────────────────────────────

function Videos({ detail }: { detail: ClientCareDetail }) {
  const [all, setAll] = useState(false)
  const list = all ? detail.projects : detail.projects.slice(0, 6)
  if (!detail.projects.length) return <Block title="Videos"><p className="text-sm text-muted-foreground">No videos yet.</p></Block>
  return (
    <Block title={`Videos · ${detail.projects.length}`}>
      <ul className="divide-y divide-border/60 -my-1">
        {list.map((v) => (
          <li key={v.id}>
            {/* The whole row is the tap target (opens the project). */}
            <Link to={`/admin/projects/${v.id}`} className="block min-h-[44px] py-2.5 px-2 -mx-2 rounded-xl hover:bg-muted/60 transition-colors">
            <span className="flex items-start justify-between gap-3">
              <span className="font-medium text-sm break-words min-w-0">{v.title}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted whitespace-nowrap text-foreground">{STATUS_LABELS[v.status] ?? v.status}</span>
            </span>
            <span className="block text-xs text-muted-foreground mt-1 tabular-nums">
              Requested {fmtDate(v.created_at)}
              {' · '}Delivered {v.delivered_at ? `${fmtDate(v.delivered_at)}${v.delivered_estimated ? ' (est.)' : ''}` : '—'}
              {' · '}Approved {fmtDate(v.approved_at)}
              {v.turnaround_days != null && ` · ${v.turnaround_days} d turnaround`}
              {v.revisions > 0 && ` · ${v.revisions} revision${v.revisions === 1 ? '' : 's'}`}
              {v.editors.length > 0 && ` · ${v.editors.map((e) => e.name).join(', ')}`}
            </span>
            </Link>
          </li>
        ))}
      </ul>
      {detail.projects.length > 6 && (
        <button onClick={() => setAll((a) => !a)} className="mt-2 min-h-[44px] px-3 rounded-xl text-sm text-primary hover:bg-primary/5">
          {all ? 'Show fewer' : `Show all ${detail.projects.length}`}
        </button>
      )}
    </Block>
  )
}

// ── Panel ───────────────────────────────────────────────────────────────────

export function ClientCarePanel({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const { data, isLoading, error } = useCareClient(clientId)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      {/* Dimmed backdrop on desktop; the panel is full screen on phones. */}
      <div className="hidden md:block absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={data ? `Client care: ${data.client.name}` : 'Client care'}
        className="relative w-full md:w-[560px] lg:w-[620px] h-full bg-background md:border-l border-border shadow-2xl flex flex-col animate-slide-in-right"
      >
        <header className="flex items-center gap-3 px-4 md:px-5 h-[60px] border-b border-border flex-shrink-0 bg-card/80 backdrop-blur-xl">
          <button onClick={onClose} className="w-11 h-11 -ml-2 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div className="min-w-0 flex-1">
            <h3 className="font-heading font-semibold truncate">{data?.client.name ?? 'Loading…'}</h3>
            {data && (
              <p className="text-xs text-muted-foreground truncate">
                {[data.client.plan_name, data.client.client_id_label].filter(Boolean).join(' · ') || 'Client'}
              </p>
            )}
          </div>
          {data && <HealthBadge health={data.health} />}
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain pb-8">
          {isLoading ? (
            <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
          ) : error ? (
            <p className="p-5 text-sm">{errMsg(error)}</p>
          ) : data ? (
            <>
              <ContactedTick detail={data} />
              <Block title="Why">
                <ul className="space-y-1 text-sm">
                  {data.reasons.map((r) => <li key={r} className="flex gap-2"><span aria-hidden className="text-muted-foreground">–</span><span className="break-words">{r}</span></li>)}
                </ul>
              </Block>
              <Stats detail={data} />
              <SopRules detail={data} miro={<MiroForm detail={data} />} />
              <RevisionBacklog detail={data} />
              <ContractForm detail={data} />
              <NotesForm detail={data} />
              <Onboarding detail={data} />
              <Videos detail={data} />
            </>
          ) : null}
        </div>
      </aside>
    </div>
  )
}
