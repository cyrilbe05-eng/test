import { useState } from 'react'
import { toast } from 'sonner'
import { Ms } from '@/components/ds'
import { ScriptToggle } from '@/components/scripts/ScriptToggle'
import { SCRIPT_TYPES } from '@/lib/scriptStatus'
import { useScriptActions } from '@/hooks/useScripts'
import type { Script, ScriptComment, ScriptField, ScriptGroup, ScriptPage, ScriptType } from '@/types/scripts'

// A client's script page: groups ("M1", "M2"…), each with its script
// toggles. Shared by the copywriter's Scripts and the admin's Script Review.

const errMsg = (e: unknown) => (e as Error)?.message ?? 'Something went wrong'

function NewScript({ groupId, actions, onCreated }: { groupId: string; actions: ReturnType<typeof useScriptActions>; onCreated: (title: string) => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [type, setType] = useState<ScriptType>('Reel')
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 mt-2 h-9 px-2 rounded-lg transition-colors hover:bg-[var(--hover)]" style={{ fontSize: 13, fontWeight: 500, color: 'var(--soft-text)' }}>
        <Ms name="add" style={{ fontSize: 17, width: 17, color: 'inherit' }} />New script
      </button>
    )
  }
  const create = () => {
    const t = title.trim()
    if (!t) return
    actions.addScript.mutate({ groupId, title: t, type }, {
      onSuccess: () => { onCreated(t); setTitle(''); setType('Reel'); setOpen(false) },
      onError: (e) => toast.error(errMsg(e)),
    })
  }
  return (
    <form className="flex flex-wrap items-center gap-2 mt-2" onSubmit={(e) => { e.preventDefault(); create() }}>
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="V1" aria-label="Script title" className="ds-field flex-1" style={{ minWidth: 140, height: 38 }}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }} />
      <select value={type} onChange={(e) => setType(e.target.value as ScriptType)} aria-label="Type" className="ds-tool pr-8" style={{ height: 38 }}>
        {SCRIPT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <button type="submit" className="ds-primary" style={{ paddingLeft: 14 }} disabled={!title.trim() || actions.addScript.isPending}>Add</button>
      <button type="button" className="ds-ghost-btn" onClick={() => setOpen(false)}>Cancel</button>
    </form>
  )
}

