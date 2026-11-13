import { useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useArchiveRule, useRecategorize } from '@/hooks/useCare'
import { Block } from '@/components/care/Block'
import { Switch } from '@/components/care/Switch'
import type { ClientCareDetail, RevisionCategory } from '@/types/care'

// The client's SOP rules (merged automatically from revision notes) and the
// revision backlog (every note, with an editable category). Which engine did
// the matching is still returned by the API (sop_engine) but not displayed.

const errMsg = (e: unknown) => (e as Error)?.message ?? 'Something went wrong'
const day = (d: string) => format(new Date(d), 'd MMM yyyy')

function CategoryPill({ label }: { label: string }) {
  return <span className="inline-block px-2 py-0.5 rounded-full ds-tag bg-primary/10 text-primary text-xs font-medium whitespace-nowrap">{label}</span>
}

export function SopRules({ detail, miro }: { detail: ClientCareDetail; miro: React.ReactNode }) {
  const archive = useArchiveRule()
  const labels = Object.fromEntries(detail.revision_categories.map((c) => [c.key, c.label]))
  const remove = (id: string, text: string) => {
    if (!confirm(`Remove “${text}”?`)) return
    archive.mutate(id, { onError: (e) => toast.error(errMsg(e)) })
  }
  return (
    <Block title={`SOPs · ${detail.sop_rules.length}`}>
      {detail.sop_rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-2">
          {detail.sop_rules.map((r) => (
            <li key={r.id} className="flex items-start gap-3 rounded-xl border border-border p-2.5">
              <span className="min-w-[2.75rem] h-11 rounded-xl bg-muted flex flex-col items-center justify-center flex-shrink-0" title={`Asked ${r.count} time${r.count === 1 ? '' : 's'}`}>
                <span className="text-base font-heading font-semibold tabular-nums leading-none">×{r.count}</span>
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm break-words">{r.text}</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-muted-foreground">
                  <CategoryPill label={labels[r.category] ?? r.category} />
                  <span>{day(r.last_seen)}</span>
                </span>
              </span>
              <button
                onClick={() => remove(r.id, r.text)}
                disabled={archive.isPending}
                aria-label={`Remove SOP rule: ${r.text}`}
                className="w-11 h-11 rounded-xl flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0 disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">{miro}</div>
    </Block>
  )
}

export function RevisionBacklog({ detail }: { detail: ClientCareDetail }) {
  const recategorize = useRecategorize()
  const [openOnly, setOpenOnly] = useState(false)
  const [all, setAll] = useState(false)
  const entries = openOnly ? detail.revision_backlog.filter((e) => e.resolved !== true) : detail.revision_backlog
  const shown = all ? entries : entries.slice(0, 5)

  const change = (entryId: string, category: RevisionCategory) => recategorize.mutate(
    { entryId, category },
    { onError: (e) => toast.error(errMsg(e)) },
  )

  return (
    <Block
      title={`Revisions · ${detail.revision_backlog.length}`}
      action={detail.revision_backlog.length > 0 && <Switch checked={openOnly} onChange={setOpenOnly} label="Open only" />}
    >
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {shown.map((e) => (
            <li key={e.id} className="py-3">
              <p className="text-sm break-words">
                {e.resolved === true && <span className="text-emerald-600 dark:text-emerald-400 font-semibold mr-1" aria-label="Done">✓</span>}
                {e.note}
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="sr-only">Category</span>
                  <select
                    value={e.category}
                    disabled={recategorize.isPending}
                    onChange={(ev) => change(e.id, ev.target.value as RevisionCategory)}
                    className="min-h-[44px] rounded-xl border border-border bg-background px-2.5 text-sm text-foreground"
                  >
                    {detail.revision_categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </label>
                <span className="text-xs text-muted-foreground sm:ml-auto break-words">
                  {day(e.created_at)}
                  {' · '}{e.project_title}
                  {e.editor_name && ` · ${e.editor_name}`}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {entries.length > 8 && (
        <button onClick={() => setAll((a) => !a)} className="mt-1 min-h-[44px] px-3 rounded-xl text-sm text-primary hover:bg-primary/5">
          {all ? 'Less' : `All ${entries.length}`}
        </button>
      )}
    </Block>
  )
}
