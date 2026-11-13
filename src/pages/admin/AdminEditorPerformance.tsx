import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ClientMark, EditorAvatar, Ms } from '@/components/ds'
import { editorColor } from '@/lib/dsColors'
import { cn } from '@/lib/utils'
import type { EditorPerformance, PerfStats } from '@/types/editors'

// Editor Performance — the "Editors" tab of Analytics (follows its period
// bar). Every number is computed by the API (api/_helpers/care/editors.ts)
// with the same definitions as Client Care.
//
// One team table (labels once, a row per editor; a row opens that editor's
// revision breakdown) and "Who edits each client" (bars in each editor's
// avatar colour, % written under each part). Nothing is hidden for good.

const fmt = (n: number | null, suffix = '') => (n == null ? '—' : `${n}${suffix}`)
type Editor = EditorPerformance['editors'][number]
type Split = EditorPerformance['client_split']

const COLS = 'md:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,0.8fr))_minmax(0,1.3fr)_28px]'

/** Revision reasons of one editor: labelled bars, count and % written out. */
function CategoryBars({ stats, labels }: { stats: PerfStats; labels: Record<string, string> }) {
  if (!stats.top_categories.length) return <p style={{ fontSize: 13, color: 'var(--faint)' }}>—</p>
  return (
    <ul className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
      {stats.top_categories.slice(0, 4).map((c) => (
        <li key={c.category} className="grid grid-cols-[6.5rem_minmax(0,1fr)_4.5rem] items-center gap-3" style={{ fontSize: 13 }}>
          <span className="truncate">{labels[c.category] ?? c.category}</span>
          <span className="ds-track" aria-hidden><i style={{ width: `${Math.max(c.share, 3)}%` }} /></span>
          <span className="text-right tabular-nums" style={{ color: 'var(--faint)' }}>{c.count} · {c.share}%</span>
        </li>
      ))}
    </ul>
  )
}

function Num({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="md:hidden" style={{ fontSize: 11.5, color: 'var(--faint)' }}>{label}</p>
      <p className="tabular-nums" style={{ fontSize: 15, fontWeight: 600, color: 'var(--strong)' }}>{value}</p>
    </div>
  )
}

function EditorRow({ e, labels, open, onToggle, i }: { e: Editor; labels: Record<string, string>; open: boolean; onToggle: () => void; i: number }) {
  const t = e.totals
  const top = t.top_categories[0]
  return (
    <li className="ds-erow" style={{ animationDelay: `${80 + i * 50}ms` }}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className={cn('grid w-full grid-cols-4 gap-x-3 gap-y-3 items-center text-left md:gap-x-4', COLS)}>
        <div className="col-span-4 md:col-span-1 flex items-center gap-3 min-w-0">
          <EditorAvatar name={e.name} size={30} />
          <div className="min-w-0">
            <p className="truncate" style={{ fontSize: 14, fontWeight: 600, color: 'var(--strong)' }}>
              {e.name}{e.disabled && <span style={{ fontWeight: 400, color: 'var(--faint)' }}> (disabled)</span>}
            </p>
            <p className="capitalize" style={{ fontSize: 12, color: 'var(--faint)' }}>{e.team_role}</p>
          </div>
        </div>
        <Num label="Videos" value={t.videos} />
        <Num label="Revisions / video" value={fmt(t.revisions_per_video)} />
        <Num label="Turnaround" value={fmt(t.avg_turnaround_days, ' d')} />
        <div className="min-w-0">
          <p className="md:hidden" style={{ fontSize: 11.5, color: 'var(--faint)' }}>On time</p>
          <p className="tabular-nums" style={{ fontSize: 15, fontWeight: 600, color: 'var(--strong)' }}>{fmt(t.on_time_pct, '%')}</p>
          {t.on_time_pct != null && <span className="ds-track block mt-1.5" style={{ maxWidth: 72 }} aria-hidden><i style={{ width: `${t.on_time_pct}%` }} /></span>}
        </div>
        <div className="col-span-3 md:col-span-1 min-w-0" style={{ fontSize: 13 }}>
          <span className="tabular-nums" style={{ fontWeight: 600, color: 'var(--strong)' }}>{t.revision_notes}</span>
          <span style={{ color: 'var(--faint)' }}> revision{t.revision_notes === 1 ? '' : 's'}</span>
          {top && <p className="truncate" style={{ color: 'var(--faint)', fontSize: 12 }}>Mostly {(labels[top.category] ?? top.category).toLowerCase()} · {top.share}%</p>}
        </div>
        <Ms name="expand_more" className="justify-self-end" style={{ transition: 'transform .35s cubic-bezier(.34,1.4,.64,1)', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div className="ds-erow-more">
          <CategoryBars stats={t} labels={labels} />
        </div>
      )}
    </li>
  )
}