function Group({ group, index, count, actions, isAdmin, justAdded, setJustAdded, renderFieldExtras, renderFooter, comments, me, focusId }: {
  group: ScriptGroup; index: number; count: number; actions: ReturnType<typeof useScriptActions>; isAdmin: boolean
  comments: ScriptComment[]; me: string; focusId?: string | null
  justAdded: string | null; setJustAdded: (t: string | null) => void
  renderFieldExtras?: (script: Script, field: ScriptField) => { toolbarRight?: React.ReactNode; onAreaSelect?: () => void; below?: React.ReactNode }
  renderFooter?: (script: Script) => React.ReactNode
}) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(group.name)
  const onErr = { onError: (e: unknown) => toast.error(errMsg(e)) }
  const rename = () => {
    setRenaming(false)
    const n = name.trim()
    if (n && n !== group.name) actions.renameGroup.mutate({ id: group.id, name: n }, onErr)
    else setName(group.name)
  }
  return (
    <section className="animate-slide-up" style={{ animationDelay: `${index * 40}ms` }}>
      <div className="flex items-center gap-1.5 mb-2 min-h-[40px]">
        {renaming ? (
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} onKeyDown={(e) => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') { setName(group.name); setRenaming(false) } }}
            aria-label="Group name" className="ds-field" style={{ maxWidth: 240, height: 36 }} />
        ) : (
          <h2 onDoubleClick={() => setRenaming(true)} style={{ fontSize: 17, fontWeight: 650, letterSpacing: '-.01em', color: 'var(--strong)' }}>{group.name}</h2>
        )}
        <span className="ds-count ml-1">{group.scripts.length}</span>
        <div className="flex-1" />
        <button type="button" aria-label="Rename group" title="Rename" className="ds-ibtn" style={{ width: 34, height: 34 }} onClick={() => setRenaming(true)}><Ms name="edit" style={{ fontSize: 16, width: 16 }} /></button>
        <button type="button" aria-label="Move group up" title="Move up" className="ds-ibtn" style={{ width: 34, height: 34 }} disabled={index === 0} onClick={() => actions.moveGroup.mutate({ id: group.id, direction: 'up' }, onErr)}><Ms name="arrow_upward" style={{ fontSize: 16, width: 16 }} /></button>
        <button type="button" aria-label="Move group down" title="Move down" className="ds-ibtn" style={{ width: 34, height: 34 }} disabled={index === count - 1} onClick={() => actions.moveGroup.mutate({ id: group.id, direction: 'down' }, onErr)}><Ms name="arrow_downward" style={{ fontSize: 16, width: 16 }} /></button>
        <button type="button" aria-label="Delete group" title="Delete" className="ds-ibtn ds-danger" style={{ width: 34, height: 34 }}
          onClick={() => { if (confirm(group.scripts.length ? `Delete "${group.name}" and its ${group.scripts.length} script${group.scripts.length === 1 ? '' : 's'}?` : `Delete "${group.name}"?`)) actions.deleteGroup.mutate(group.id, onErr) }}>
          <Ms name="delete" style={{ fontSize: 16, width: 16, color: 'inherit' }} />
        </button>
      </div>
      {group.scripts.map((s, i) => (
        <ScriptToggle key={s.id} script={s} actions={actions} isAdmin={isAdmin} first={i === 0} last={i === group.scripts.length - 1}
          defaultOpen={justAdded === s.title && i === group.scripts.length - 1}
          renderFieldExtras={renderFieldExtras ? (f) => renderFieldExtras(s, f) : undefined}
          footerExtras={renderFooter?.(s)} comments={comments.filter((c) => c.scriptId === s.id)} me={me} focus={focusId === s.id} />
      ))}
      <NewScript groupId={group.id} actions={actions} onCreated={setJustAdded} />
    </section>
  )
}

export function ScriptPageView({ page, isAdmin, renderFieldExtras, renderFooter, me, focusId }: {
  page: ScriptPage
  isAdmin: boolean
  me: string
  /** Open and scroll to this script (links from Script Review). */
  focusId?: string | null
  renderFieldExtras?: (script: Script, field: ScriptField) => { toolbarRight?: React.ReactNode; onAreaSelect?: () => void; below?: React.ReactNode }
  renderFooter?: (script: Script) => React.ReactNode
}) {
  const actions = useScriptActions(page.client.id)
  const [groupName, setGroupName] = useState('')
  const [justAdded, setJustAdded] = useState<string | null>(null)
  const addGroup = () => {
    const n = groupName.trim()
    if (!n) return
    actions.addGroup.mutate(n, { onSuccess: () => setGroupName(''), onError: (e) => toast.error(errMsg(e)) })
  }
  return (
    <div className="space-y-7">
      {page.groups.map((g, i) => (
        <Group key={g.id} group={g} index={i} count={page.groups.length} actions={actions} isAdmin={isAdmin}
          justAdded={justAdded} setJustAdded={setJustAdded} renderFieldExtras={renderFieldExtras} renderFooter={renderFooter}
          comments={page.comments} me={me} focusId={focusId} />
      ))}
      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); addGroup() }}>
        <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder={page.groups.length ? `M${page.groups.length + 1}` : 'M1'} aria-label="New group name" className="ds-field" style={{ maxWidth: 220, height: 38 }} />
        <button type="submit" className="ds-ghost-btn inline-flex items-center gap-1.5" disabled={!groupName.trim() || actions.addGroup.isPending}>
          <Ms name="add" style={{ fontSize: 17, width: 17, color: 'inherit' }} />Add group
        </button>
      </form>
    </div>
  )
}
