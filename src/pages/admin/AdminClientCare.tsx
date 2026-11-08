import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format, isToday } from 'date-fns'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { ClientCarePanel } from '@/components/care/ClientCarePanel'
import { HealthBadge } from '@/components/care/HealthBadge'
import { HEALTH_META } from '@/components/care/healthMeta'
import { useCareOverview, useMarkContacted, useUndoContact } from '@/hooks/useCare'
import { cn } from '@/lib/utils'
import type { CareOverview, Health, HealthCard, RenewalStatus } from '@/types/care'

// Client Care (admin-only). Compact: most of it fits on one screen.
// Labels and numbers only.

const RENEWAL_LABEL: Record<RenewalStatus, string> = {
  not_discussed: 'Not discussed',
  discussed: 'Discussed',
  renewed: 'Renewed',
  declined: 'Declined',
}

const fmt = (n: number | null, suffix = '') => (n == null ? '—' : `${n}${suffix}`)
const day = (d: string) => format(new Date(`${d.slice(0, 10)}T12:00:00Z`), 'd MMM yyyy')

function daysLeft(days: number | null): string | null {
  if (days == null) return null
  if (days < 0) return `Ended ${-days}d ago`
  if (days === 0) return 'Ends today'
  return `${days}d left`
}

function Section({ title, count, children, className, action }: { title: string; count?: number; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={cn('clay-card p-4 md:p-5 min-w-0', className)}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="font-heading font-semibold">
          {title}
          {count != null && <span className="ml-2 text-sm font-medium text-muted-foreground">{count}</span>}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}

// ── Text today ──────────────────────────────────────────────────────────────

function QuickContacted({ item }: { item: CareOverview['text_today'][number] }) {
  const mark = useMarkContacted()
  const undo = useUndoContact()
  const done = !!item.last_contact_at && isToday(new Date(item.last_contact_at))
  const tick = () => mark.mutate(item.client_id, {
    onSuccess: (detail) => toast.success(item.name, { action: { label: 'Undo', onClick: () => undo.mutate(detail.contacts[0].id) } }),
    onError: (e) => toast.error((e as Error).message),
  })
  return (
    <button
      onClick={tick}
      disabled={done || mark.isPending}
      className={cn(
        'min-h-[44px] px-3 rounded-xl text-sm font-medium whitespace-nowrap flex-shrink-0 transition-colors',
        done ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border border-border hover:bg-muted disabled:opacity-60',
      )}
    >
      {done ? '✓ Contacted' : 'Contacted'}
    </button>
  )
}

function TextToday({ items, onOpen }: { items: CareOverview['text_today']; onOpen: (id: string) => void }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">—</p>
  return (
    <ol className="divide-y divide-border/60 -my-1">
      {items.map((item) => (
        <li key={item.client_id} className="flex items-center gap-2 py-1.5">
          <button onClick={() => onOpen(item.client_id)} className="flex-1 min-w-0 min-h-[44px] text-left rounded-lg px-2 -mx-2 py-1 hover:bg-muted/60 transition-colors">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-sm font-semibold break-words">{item.name}</span>
              <HealthBadge health={item.health} />
            </span>
            <span className="block text-xs text-muted-foreground break-words">{item.reasons.join(' · ')}</span>
          </button>
          <QuickContacted item={item} />
        </li>
      ))}
    </ol>
  )
}

// ── Health board ────────────────────────────────────────────────────────────

function ClientCard({ c, onOpen }: { c: HealthCard; onOpen: (id: string) => void }) {
  const left = daysLeft(c.days_left_on_contract)
  return (
    <button
      onClick={() => onOpen(c.client_id)}
      className="w-full text-left rounded-lg border border-border bg-background px-3 py-1.5 min-h-[44px] hover:border-primary/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold truncate min-w-0">{c.name}</span>
        {left && (
          <span className={cn('text-xs tabular-nums whitespace-nowrap',
            (c.days_left_on_contract ?? 99) <= 30 ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
            {left}
          </span>
        )}
      </span>
      {c.instagram.length > 0 && (
        <span className="block text-xs text-pink-700 dark:text-pink-300 truncate">{c.instagram.map((h) => `@${h}`).join(' · ')}</span>
      )}
      {c.health !== 'healthy' && (
        <span className="block text-xs text-muted-foreground truncate">{c.reasons[0]}{c.reasons.length > 1 ? ` · +${c.reasons.length - 1}` : ''}</span>
      )}
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
            <span className={cn('w-2 h-2 rounded-full', HEALTH_META[h].dot)} aria-hidden />
            <h4 className="text-sm font-semibold">{HEALTH_META[h].label}</h4>
            <span className="text-sm text-muted-foreground tabular-nums">{board[h].length}</span>
          </div>
          {board[h].length === 0
            ? <p className="text-sm text-muted-foreground">—</p>
            : <div className="space-y-1">{board[h].map((c) => <ClientCard key={c.client_id} c={c} onOpen={onOpen} />)}</div>}
        </div>
      ))}
    </div>
  )
}

