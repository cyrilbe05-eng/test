import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Ms } from '@/components/ds'
import { FieldEditor } from '@/components/scripts/RichEditor'
import { SCRIPT_STATUS, SCRIPT_TYPES } from '@/lib/scriptStatus'
import type { useScriptActions } from '@/hooks/useScripts'
import type { Script, ScriptField, ScriptType } from '@/types/scripts'

// One script, as a collapsible toggle (V1, V2…): title, type, status; open,
// it shows the Script / Editor notes tabs, inspo links and who edited last.

type Actions = ReturnType<typeof useScriptActions>
// Script, caption and client notes go to the client's calendar; editor notes
// only to the team.
const SECTIONS: { value: ScriptField; label: string }[] = [
  { value: 'script', label: 'Script' },
  { value: 'caption', label: 'Caption' },
  { value: 'client_notes', label: 'Client notes' },
  { value: 'notes', label: 'Editor notes' },
]
const errMsg = (e: unknown) => (e as Error)?.message ?? 'Something went wrong'

export function StatusDot({ status }: { status: Script['status'] }) {
  const [d, l] = SCRIPT_STATUS[status].colors
  return (
    <span className="inline-flex items-center gap-1.5 flex-none" style={{ fontSize: 12, color: 'var(--soft-text)', fontWeight: 500 }}>
      <span className="ds-dot" aria-hidden style={{ width: 7, height: 7, borderRadius: 999, '--sd-d': d, '--sd-l': l } as React.CSSProperties} />
      {SCRIPT_STATUS[status].label}
    </span>
  )
}

