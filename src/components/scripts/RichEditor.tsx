import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Ms } from '@/components/ds'
import { cn } from '@/lib/utils'
import type { SaveResult } from '@/hooks/useScripts'
import type { Script, ScriptField } from '@/types/scripts'

// Script text editing: bold / italic / underline (buttons, or Ctrl+B/I/U)
// and line breaks, autosaved about a second after typing stops. The server
// cleans everything (api/_helpers/scripts/richtext.ts).
//
// Two people editing: each save says which version it started from. If the
// other person saved in between, a bar offers "Load theirs" / "Keep mine"
// instead of silently overwriting. While not typing, their saved changes
// simply appear.

const SAVE_DELAY = 900

/** One editable area. Uncontrolled: `revision` changing re-applies `html`. */
function RichArea({ html, revision, onInput, readOnly, placeholder, areaRef, onSelect, compact }: {
  html: string; revision: number; onInput: (html: string) => void; readOnly?: boolean; placeholder?: string
  areaRef?: (el: HTMLDivElement | null) => void; onSelect?: () => void; compact?: boolean
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => { if (ref.current && ref.current.innerHTML !== html) ref.current.innerHTML = html }, [revision]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div
      ref={(el) => { ref.current = el; areaRef?.(el) }}
      className={cn('ds-rich', compact && 'compact')}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      data-placeholder={placeholder}
      onInput={(e) => onInput((e.currentTarget as HTMLDivElement).innerHTML)}
      onMouseUp={onSelect}
      onKeyUp={onSelect}
      onPaste={(e) => {
        // Paste as plain text: no foreign formatting comes in.
        e.preventDefault()
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
      }}
    />
  )
}

function Toolbar() {
  const btn = (cmd: string, icon: string, label: string) => (
    <button key={cmd} type="button" aria-label={label} title={`${label} (Ctrl+${label[0]})`} className="ds-rich-btn"
      onMouseDown={(e) => { e.preventDefault(); document.execCommand(cmd) }}>
      <Ms name={icon} style={{ fontSize: 18, width: 18, color: 'inherit' }} />
    </button>
  )
  return <div className="flex items-center gap-1">{btn('bold', 'format_bold', 'Bold')}{btn('italic', 'format_italic', 'Italic')}{btn('underline', 'format_underlined', 'Underline')}</div>
}

type Value = string | string[]
const valueOf = (s: Script, field: ScriptField, carousel: boolean): Value =>
  field === 'notes' ? s.notesHtml
    : field === 'caption' ? s.captionHtml
    : field === 'client_notes' ? s.clientNotesHtml
    : carousel ? (s.slides?.length ? s.slides : ['']) : s.bodyHtml
const versionOf = (s: Script, field: ScriptField) =>
  ({ script: s.bodyVersion, caption: s.captionVersion, client_notes: s.clientNotesVersion, notes: s.notesVersion })[field]
const PLACEHOLDER: Record<ScriptField, string> = {
  script: 'Write the script…',
  caption: 'Caption…',
  client_notes: 'Notes for the client…',
  notes: 'B-roll, captions, pacing…',
}
const same = (a: Value, b: Value) => JSON.stringify(a) === JSON.stringify(b)

