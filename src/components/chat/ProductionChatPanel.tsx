/**
 * ProductionChatPanel — floating chat bubble for the real app.
 * Uses live API data (connections + groups) via useChat hooks.
 */
import { useState, useRef, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { useConnections, useGroups, useMessages, useSendMessage } from '@/hooks/useChat'
import { useAuth } from '@/hooks/useAuth'
import type { ChatConnection, ChatGroup } from '@/types'

type PanelState = 'closed' | 'list' | 'thread'

function IconChat() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
  )
}
function IconX() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
function IconBack() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  )
}
function IconSend() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  )
}

function Avatar({ name, role }: { name?: string; role?: string }) {
  const color =
    role === 'admin' ? 'bg-purple-500/20 text-purple-400' :
    role === 'team'  ? 'bg-blue-500/20 text-blue-400' :
                       'bg-green-500/20 text-green-400'
  return (
    <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0', color)}>
      {(name ?? '?')[0].toUpperCase()}
    </div>
  )
}

// ── Thread ────────────────────────────────────────────────────────────────────
function Thread({ conversationId, currentUserId }: { conversationId: string; currentUserId: string }) {
  const { data: messages } = useMessages(conversationId)
  const sendMessage = useSendMessage()
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages?.length])

  useEffect(() => {
    inputRef.current?.focus()
  }, [conversationId])

  const submit = () => {
    const text = draft.trim()
    if (!text) return
    sendMessage.mutate({ conversationId, text })
    setDraft('')
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0">
        {(messages ?? []).map((msg) => {
          const isMe = msg.sender_id === currentUserId
          return (
            <div key={msg.id} className={cn('flex gap-2', isMe && 'flex-row-reverse')}>
              <Avatar name={msg.sender?.full_name} role={msg.sender?.role} />
              <div className={cn('max-w-[75%]', isMe && 'items-end flex flex-col')}>
                <p className="text-[10px] text-muted-foreground mb-0.5">
                  {msg.sender?.full_name ?? 'Unknown'}
                  {' · '}
                  {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                </p>
                <div className={cn(
                  'px-2.5 py-1.5 rounded-2xl text-xs leading-relaxed',
                  isMe ? 'bg-primary text-white rounded-tr-sm' : 'bg-muted text-foreground rounded-tl-sm'
                )}>
                  {msg.text}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-border p-2 flex gap-2 flex-shrink-0">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
          placeholder="Message…"
          rows={2}
          className="flex-1 resize-none bg-muted rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          onClick={submit}
          disabled={!draft.trim() || sendMessage.isPending}
          className="px-2.5 py-1.5 bg-primary text-white rounded-xl self-end disabled:opacity-40 hover:brightness-110 transition-all"
        >
          <IconSend />
        </button>
      </div>
    </>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function ProductionChatPanel() {
  const { profile } = useAuth()
  const { data: connections } = useConnections()
  const { data: groups } = useGroups()

  const [panel, setPanel] = useState<PanelState>('closed')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeLabel, setActiveLabel] = useState('')

  if (!profile) return null

  const myConnections = (connections ?? []).filter(
    (c: ChatConnection) => c.user_a === profile.id || c.user_b === profile.id
  )
  const myGroups = (groups ?? []).filter(
    (g: ChatGroup) => g.member_ids.includes(profile.id)
  )

  const totalConvs = myConnections.length + myGroups.length

  const openThread = (id: string, label: string) => {
    setActiveId(id)
    setActiveLabel(label)
    setPanel('thread')
  }

  return (
    <div className="fixed bottom-20 md:bottom-5 right-4 md:right-5 z-50 flex flex-col items-end gap-3 pointer-events-none">
      {/* Panel */}
      {panel !== 'closed' && (
        <div className="pointer-events-auto w-80 h-96 bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-muted/40 flex-shrink-0">
            {panel === 'thread' ? (
              <div className="flex items-center gap-2 min-w-0">
                <button onClick={() => setPanel('list')} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                  <IconBack />
                </button>
                <span className="text-sm font-semibold truncate">{activeLabel}</span>
              </div>
            ) : (
              <span className="text-sm font-semibold">Messages</span>
            )}
            <button onClick={() => setPanel('closed')} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
              <IconX />
            </button>
          </div>

          {/* Body */}
          {panel === 'list' ? (
            <div className="flex-1 overflow-y-auto">
              {totalConvs === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <p className="text-xs text-muted-foreground">No conversations yet.</p>
                </div>
              ) : (
                <>
                  {myConnections.length > 0 && (
                    <div className="p-2">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-1">Direct Messages</p>
                      {myConnections.map((c: ChatConnection) => {
                        const otherName = c.user_a === profile.id ? (c as any).user_b_name : (c as any).user_a_name
                        return (
                          <button
                            key={c.id}
                            onClick={() => openThread(c.id, otherName ?? 'Support')}
                            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-muted transition-colors text-left"
                          >
                            <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                              DM
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{otherName ?? 'Support'}</p>
                              <p className="text-[10px] text-muted-foreground">Direct message</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {myGroups.length > 0 && (
                    <div className={cn('p-2', myConnections.length > 0 && 'border-t border-border/50')}>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-1">Groups</p>
                      {myGroups.map((g: ChatGroup) => (
                        <button
                          key={g.id}
                          onClick={() => openThread(g.id, g.name)}
                          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-muted transition-colors text-left"
                        >
                          <div className="w-8 h-8 rounded-full bg-slate-500/20 text-slate-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {g.name[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{g.name}</p>
                            <p className="text-[10px] text-muted-foreground">{g.member_ids.length} members</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : activeId ? (
            <Thread conversationId={activeId} currentUserId={profile.id} />
          ) : null}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setPanel((p) => p === 'closed' ? 'list' : 'closed')}
        className="pointer-events-auto w-12 h-12 rounded-full bg-primary text-white shadow-lg hover:brightness-110 transition-all active:scale-95 flex items-center justify-center"
      >
        {panel !== 'closed' ? <IconX /> : <IconChat />}
      </button>
    </div>
  )
}
