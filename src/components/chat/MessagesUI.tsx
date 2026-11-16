import { useEffect, useRef, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { useMessages, useSendMessage } from '@/hooks/useChat'
import { ClientMark, EditorAvatar, Ms } from '@/components/ds'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/types'

// Messages pages (admin, team, client) share these pieces (DESIGN.md): the
// conversation list rows, a person's mark, the thread with its bubbles and
// composer, and the empty state. Each page keeps its own data and actions.

/** A person: client initial, editor avatar, or a neutral avatar for admins. */
export function PersonMark({ name, role, size = 30 }: { name?: string | null; role?: string | null; size?: number }) {
  if (role === 'client') return <ClientMark name={name ?? '?'} size={size} />
  if (role === 'team') return <EditorAvatar name={name ?? '?'} size={size} />
  return (
    <span className="grid place-items-center rounded-full flex-none" style={{ width: size, height: size, background: 'var(--avatar-bg)', color: 'var(--avatar-fg)', fontSize: Math.round(size * 0.4), fontWeight: 600 }}>
      {(name ?? '?').charAt(0).toUpperCase()}
    </span>
  )
}

export function GroupMark({ size = 30, icon = 'group' }: { size?: number; icon?: string }) {
  return (
    <span className="grid place-items-center rounded-[10px] flex-none" style={{ width: size, height: size, background: 'var(--panel)', boxShadow: 'inset 0 0 0 1px var(--panel-ring)', color: 'var(--soft-text)' }}>
      <Ms name={icon} style={{ fontSize: 18, width: 18, color: 'inherit' }} />
    </span>
  )
}

export function SideSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="px-3 pb-3">
      <div className="flex items-center justify-between gap-2 px-2 h-9">
        <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--faint)' }}>{title}</p>
        {action}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

export function ConvRow({ active, onClick, mark, title, sub, onDelete }: { active: boolean; onClick: () => void; mark: React.ReactNode; title: string; sub?: string; onDelete?: () => void }) {
  return (
    <div onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
      className="group flex items-center gap-2.5 px-2 py-2 rounded-[10px] cursor-pointer transition-colors hover:bg-[var(--hover)]"
      style={{ background: active ? 'var(--active)' : undefined }}>
      {mark}
      <div className="flex-1 min-w-0">
        <p className="truncate" style={{ fontSize: 13.5, fontWeight: active ? 600 : 500, color: 'var(--strong)' }}>{title}</p>
        {sub && <p className="truncate capitalize" style={{ fontSize: 12, color: 'var(--faint)' }}>{sub}</p>}
      </div>
      {onDelete && (
        <button onClick={(e) => { e.stopPropagation(); onDelete() }} title="Delete" aria-label="Delete"
          className="ds-ibtn ds-danger opacity-0 group-hover:opacity-100 transition-opacity flex-none" style={{ width: 28, height: 28 }}>
          <Ms name="delete" style={{ fontSize: 16, width: 16, color: 'inherit' }} />
        </button>
      )}
    </div>
  )
}

export function MessagesEmpty({ text }: { text: string }) {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center">
        <span className="w-12 h-12 rounded-2xl grid place-items-center mx-auto mb-3" style={{ background: 'var(--panel)', boxShadow: 'inset 0 0 0 1px var(--panel-ring)' }}>
          <Ms name="chat_bubble" style={{ fontSize: 22, width: 22 }} />
        </span>
        <p style={{ fontSize: 13.5, color: 'var(--faint)' }}>{text}</p>
      </div>
    </div>
  )
}

/** One conversation: header (who), bubbles, composer. */
export function MessageThread({ conversationId, currentUserId, title, sub, mark, onBack }: {
  conversationId: string; currentUserId: string; title?: string; sub?: string; mark?: React.ReactNode; onBack?: () => void
}) {
  const { data: messages } = useMessages(conversationId)
  const sendMessage = useSendMessage()
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    sendMessage.mutate({ conversationId, text: trimmed }, { onError: () => toast.error('Failed to send message') })
    setText('')
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-4 md:px-6 h-16 flex-none" style={{ borderBottom: '1px solid var(--line)' }}>
        {onBack && <span className="md:hidden -ml-2"><button onClick={onBack} aria-label="Back" className="ds-ibtn"><Ms name="arrow_back" /></button></span>}
        {mark}
        <div className="min-w-0">
          <p className="truncate" style={{ fontSize: 15, fontWeight: 600, color: 'var(--strong)' }}>{title ?? ''}</p>
          {sub && <p className="truncate capitalize" style={{ fontSize: 12, color: 'var(--faint)' }}>{sub}</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5 space-y-3">
        {(messages ?? []).map((msg: ChatMessage) => {
          const isMe = msg.sender_id === currentUserId
          return (
            <div key={msg.id} className={cn('flex gap-2.5 items-end ds-msg-in', isMe && 'flex-row-reverse')}>
              {!isMe && <PersonMark name={msg.sender?.full_name} role={msg.sender?.role} size={26} />}
              <div className={cn('max-w-[72%] flex flex-col', isMe ? 'items-end' : 'items-start')}>
                <p className="mb-1 px-1" style={{ fontSize: 11.5, color: 'var(--faint)' }}>
                  {isMe ? '' : `${msg.sender?.full_name ?? 'Unknown'} · `}{formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                </p>
                <div className={cn('ds-bubble', isMe ? 'me' : 'them')}>{msg.text}</div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className="pl-4 md:pl-6 pr-[72px] md:pr-[84px] pb-4 pt-2 flex-none">
        <div className="ds-composer">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Type a message…"
            rows={1}
          />
          <button onClick={handleSend} disabled={!text.trim() || sendMessage.isPending} aria-label="Send" className="ds-send">
            <Ms name="arrow_upward" style={{ fontSize: 20, width: 20, color: 'inherit' }} />
          </button>
        </div>
      </div>
    </div>
  )
}

/** Page shell: conversation list on the left, the open conversation on the
 *  right. On phones only one of the two shows at a time. */
export function MessagesShell({ heading, open, side, children }: { heading: string; open: boolean; side: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex h-[calc(100dvh-120px)] md:h-[calc(100dvh-64px)]" style={{ minHeight: 360 }}>
      <aside className={cn('ds-msg-side flex-col flex-none w-full md:w-72', open ? 'hidden md:flex' : 'flex')}>
        <h1 className="px-5 pt-5 pb-3" style={{ fontSize: 20, fontWeight: 650, letterSpacing: '-.02em', color: 'var(--strong)' }}>{heading}</h1>
        <div className="flex-1 overflow-y-auto">{side}</div>
      </aside>
      <main className={cn('flex-1 min-w-0 flex-col', open ? 'flex' : 'hidden md:flex')}>{children}</main>
    </div>
  )
}

export const SideNote = ({ text }: { text: string }) => <p className="px-2 py-1" style={{ fontSize: 12.5, color: 'var(--faint)' }}>{text}</p>