export function FieldEditor({ script, field, canEdit, save, toolbarRight, onAreaSelect, label, compact }: {
  script: Script
  field: ScriptField
  /** Section heading shown left of the toolbar ("Caption", …). */
  label?: string
  /** Shorter box (caption and notes). */
  compact?: boolean
  canEdit: boolean
  save: (value: { html?: string; slides?: string[] }, baseVersion: number, force?: boolean) => Promise<SaveResult>
  /** Extra controls next to B / I / U (e.g. "Comment"). */
  toolbarRight?: React.ReactNode
  /** Selection changed inside an area (comments use it). */
  onAreaSelect?: () => void
}) {
  const carousel = field === 'script' && script.type === 'Carousel'
  const value = useRef<Value>(valueOf(script, field, carousel))
  const base = useRef(versionOf(script, field))
  const dirty = useRef(false)
  const timer = useRef<number | undefined>()
  const inFlight = useRef(false)
  const [revision, setRevision] = useState(0)
  const [slideCount, setSlideCount] = useState(Array.isArray(value.current) ? value.current.length : 1)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [conflict, setConflictState] = useState<Script | null>(null)
  // Read inside timers/async code, so it must always be current.
  const conflictRef = useRef<Script | null>(null)
  const setConflict = (c: Script | null) => { conflictRef.current = c; setConflictState(c) }

  const apply = useCallback((v: Value, version: number) => {
    value.current = v
    base.current = version
    dirty.current = false
    if (Array.isArray(v)) setSlideCount(v.length)
    setRevision((r) => r + 1)
  }, [])

  // The other person's saved changes: take them in while not editing.
  const serverVersion = versionOf(script, field)
  useEffect(() => {
    if (serverVersion > base.current && !dirty.current && !inFlight.current && !conflictRef.current) apply(valueOf(script, field, carousel), serverVersion)
  }, [serverVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  // Type switched (Reel ↔ Carousel): reload this field.
  useEffect(() => { apply(valueOf(script, field, carousel), versionOf(script, field)) }, [carousel]) // eslint-disable-line react-hooks/exhaustive-deps

  const flush = useCallback(async (force = false) => {
    window.clearTimeout(timer.current)
    if ((!dirty.current && !force) || inFlight.current) return
    inFlight.current = true
    const sent = value.current
    setState('saving')
    try {
      const r = await save(Array.isArray(sent) ? { slides: sent } : { html: sent }, base.current, force)
      if (r.ok) {
        base.current = versionOf(r.script, field)
        if (same(sent, value.current)) dirty.current = false
        setState('saved')
        setConflict(null)
      } else {
        setConflict(r.latest)
        setState('idle')
      }
    } catch {
      setState('error')
    } finally {
      inFlight.current = false
      // Typed again while saving: save that too.
      if (dirty.current && !conflictRef.current) timer.current = window.setTimeout(() => flush(), SAVE_DELAY)
    }
  }, [save, field])

  const changed = (v: Value) => {
    value.current = v
    dirty.current = true
    setState('idle')
    window.clearTimeout(timer.current)
    if (!conflictRef.current) timer.current = window.setTimeout(() => flush(), SAVE_DELAY)
  }

  // Leaving the page: save what's pending.
  useEffect(() => () => { if (dirty.current && !conflictRef.current) void flush() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setSlide = (i: number, html: string) => {
    const next = [...(value.current as string[])]
    next[i] = html
    changed(next)
  }
  const addSlide = () => { const next = [...(value.current as string[]), '']; changed(next); setSlideCount(next.length); setRevision((r) => r + 1) }
  const removeSlide = (i: number) => {
    const next = (value.current as string[]).filter((_, j) => j !== i)
    changed(next.length ? next : [''])
    setSlideCount(Math.max(1, next.length))
    setRevision((r) => r + 1)
  }

  const slides = Array.isArray(value.current) ? (value.current as string[]) : null
  return (
    <div>
      {(canEdit || label) && (
        <div className="flex items-center gap-2 mb-1.5">
          {label && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--strong)' }}>{label}</span>}
          <span className="tabular-nums" style={{ fontSize: 12, color: state === 'error' ? 'var(--bad, #dc2626)' : 'var(--faint)' }}>
            {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : state === 'error' ? 'Not saved' : ''}
          </span>
          <div className="flex-1" />
          {toolbarRight}
          {canEdit && <Toolbar />}
        </div>
      )}

      {conflict && (
        <div className="ds-rich-conflict" role="alert">
          <span className="flex-1 min-w-0">Changed by {conflict.updatedBy?.name ?? 'someone'} {formatDistanceToNow(new Date(conflict.updatedAt), { addSuffix: true })}</span>
          <button type="button" className="ds-ghost-btn" style={{ height: 32 }} onClick={() => { setConflict(null); apply(valueOf(conflict, field, carousel), versionOf(conflict, field)); setState('idle') }}>Load theirs</button>
          <button type="button" className="ds-primary" style={{ height: 32, paddingLeft: 12 }} onClick={() => { setConflict(null); dirty.current = true; void flush(true) }}>Keep mine</button>
        </div>
      )}

      {slides ? (
        <div className="space-y-3">
          {Array.from({ length: slideCount }, (_, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-1">
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--soft-text)' }}>Slide {i + 1}</span>
                {canEdit && slideCount > 1 && (
                  <button type="button" aria-label={`Remove slide ${i + 1}`} className="ds-ibtn" style={{ width: 30, height: 30 }} onClick={() => removeSlide(i)}>
                    <Ms name="close" style={{ fontSize: 16, width: 16 }} />
                  </button>
                )}
              </div>
              <RichArea html={slides[i] ?? ''} revision={revision} readOnly={!canEdit} onInput={(h) => setSlide(i, h)} onSelect={onAreaSelect} />
            </div>
          ))}
          {canEdit && (
            <button type="button" className="ds-ghost-btn inline-flex items-center gap-1.5" onClick={addSlide}>
              <Ms name="add" style={{ fontSize: 17, width: 17, color: 'inherit' }} />Add slide
            </button>
          )}
        </div>
      ) : (
        <RichArea html={value.current as string} revision={revision} readOnly={!canEdit} onInput={(h) => changed(h)} onSelect={onAreaSelect}
          placeholder={PLACEHOLDER[field]} compact={compact} />
      )}
      <span className={cn('sr-only')} aria-live="polite">{state === 'saved' ? 'Saved' : ''}</span>
    </div>
  )
}
