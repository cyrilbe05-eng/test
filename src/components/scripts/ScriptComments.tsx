import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Ms } from '@/components/ds'
import type { useScriptActions } from '@/hooks/useScripts'
import type { ScriptComment } from '@/types/scripts'

// The side panel of a script's comments: open ones first, each with the
// highlighted text, replies and Resolve; resolved ones folded away.

const errMsg = (e: unknown) => (e as Error)?.message ?? 'Something went wrong'
const LABEL: Record<ScriptComment['field'], string> = { script: 'Script', caption: 'Caption', client_notes: 'Client notes', notes: 'Editor notes' }

function Thread({ c, replies, actions, me, isAdmin, active, onPick }: {
  c: ScriptComment; replies: ScriptComment[]; actions: ReturnType<typeof useScriptActions>; me: string; isAdmin: boolean
  active: boolean; onPick: (id: string) => void
}) {
  const [reply, setReply] = useState('')
  const onErr = { onError: (e: unknown) => toast.error(errMsg(e)) }
  const resolved = !!c.resolvedAt
  const send = () => {
    if (!reply.trim()) return
    actions.addComment.mutate({ scriptId: c.scriptId, field: c.field, parentId: c.id, body: reply.trim() }, { onSuccess: () => setReply(''), ...onErr })
  }
  const line = (x: ScriptComment) => (
    <div key={x.id} className="group">
      <div className="flex items-baseline gap-1.5">
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--strong)' }}>{x.author.name.split(' ')[0]}</span>
        <span style={{ fontSize: 11.5, color: 'var(--faint)' }}>{formatDistanceToNow(new Date(x.createdAt), { addSuffix: true })}</span>
        {(isAdmin || x.author.id === me) && (
          <button type="button" aria-label="Delete comment" className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--faint)' }}
            onClick={(e) => { e.stopPropagation(); if (confirm('Delete this comment?')) actions.deleteComment.mutate({ id: x.id, scriptId: x.scriptId }, onErr) }}>
            <Ms name="delete" style={{ fontSize: 15, width: 15, color: 'inherit' }} />
          </button>
        )}
      </div>
      <p className="whitespace-pre-wrap" style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.45 }}>{x.body}</p>
    </div>
  )
  return (
    <div className={`ds-cmt${active ? ' active' : ''}${resolved ? ' resolved' : ''}`} onClick={() => onPick(c.id)}>
      <p className="mb-1.5 line-clamp-2" style={{ fontSize: 12, color: 'var(--faint)' }}>
        <span style={{ fontWeight: 600 }}>{LABEL[c.field]}</span>{c.quote ? ` · “${c.quote}”` : ''}
      </p>
      <div className="space-y-2">{line(c)}{replies.map(line)}</div>
      {active && !resolved && (
        <form className="flex gap-1.5 mt-2" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); send() }}>
          <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply…" aria-label="Reply" className="ds-field flex-1" style={{ height: 34 }} />
          <button type="submit" className="ds-ghost-btn" style={{ height: 34 }} disabled={!reply.trim() || actions.addComment.isPending}>Reply</button>
        </form>
      )}
      <button type="button" className="mt-2 inline-flex items-center gap-1" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--soft-text)' }}
        onClick={(e) => { e.stopPropagation(); actions.resolveComment.mutate({ id: c.id, scriptId: c.scriptId, resolved: !resolved }, onErr) }}>
        <Ms name={resolved ? 'undo' : 'check'} style={{ fontSize: 15, width: 15, color: 'inherit' }} />{resolved ? 'Reopen' : 'Resolve'}
      </button>
    </div>
  )
}

export function ScriptComments({ comments, actions, me, isAdmin, activeId, onPick }: {
  comments: ScriptComment[]; actions: ReturnType<typeof useScriptActions>; me: string; isAdmin: boolean
  activeId: string | null; onPick: (id: string) => void
}) {
  const [showResolved, setShowResolved] = useState(false)
  const top = comments.filter((c) => !c.parentId)
  const open = top.filter((c) => !c.resolvedAt)
  const done = top.filter((c) => c.resolvedAt)
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id)
  if (!top.length) return null
  return (
    <aside className="space-y-2" aria-label="Comments">
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--strong)' }}>Comments{open.length ? <span className="ds-count ml-1.5">{open.length}</span> : null}</p>
      {open.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--faint)' }}>All resolved</p>}
      {open.map((c) => <Thread key={c.id} c={c} replies={repliesOf(c.id)} actions={actions} me={me} isAdmin={isAdmin} active={activeId === c.id} onPick={onPick} />)}
      {done.length > 0 && (
        <>
          <button type="button" onClick={() => setShowResolved((v) => !v)} className="inline-flex items-center gap-1" style={{ fontSize: 12.5, color: 'var(--faint)' }}>
            <Ms name={showResolved ? 'expand_less' : 'expand_more'} style={{ fontSize: 16, width: 16, color: 'inherit' }} />{done.length} resolved
          </button>
          {showResolved && done.map((c) => <Thread key={c.id} c={c} replies={repliesOf(c.id)} actions={actions} me={me} isAdmin={isAdmin} active={activeId === c.id} onPick={onPick} />)}
        </>
      )}
    </aside>
  )
}
