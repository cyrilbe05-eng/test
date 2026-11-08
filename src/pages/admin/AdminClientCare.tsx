import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format, isToday } from 'date-fns'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { ClientCarePanel } from '@/components/care/ClientCarePanel'
import { HealthBadge } from '@/components/care/HealthBadge'
import { HEALTH_META } from '@/components/care/healthMeta'
import { useCareOverview, useMarkContacted, useUndoContact } from '@/hooks/useCare'
import { cn } from '@/lib/utils'
import type { CareOverview, Health, HealthCard, OutputRate, RenewalStatus } from '@/types/care'

const RENEWAL_LABEL: Record<RenewalStatus, string> = {
  not_discussed: 'Not discussed',
  discussed: 'Discussed',
  renewed: 'Renewed',
  declined: 'Declined',
}

function daysLeftLabel(days: number | null): string | null {
  if (days == null) return null
  if (days < 0) return `Ended ${-days}d ago`
  if (days === 0) return 'Ends today'
  return `${days}d left`
}

function Section({ title, count, hint, children, className }: { title: string; count?: number; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('clay-card p-4 md:p-5 min-w-0', className)}>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="font-heading font-semibold">
          {title}
          {count != null && <span className="ml-2 text-sm font-medium text-muted-foreground">{count}</span>}
        </h3>
        {hint && <span className="text-xs text-muted-foreground text-right">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

// ── Text today ──────────────────────────────────────────────────────────────

/** One-tap "Contacted" straight from the list, with Undo in the toast. */
function QuickContacted({ item }: { item: CareOverview['text_today'][number] }) {
  const mark = useMarkContacted()
  const undo = useUndoContact()
  const done = !!item.last_contact_at && isToday(new Date(item.last_contact_at))
  const tick = () => mark.mutate(item.client_id, {
    onSuccess: (detail) => toast.success(`Marked ${item.name} as contacted`, {
      action: { label: 'Undo', onClick: () => undo.mutate(detail.contacts[0].id) },
    }),
    onError: (e) => toast.error((e as Error).message),
  })
  return (
    <button
      onClick={tick}
      disabled={done || mark.isPending}
      className={cn(
        'min-h-[44px] px-3 rounded-xl text-sm font-semibold whitespace-nowrap flex-shrink-0 transition-colors',
        done ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border border-border hover:bg-muted disabled:opacity-60',
      )}
    >
      {done ? '✓ Contacted' : mark.isPending ? 'Saving…' : 'Contacted'}
    </button>
  )
}

function TextToday({ items, onOpen }: { items: CareOverview['text_today']; onOpen: (id: string) => void }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">Nobody needs a message today. 🎉</p>
  }
  return (
    <ol className="divide-y divide-border/60">
      {items.map((item, i) => (
        <li key={item.client_id} className="flex items-start gap-2 sm:gap-3 py-2.5">
          <span className="w-5 text-right text-sm font-semibold text-muted-foreground tabular-nums pt-3">{i + 1}</span>
          <button onClick={() => onOpen(item.client_id)} className="flex-1 min-w-0 min-h-[44px] text-left rounded-xl px-2 py-1.5 -my-1 hover:bg-muted/60 transition-colors">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold break-words">{item.name}</span>
              <HealthBadge health={item.health} />
            </span>
            <span className="block text-sm text-muted-foreground mt-0.5 break-words">{item.reasons.join(' · ')}</span>
          </button>
          <QuickContacted item={item} />
        </li>
      ))}
    </ol>
  )
}

// ── Health board ────────────────────────────────────────────────────────────

function ClientCard({ c, onOpen }: { c: HealthCard; onOpen: (id: string) => void }) {
  const days = daysLeftLabel(c.days_left_on_contract)
  const shown = c.reasons.slice(0, 3)
  return (
    <button
      onClick={() => onOpen(c.client_id)}
      className="w-full text-left rounded-xl border border-border bg-background p-3 min-h-[44px] hover:border-primary/40 hover:shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="font-semibold leading-snug break-words min-w-0">{c.name}</span>
        {days && (
          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full bg-muted whitespace-nowrap',
            (c.days_left_on_contract ?? 99) <= 30 ? 'text-foreground ring-1 ring-amber-500/40' : 'text-muted-foreground')}>
            {days}
          </span>
        )}
      </span>
      <span className="block mt-1.5 space-y-0.5 text-sm text-muted-foreground">
        {shown.map((r) => <span key={r} className="block break-words">{r}</span>)}
        {c.reasons.length > shown.length && <span className="block text-xs">+{c.reasons.length - shown.length} more</span>}
      </span>
    </button>
  )
}