function Links({ script, actions, canEdit }: { script: Script; actions: Actions; canEdit: boolean }) {
  const [adding, setAdding] = useState('')
  const save = (links: string[]) => actions.updateScript.mutate({ id: script.id, links }, { onError: (e) => toast.error(errMsg(e)) })
  return (
    <div className="mt-3">
      <p className="mb-1.5" style={{ fontSize: 13, fontWeight: 600, color: 'var(--strong)' }}>Inspo</p>
      <ul className="space-y-1">
        {script.links.map((u, i) => (
          <li key={u + i} className="flex items-center gap-2 min-w-0">
            <Ms name="link" style={{ fontSize: 16, width: 16 }} />
            <a href={u} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 truncate hover:underline" style={{ fontSize: 13.5, color: 'var(--strong)' }}>{u.replace(/^https?:\/\/(www\.)?/, '')}</a>
            {canEdit && (
              <button type="button" aria-label="Remove link" className="ds-ibtn" style={{ width: 30, height: 30 }} onClick={() => save(script.links.filter((_, j) => j !== i))}>
                <Ms name="close" style={{ fontSize: 15, width: 15 }} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <form className="flex gap-2 mt-1.5" onSubmit={(e) => { e.preventDefault(); if (adding.trim()) { save([...script.links, adding.trim()]); setAdding('') } }}>
          <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Paste a link" aria-label="Add an inspo link" inputMode="url" className="ds-field flex-1" style={{ height: 36 }} />
          <button type="submit" className="ds-ghost-btn" style={{ height: 36 }} disabled={!adding.trim()}>Add</button>
        </form>
      )}
    </div>
  )
}

export function ScriptToggle({ script, actions, isAdmin, first, last, defaultOpen, renderFieldExtras, footerExtras }: {
  script: Script
  actions: Actions
  isAdmin: boolean
  first: boolean
  last: boolean
  defaultOpen?: boolean
  /** Admin review / comments (stage 3) plug in here. */
  renderFieldExtras?: (field: ScriptField) => { toolbarRight?: React.ReactNode; onAreaSelect?: () => void; below?: React.ReactNode }
  footerExtras?: React.ReactNode
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  // A just-created script opens (the signal can arrive after it appears).
  useEffect(() => { if (defaultOpen) setOpen(true) }, [defaultOpen])
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(script.title)
  const canEdit = true // copywriter (own clients) and admins can both edit
  const saveField = (field: ScriptField) => (value: { html?: string; slides?: string[] }, base: number, force?: boolean) =>
    actions.saveContent(script.id, field, value, base, force)
  const onErr = { onError: (e: unknown) => toast.error(errMsg(e)) }

  const rename = () => {
    setRenaming(false)
    const t = title.trim()
    if (t && t !== script.title) actions.updateScript.mutate({ id: script.id, title: t }, onErr)
    else setTitle(script.title)
  }

  return (
    <div className="ds-stoggle">
      <div className="flex items-center gap-2 pl-2 pr-2.5 min-h-[52px]">
        <button type="button" aria-expanded={open} aria-label={open ? 'Collapse' : 'Expand'} onClick={() => setOpen((o) => !o)} className="ds-ibtn flex-none" style={{ width: 36, height: 36 }}>
          <Ms name="chevron_right" style={{ fontSize: 20, width: 20, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .25s' }} />
        </button>
        {renaming ? (
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={rename} onKeyDown={(e) => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') { setTitle(script.title); setRenaming(false) } }}
            aria-label="Script title" className="ds-field flex-1 min-w-0" style={{ height: 34 }} />
        ) : (
          <button type="button" onClick={() => setOpen((o) => !o)} onDoubleClick={() => setRenaming(true)} className="flex-1 min-w-0 text-left truncate py-2" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--strong)' }}>{script.title}</button>
        )}
        <span className="ds-stype">{script.type}</span>
        <span className="hidden sm:inline-flex"><StatusDot status={script.status} /></span>
      </div>

      {open && (
        <div className="px-3.5 sm:px-4 pb-4 animate-fade-in">
          <div className="flex flex-wrap items-center gap-2 pb-3">
            <span className="sm:hidden"><StatusDot status={script.status} /></span>
            <div className="flex-1" />
            <select value={script.type} aria-label="Type" className="ds-tool pr-8" style={{ height: 36 }}
              onChange={(e) => actions.updateScript.mutate({ id: script.id, type: e.target.value as ScriptType }, onErr)}>
              {SCRIPT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button type="button" aria-label="Rename" title="Rename" className="ds-ibtn" style={{ width: 36, height: 36 }} onClick={() => setRenaming(true)}><Ms name="edit" style={{ fontSize: 17, width: 17 }} /></button>
            <button type="button" aria-label="Move up" title="Move up" className="ds-ibtn" style={{ width: 36, height: 36 }} disabled={first} onClick={() => actions.moveScript.mutate({ id: script.id, direction: 'up' }, onErr)}><Ms name="arrow_upward" style={{ fontSize: 17, width: 17 }} /></button>
            <button type="button" aria-label="Move down" title="Move down" className="ds-ibtn" style={{ width: 36, height: 36 }} disabled={last} onClick={() => actions.moveScript.mutate({ id: script.id, direction: 'down' }, onErr)}><Ms name="arrow_downward" style={{ fontSize: 17, width: 17 }} /></button>
            <button type="button" aria-label="Delete script" title="Delete" className="ds-ibtn ds-danger" style={{ width: 36, height: 36 }}
              onClick={() => { if (confirm(`Delete "${script.title}"?`)) actions.deleteScript.mutate(script.id, onErr) }}><Ms name="delete" style={{ fontSize: 17, width: 17, color: 'inherit' }} /></button>
          </div>

          {/* All four in one view, each autosaving on its own. */}
          <div className="space-y-5">
            {SECTIONS.map(({ value: f, label }) => {
              const extras = renderFieldExtras?.(f)
              return (
                <div key={f}>
                  <FieldEditor script={script} field={f} label={label} compact={f !== 'script'} canEdit={canEdit} save={saveField(f)}
                    toolbarRight={extras?.toolbarRight} onAreaSelect={extras?.onAreaSelect} />
                  {extras?.below}
                  {f === 'script' && <Links script={script} actions={actions} canEdit={canEdit} />}
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-4 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
            <span className="flex-1 min-w-0 truncate" style={{ fontSize: 12, color: 'var(--faint)' }}>
              {script.updatedBy?.name ? `Last edited by ${script.updatedBy.name.split(' ')[0]}, ${formatDistanceToNow(new Date(script.updatedAt), { addSuffix: true })}` : ''}
            </span>
            {!isAdmin && (script.status === 'draft' || script.status === 'needs_changes') && (
              <button type="button" className="ds-primary" disabled={actions.setStatus.isPending}
                onClick={() => actions.setStatus.mutate({ id: script.id, status: 'in_review' }, { onSuccess: () => toast.success('Sent to review'), ...onErr })}>
                <Ms name="send" style={{ fontSize: 17, width: 17, color: 'inherit' }} />Send to review
              </button>
            )}
            {footerExtras}
          </div>
        </div>
      )}
    </div>
  )
}