// ── Who edits each client ───────────────────────────────────────────────────

function ClientSplit({ split }: { split: Split }) {
  const [all, setAll] = useState(false)
  const names = Object.fromEntries(split.legend.map((l) => [l.key, l.name]))
  const color = (key: string) => key === 'other' ? 'var(--dash)' : key === 'unassigned' ? 'var(--track)' : editorColor(names[key] ?? key)
  if (!split.clients.length) return <p style={{ fontSize: 13, color: 'var(--faint)' }}>—</p>
  const shown = all ? split.clients : split.clients.slice(0, 10)
  return (
    <>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 mb-5" style={{ fontSize: 13 }}>
        {split.legend.map((l) => (
          <li key={l.key} className="flex items-center gap-2">
            {l.key === 'other' || l.key === 'unassigned'
              ? <span className="w-2.5 h-2.5 rounded-full" style={{ background: color(l.key) }} aria-hidden />
              : <EditorAvatar name={l.name} size={20} />}
            {l.name}
          </li>
        ))}
      </ul>

      <ul className="grid gap-x-12 gap-y-5 lg:grid-cols-2">
        {shown.map((c) => {
          const parts = c.split.filter((s) => s.share > 0)
          const label = parts.map((s) => `${names[s.key]} ${s.share}%`).join(', ')
          return (
            <li key={c.client_id} className="min-w-0">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="flex items-center gap-2.5 min-w-0">
                  <ClientMark name={c.name} size={20} />
                  <span className="truncate" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--strong)' }}>{c.name}</span>
                </span>
                <span className="tabular-nums whitespace-nowrap" style={{ fontSize: 12, color: 'var(--faint)' }}>{c.videos} video{c.videos === 1 ? '' : 's'}</span>
              </div>
              <div className="flex gap-[3px]" role="img" aria-label={`${c.name}: ${label}`}>
                {parts.map((s) => (
                  <span key={s.key} className="h-2 rounded-full" style={{ width: `${s.share}%`, background: color(s.key) }}
                    title={`${names[s.key]}: ${s.videos} of ${c.videos} video${c.videos === 1 ? '' : 's'} (${s.share}%)`} />
                ))}
              </div>
              {/* The % of each part, under it (tiny parts: in the tooltip). */}
              <div className="flex gap-[3px] mt-1.5" aria-hidden>
                {parts.map((s) => (
                  <span key={s.key} className="tabular-nums truncate" style={{ width: `${s.share}%`, fontSize: 11, color: 'var(--faint)' }}>
                    {s.share >= 10 ? `${s.share}%` : ''}
                  </span>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
      {split.clients.length > 10 && (
        <button onClick={() => setAll((a) => !a)} className="ds-ghost-btn mt-5">
          {all ? 'Show fewer' : `Show all ${split.clients.length} clients`}
        </button>
      )}
    </>
  )
}

/** The Editors tab of Analytics: the team table + who edits each client. */
export function EditorsPanel({ data }: { data: EditorPerformance }) {
  const labels = Object.fromEntries(data.categories.map((c) => [c.key, c.label]))
  const [open, setOpen] = useState<string | null>(null)
  if (!data.editors.length) return <div className="ds-panel" style={{ fontSize: 13, color: 'var(--faint)' }}>—</div>
  return (
    <div className="space-y-4">
      <section className="ds-panel" style={{ padding: '6px 8px' }}>
        <div className={cn('hidden md:grid gap-x-4 px-3 pt-3 pb-2', COLS)} style={{ fontSize: 11.5, color: 'var(--faint)' }}>
          <span>Editor</span><span>Videos</span><span>Revisions / video</span><span>Turnaround</span><span>On time</span><span>Revisions</span><span />
        </div>
        <ul>
          {data.editors.map((e, i) => (
            <EditorRow key={e.editor_id} e={e} i={i} labels={labels} open={open === e.editor_id} onToggle={() => setOpen(open === e.editor_id ? null : e.editor_id)} />
          ))}
        </ul>
      </section>
      <section className="ds-panel" style={{ padding: '18px 20px 20px', animationDelay: '120ms' }}>
        <div className="ds-panel-head" style={{ marginBottom: 12 }}><h2>Who edits each client</h2></div>
        <ClientSplit split={data.client_split} />
      </section>
    </div>
  )
}

/** Old address (/admin/editors) → the Editors tab of Analytics. */
export default function AdminEditorPerformance() {
  return <Navigate to="/admin/analytics?tab=editors" replace />
}