function HealthBoard({ board, onOpen }: { board: CareOverview['health_board']; onOpen: (id: string) => void }) {
  const groups: Health[] = ['at_risk', 'needs_attention', 'healthy']
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {groups.map((h) => (
        <div key={h} className="min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={cn('w-2.5 h-2.5 rounded-full', HEALTH_META[h].dot)} aria-hidden />
            <h4 className="text-sm font-semibold">{HEALTH_META[h].label}</h4>
            <span className="text-sm text-muted-foreground">{board[h].length}</span>
          </div>
          {board[h].length === 0
            ? <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border p-3">No clients</p>
            : <div className="space-y-2">{board[h].map((c) => <ClientCard key={c.client_id} c={c} onOpen={onOpen} />)}</div>}
        </div>
      ))}
    </div>
  )
}

// ── Output rate ─────────────────────────────────────────────────────────────

const fmt = (n: number | null, suffix = '') => (n == null ? '—' : `${n}${suffix}`)

function StatTile({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className={cn('rounded-xl bg-muted/50 p-3 min-w-0', className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-heading font-semibold tabular-nums mt-0.5">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

function OutputBlock({ output }: { output: CareOverview['output_rate'] }) {
  const a: OutputRate = output.agency
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
        <StatTile label="Videos delivered" value={String(a.delivered)} sub={`last ${a.window_days} days`} />
        <StatTile label="Per day" value={String(a.per_day)} />
        <StatTile label="Per week" value={String(a.per_week)} />
        <StatTile label="Avg turnaround" value={fmt(a.avg_turnaround_days, ' d')} sub="request → first version" />
        {/* 5th tile spans the row on phones so it isn't left alone in half a row. */}
        <StatTile label="On time" value={fmt(a.on_time_pct, '%')} sub={`${a.deadlines_met} met · ${a.deadlines_missed} missed`} className="col-span-2 sm:col-span-1" />
      </div>

      <h4 className="text-sm font-semibold mt-5 mb-2">Per client</h4>
      {/* Desktop: table. Mobile: stacked cards (no horizontal scrolling). */}
      <table className="hidden md:table w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b border-border">
            <th className="py-2 pr-3 font-medium">Client</th>
            <th className="py-2 px-3 font-medium text-right">Delivered</th>
            <th className="py-2 px-3 font-medium text-right">Per week</th>
            <th className="py-2 px-3 font-medium text-right">Avg turnaround</th>
            <th className="py-2 pl-3 font-medium text-right">On time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {output.per_client.map((c) => (
            <tr key={c.client_id}>
              <td className="py-2 pr-3 font-medium">{c.name}</td>
              <td className="py-2 px-3 text-right tabular-nums">{c.delivered}</td>
              <td className="py-2 px-3 text-right tabular-nums">{c.per_week}</td>
              <td className="py-2 px-3 text-right tabular-nums">{fmt(c.avg_turnaround_days, ' d')}</td>
              <td className="py-2 pl-3 text-right tabular-nums">{fmt(c.on_time_pct, '%')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="md:hidden divide-y divide-border/60">
        {output.per_client.map((c) => (
          <li key={c.client_id} className="py-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold break-words min-w-0">{c.name}</span>
              <span className="text-sm tabular-nums whitespace-nowrap">{c.delivered} delivered</span>
            </div>
            <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
              {c.per_week}/week · turnaround {fmt(c.avg_turnaround_days, ' d')} · on time {fmt(c.on_time_pct, '%')}
            </p>
          </li>
        ))}
      </ul>
    </>
  )
}

// ── Renewals ────────────────────────────────────────────────────────────────

function countdown(days: number | null): string {
  if (days == null) return '—'
  if (days < 0) return `Ended ${-days} day${days === -1 ? '' : 's'} ago`
  if (days === 0) return 'Ends today'
  return `${days} day${days === 1 ? '' : 's'} left`
}

function RenewalStatusPill({ status }: { status: RenewalStatus }) {
  return (
    <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap',
      status === 'renewed' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
        : status === 'declined' ? 'bg-muted text-muted-foreground line-through'
          : status === 'discussed' ? 'bg-primary/10 text-primary'
            : 'bg-muted text-foreground')}>
      {RENEWAL_LABEL[status]}
    </span>
  )
}

function Renewals({ rows, onOpen }: { rows: CareOverview['renewals']; onOpen: (id: string) => void }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No contract end dates set yet.</p>
  return (
    <>
      <table className="hidden md:table w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b border-border">
            <th className="py-2 pr-3 font-medium">Client</th>
            <th className="py-2 px-3 font-medium">Contract ends</th>
            <th className="py-2 px-3 font-medium">Countdown</th>
            <th className="py-2 pl-3 font-medium">Renewal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((r) => (
            <tr key={r.client_id} onClick={() => onOpen(r.client_id)} className="cursor-pointer hover:bg-muted/50">
              <td className="pr-3 font-medium">
                <button onClick={(e) => { e.stopPropagation(); onOpen(r.client_id) }} className="min-h-[44px] w-full text-left hover:underline">{r.name}</button>
              </td>
              <td className="py-2 px-3 tabular-nums">{format(new Date(`${r.contract_end.slice(0, 10)}T12:00:00Z`), 'd MMM yyyy')}</td>
              <td className={cn('py-2 px-3 tabular-nums', (r.days_left ?? 99) <= 30 && r.renewal_status !== 'renewed' && 'font-semibold')}>{countdown(r.days_left)}</td>
              <td className="py-2 pl-3"><RenewalStatusPill status={r.renewal_status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="md:hidden space-y-2">
        {rows.map((r) => (
          <button key={r.client_id} onClick={() => onOpen(r.client_id)} className="w-full text-left rounded-xl border border-border p-3 flex items-start justify-between gap-3 min-h-[44px] hover:border-primary/40">
            <span className="min-w-0">
              <span className="block font-semibold break-words">{r.name}</span>
              <span className={cn('block text-sm text-muted-foreground', (r.days_left ?? 99) <= 30 && r.renewal_status !== 'renewed' && 'text-foreground font-semibold')}>
                {countdown(r.days_left)} · {format(new Date(`${r.contract_end.slice(0, 10)}T12:00:00Z`), 'd MMM yyyy')}
              </span>
            </span>
            <RenewalStatusPill status={r.renewal_status} />
          </button>
        ))}
      </div>
    </>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function AdminClientCare() {
  const { data, isLoading, error, refetch, isFetching } = useCareOverview()
  // The open client lives in the URL (?client=…), so the phone's Back button
  // closes the full-screen panel and a panel can be linked/bookmarked.
  const [params, setParams] = useSearchParams()
  const openClient = params.get('client')
  const open = useCallback((id: string) => setParams({ client: id }), [setParams])
  const close = useCallback(() => setParams({}), [setParams])

  return (
    <AdminLayout>
      <main className="px-4 md:px-6 py-6 md:py-8 space-y-4 md:space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-heading font-semibold tracking-tight">Client Care</h2>
            <p className="text-muted-foreground text-sm mt-0.5">
              Who to contact, how every client is doing, and how fast we deliver.
              {data && <> · Updated {format(new Date(data.generated_at), 'HH:mm')}</>}
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="min-h-[44px] px-4 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
        ) : error ? (
          <div className="clay-card p-5 text-sm">
            <p className="font-semibold">Couldn't load Client Care</p>
            <p className="text-muted-foreground mt-1">{(error as Error).message}</p>
          </div>
        ) : data ? (
          // Phone/tablet: Text today → Health board → Output rate → Renewals.
          // Wide desktop: Text today and Output rate side by side on top.
          <div className="grid gap-4 md:gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Section title="Text today" count={data.text_today.length} hint="Most urgent first" className="order-1">
              <TextToday items={data.text_today} onOpen={open} />
            </Section>
            <Section title="Output rate" hint={`Last ${data.output_rate.agency.window_days} days`} className="order-3 xl:order-2">
              <OutputBlock output={data.output_rate} />
            </Section>
            <Section title="Health board" hint="Tap a client for details" className="order-2 xl:order-3 xl:col-span-2">
              <HealthBoard board={data.health_board} onOpen={open} />
            </Section>
            <Section title="Renewal tracker" count={data.renewals.length} hint="Soonest first" className="order-4 xl:col-span-2">
              <Renewals rows={data.renewals} onOpen={open} />
            </Section>
          </div>
        ) : null}
      </main>
      {openClient && <ClientCarePanel clientId={openClient} onClose={close} />}
    </AdminLayout>
  )
}