// ── Renewals ────────────────────────────────────────────────────────────────

function RenewalPill({ status }: { status: RenewalStatus }) {
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
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">—</p>
  return (
    <ul className="grid gap-x-8 md:grid-cols-2 xl:grid-cols-3 -my-1">
      {rows.map((r) => {
        const soon = (r.days_left ?? 99) <= 30 && r.renewal_status !== 'renewed'
        return (
          <li key={r.client_id} className="border-b border-border/60 last:border-0 md:[&:nth-last-child(-n+2)]:border-0 xl:[&:nth-last-child(-n+3)]:border-0">
            <button onClick={() => onOpen(r.client_id)} className="w-full min-h-[44px] py-1.5 flex items-center justify-between gap-3 text-left rounded-lg hover:bg-muted/50 px-2 -mx-2">
              <span className="min-w-0">
                <span className="block text-sm font-medium truncate">{r.name}</span>
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {r.contract_number ? `#${r.contract_number} · ` : ''}{day(r.contract_end)}
                </span>
              </span>
              <span className="flex items-center gap-3 flex-shrink-0">
                <span className={cn('text-xs tabular-nums whitespace-nowrap', soon ? 'font-semibold' : 'text-muted-foreground')}>{daysLeft(r.days_left) ?? '—'}</span>
                <RenewalPill status={r.renewal_status} />
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// ── Output rate ─────────────────────────────────────────────────────────────

function Output({ output }: { output: CareOverview['output_rate'] }) {
  const [byClient, setByClient] = useState(false)
  const a = output.agency
  const tiles: [string, string][] = [
    ['Delivered', String(a.delivered)],
    ['Per week', String(a.per_week)],
    ['Turnaround', fmt(a.avg_turnaround_days, ' d')],
    ['On time', fmt(a.on_time_pct, '%')],
  ]
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-muted/50 px-3 py-2 min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-heading font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <button
        role="switch"
        aria-checked={byClient}
        onClick={() => setByClient((v) => !v)}
        className={cn('mt-3 min-h-[44px] px-3 rounded-lg text-sm border', byClient ? 'border-primary text-primary bg-primary/5' : 'border-border hover:bg-muted')}
      >
        By client
      </button>
      {byClient && (
        <ul className="divide-y divide-border/60 mt-2">
          {output.per_client.map((c) => (
            <li key={c.client_id} className="py-1.5 text-sm flex items-baseline justify-between gap-3">
              <span className="font-medium break-words min-w-0">{c.name}</span>
              <span className="text-sm tabular-nums text-muted-foreground whitespace-nowrap">
                {c.delivered} · {fmt(c.avg_turnaround_days, ' d')} · {fmt(c.on_time_pct, '%')}
              </span>
            </li>
          ))}
        </ul>
      )}
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
      <main className="px-4 md:px-6 py-5 md:py-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-heading font-semibold tracking-tight">Client Care</h2>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Refresh"
            className="w-11 h-11 rounded-xl border border-border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-50 flex-shrink-0"
          >
            <svg className={cn('w-4 h-4', isFetching && 'animate-spin')} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
        ) : error ? (
          <div className="clay-card p-6 text-sm">{(error as Error).message}</div>
        ) : data ? (
          // Wide screens: Text today | Output side by side, then Health, then
          // Renewals in columns — most of the page fits on one screen.
          // Phones: Text today → Health → Output → Renewals, stacked.
          <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Section title="Text today" count={data.text_today.length} className="order-1">
              <TextToday items={data.text_today} onOpen={open} />
            </Section>
            <Section title={`Output · ${data.output_rate.agency.window_days} days`} className="order-3 xl:order-2">
              <Output output={data.output_rate} />
            </Section>
            <Section title="Health" className="order-2 xl:order-3 xl:col-span-2">
              <HealthBoard board={data.health_board} onOpen={open} />
            </Section>
            <Section title="Renewals" count={data.renewals.length} className="order-4 xl:col-span-2">
              <Renewals rows={data.renewals} onOpen={open} />
            </Section>
          </div>
        ) : null}
      </main>
      {openClient && <ClientCarePanel clientId={openClient} onClose={close} />}
    </AdminLayout>
  )
}
