import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { AnswerValue, AskedQuestion, FileRef } from '@/types/onboarding'

// One answer field, by question type. `big` = the client's one-question
// screen; otherwise the compact team editor.

type Upload = (questionId: string, file: File, onProgress?: (pct: number) => void) => Promise<FileRef>

const fmtSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

export function AnswerInput({ q, value, onChange, upload, big }: {
  q: AskedQuestion
  value: AnswerValue
  onChange: (v: AnswerValue) => void
  upload: Upload
  big?: boolean
}) {
  const field = cn('w-full rounded-xl border border-border bg-background px-3 focus:outline-none focus:ring-2 focus:ring-primary/30',
    big ? 'text-base min-h-[52px]' : 'text-sm min-h-[44px]')

  if (q.type === 'text') {
    return <textarea className={cn(field, 'py-3 resize-y')} rows={big ? 7 : 4} value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value)} autoFocus={big} aria-label={q.text} />
  }
  if (q.type === 'short_text') {
    return <input className={field} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} autoFocus={big} aria-label={q.text} />
  }
  if (q.type === 'choice') return <Choice q={q} value={(value as string) ?? null} onChange={onChange} field={field} big={big} />
  if (q.type === 'link') return <Links value={(value as string[]) ?? []} onChange={onChange} field={field} big={big} />
  return <Files q={q} value={(value as FileRef[]) ?? []} onChange={onChange} upload={upload} big={big} />
}

function Choice({ q, value, onChange, field, big }: { q: AskedQuestion; value: string | null; onChange: (v: AnswerValue) => void; field: string; big?: boolean }) {
  const hasOther = q.options.includes('Other')
  // A value that isn't one of the options is the text typed for "Other".
  const picked = value == null ? null : q.options.includes(value) ? value : hasOther ? 'Other' : value
  const otherText = picked === 'Other' && value !== 'Other' ? value ?? '' : ''
  return (
    <div className="space-y-3">
      <div className={cn('grid gap-2', big ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3')} role="radiogroup" aria-label={q.text}>
        {q.options.map((o) => (
          <button key={o} type="button" role="radio" aria-checked={picked === o} onClick={() => onChange(o)}
            className={cn('min-h-[48px] px-4 rounded-xl border text-left transition-colors', big ? 'text-base' : 'text-sm',
              picked === o ? 'border-primary bg-primary/10 font-semibold' : 'border-border hover:bg-muted')}>
            {o}
          </button>
        ))}
      </div>
      {picked === 'Other' && (
        <input className={field} value={otherText} onChange={(e) => onChange(e.target.value || 'Other')} autoFocus aria-label="Other" />
      )}
    </div>
  )
}

function Links({ value, onChange, field, big }: { value: string[]; onChange: (v: AnswerValue) => void; field: string; big?: boolean }) {
  // Always one empty row to type the next link into.
  const rows = [...value, '']
  const set = (i: number, v: string) => {
    const next = [...value]
    if (i === value.length) next.push(v); else next[i] = v
    onChange(next.filter((x, j) => x !== '' || j === i))
  }
  return (
    <div className="space-y-2">
      {rows.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <input className={field} type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={l} onChange={(e) => set(i, e.target.value)}
            autoFocus={big && i === 0} aria-label={`Link ${i + 1}`} />
          {i < value.length ? (
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove"
              className="w-11 h-11 flex-shrink-0 rounded-xl text-muted-foreground hover:bg-muted">×</button>
          ) : <span className="w-11 flex-shrink-0" />}
        </div>
      ))}
    </div>
  )
}

function Files({ q, value, onChange, upload, big }: { q: AskedQuestion; value: FileRef[]; onChange: (v: AnswerValue) => void; upload: Upload; big?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<{ name: string; pct: number } | null>(null)
  const add = async (files: FileList | null) => {
    if (!files?.length) return
    let next = value
    for (const f of Array.from(files)) {
      setBusy({ name: f.name, pct: 0 })
      try {
        next = [...next, await upload(q.id, f, (pct) => setBusy({ name: f.name, pct }))]
        onChange(next)
      } catch (e) { toast.error((e as Error).message) }
    }
    setBusy(null)
    if (input.current) input.current.value = ''
  }
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="divide-y divide-border/60 rounded-xl border border-border">
          {value.map((f) => (
            <li key={f.key} className="flex items-center gap-2 pl-3">
              {f.url
                ? <a href={f.url} className="flex-1 min-w-0 truncate text-sm text-primary hover:underline py-2">{f.name}</a>
                : <span className="flex-1 min-w-0 truncate text-sm py-2">{f.name}</span>}
              <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{fmtSize(f.size)}</span>
              <button type="button" onClick={() => onChange(value.filter((x) => x.key !== f.key))} aria-label={`Remove ${f.name}`}
                className="w-11 h-11 flex-shrink-0 rounded-xl text-muted-foreground hover:bg-muted">×</button>
            </li>
          ))}
        </ul>
      )}
      {busy && (
        <div className="text-sm">
          <div className="flex justify-between gap-2"><span className="truncate">{busy.name}</span><span className="tabular-nums">{busy.pct}%</span></div>
          <div className="h-1 rounded-full bg-muted mt-1 overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${busy.pct}%` }} /></div>
        </div>
      )}
      <input ref={input} type="file" multiple className="hidden" onChange={(e) => add(e.target.files)} />
      <button type="button" disabled={!!busy} onClick={() => input.current?.click()}
        className={cn('w-full rounded-xl border-2 border-dashed border-border hover:bg-muted disabled:opacity-50', big ? 'min-h-[96px] text-base' : 'min-h-[44px] text-sm')}>
        + Files
      </button>
    </div>
  )
}
