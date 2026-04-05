/**
 * ChatPanel — Slack-style floating DM widget.
 *
 * Three states:
 *  - collapsed  : just the launcher FAB
 *  - list       : conversation list panel
 *  - thread     : open DM thread
 */
import { useState, useRef, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { useDemoChat } from '@/demo/useDemoChat'
import { MOCK_PROFILES } from '@/demo/mockData'
import { cn } from '@/lib/utils'

// ── tiny icons ────────────────────────────────────────────────────────────────
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
function IconArrowLeft() {
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

// ── avatar ────────────────────────────────────────────────────────────────────
function Avatar({
  name,
  role,
  size = 'md',
}: {
  name: string
  role?: string
  size?: 'sm' | 'md'
}) {
  const roleColor: Record<string, string> = {
    client: 'bg-green-500/25 text-green-400',
    admin:  'bg-purple-500/25 text-purple-400',
    team:   'bg-blue-500/25 text-blue-400',
  }
  const base = roleColor[role ?? ''] ?? 'bg-muted text-muted-foreground'
  const sz = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs'
  return (
    <div className={cn('rounded-full flex items-center justify-center font-bold flex-shrink-0', base, sz)}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

// ── online dot ────────────────────────────────────────────────────────────────
function OnlineDot() {
  return <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
}

// ── main component ────────────────────────────────────────────────────────────
type PanelState = 'closed' | 'list' | 'thread'

export function ChatPanel({
  currentUserId,
  isAdmin = false,
  mentionText,
  onMentionConsumed,
}: {
  currentUserId: string
  isAdmin?: boolean
  mentionText?: string
  onMentionConsumed?: () => void
}) {
  const [panel, setPanel] = useState<PanelState>('closed')
  const [activeConnId, setActiveConnId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  // Inject mention text into draft when provided
  useEffect(() => {
    if (mentionText) {
      setDraft((prev) => (prev ? prev + ' ' + mentionText : mentionText))
      setPanel((p) => (p === 'closed' ? 'list' : p))
      onMentionConsumed?.()
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [mentionText])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { conversations, totalUnread, messages, send, markRead } = useDemoChat(
    currentUserId,
    isAdmin,
  )

  const activeConv = conversations.find((c) => c.id === activeConnId)
  const threadMsgs = activeConv
    ? messages.filter((m) => m.connection_id === activeConnId)
    : []

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [threadMsgs.length])

  // Mark read when opening thread
  useEffect(() => {
    if (panel === 'thread' && activeConnId) {
      markRead(activeConnId)
    }
  }, [panel, activeConnId, markRead])

  const openThread = (connId: string) => {
    setActiveConnId(connId)
    setPanel('thread')
    markRead(connId)
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' })
      inputRef.current?.focus()
    }, 50)
  }

  const submitMessage = () => {
    if (!draft.trim() || !activeConnId) return
    send(activeConnId, draft.trim())
    setDraft('')
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)
  }

  const getSenderProfile = (id: string) => MOCK_PROFILES.find((p) => p.id === id)

  // ── render ──
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3 pointer-events-none">
      {/* Panel */}
      {panel !== 'closed' && (
        <div className="w-80 bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-in pointer-events-auto"
          style={{ height: '460px' }}>

          {/* ── Header ── */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card/80 backdrop-blur flex-shrink-0">
            {panel === 'thread' && (
              <button
                onClick={() => setPanel('list')}
                className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground mr-1"
              >
                <IconArrowLeft />
              </button>
            )}

            {panel === 'list' ? (
              <>
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="font-heading font-semibold text-sm flex-1">Messages</span>
                {totalUnread > 0 && (
                  <span className="text-xs bg-primary text-white px-1.5 py-0.5 rounded-full font-bold">
                    {totalUnread}
                  </span>
                )}
              </>
            ) : (
              <>
                {activeConv && (activeConv.kind === 'group' ? (
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate leading-tight">{activeConv.label}</p>
                    <span className="text-[10px] text-muted-foreground">
                      {(activeConv.memberProfiles ?? []).length} members
                    </span>
                  </div>
                ) : (() => {
                  const other = getSenderProfile(activeConv.otherId ?? '')
                  return (
                    <>
                      <Avatar name={activeConv.other?.full_name ?? '?'} role={other?.role} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate leading-tight">
                          {isAdmin ? activeConv.label : activeConv.other?.full_name}
                        </p>
                        <div className="flex items-center gap-1">
                          <OnlineDot />
                          <span className="text-[10px] text-muted-foreground capitalize">{other?.role}</span>
                        </div>
                      </div>
                    </>
                  )
                })())}
              </>
            )}

            <button
              onClick={() => setPanel('closed')}
              className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground ml-auto"
            >
              <IconX />
            </button>
          </div>

          {/* ── Conversation list ── */}
          {panel === 'list' && (
            <div className="flex-1 overflow-y-auto divide-y divide-border/40">
              {conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3 text-muted-foreground">
                    <IconChat />
                  </div>
                  <p className="text-sm text-muted-foreground">No conversations yet.</p>
                  {!isAdmin && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Your account manager will connect you with your team.
                    </p>
                  )}
                </div>
              ) : (
                conversations.map((c, i) => {
                  const other = c.kind === 'dm' ? getSenderProfile(c.otherId ?? '') : null
                  const avatarName = c.kind === 'group'
                    ? (c.memberProfiles?.[0]?.full_name ?? '?')
                    : (isAdmin
                        ? (MOCK_PROFILES.find((p) => p.id === c.conn?.user_a)?.full_name ?? '?')
                        : (c.other?.full_name ?? '?'))
                  return (
                    <button
                      key={c.id}
                      onClick={() => openThread(c.id)}
                      className={cn(
                        'w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-all duration-150 animate-slide-up',
                        c.unread > 0 && 'bg-primary/5',
                        `stagger-${Math.min(i + 1, 7)}`,
                      )}
                    >
                      <div className="relative flex-shrink-0">
                        <Avatar name={avatarName} role={other?.role} />
                        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-card" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className={cn('text-sm truncate', c.unread > 0 ? 'font-semibold text-foreground' : 'text-foreground/80')}>
                            {c.label}
                          </p>
                          {c.last && (
                            <span className="text-[10px] text-muted-foreground flex-shrink-0">
                              {formatDistanceToNow(new Date(c.last.created_at), { addSuffix: false })}
                            </span>
                          )}
                        </div>
                        {c.last && (
                          <p className={cn('text-xs truncate mt-0.5', c.unread > 0 ? 'text-foreground/80' : 'text-muted-foreground')}>
                            {c.last.sender_id === currentUserId ? 'You: ' : ''}{c.last.text}
                          </p>
                        )}
                      </div>
                      {c.unread > 0 && (
                        <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] flex items-center justify-center font-bold flex-shrink-0">
                          {c.unread}
                        </span>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          )}

          {/* ── Thread view ── */}
          {panel === 'thread' && activeConv && (
            <>
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                {threadMsgs.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-xs text-muted-foreground">No messages yet. Say hello!</p>
                  </div>
                )}
                {threadMsgs.map((msg, i) => {
                  const isMine = msg.sender_id === currentUserId
                  const sender = getSenderProfile(msg.sender_id)
                  const prevMsg = i > 0 ? threadMsgs[i - 1] : null
                  const sameAuthor = prevMsg?.sender_id === msg.sender_id
                  const timeDiff = prevMsg
                    ? new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime()
                    : Infinity
                  const showMeta = !sameAuthor || timeDiff > 5 * 60 * 1000

                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        'flex gap-2 animate-slide-up',
                        isMine ? 'flex-row-reverse' : 'flex-row',
                        !showMeta && (isMine ? 'mr-10' : 'ml-10'),
                      )}
                    >
                      {showMeta && !isMine && (
                        <Avatar name={sender?.full_name ?? '?'} role={sender?.role} size="sm" />
                      )}
                      {showMeta && isMine && (
                        <Avatar name={sender?.full_name ?? '?'} role={sender?.role} size="sm" />
                      )}

                      <div className={cn('flex flex-col gap-0.5 max-w-[72%]', isMine ? 'items-end' : 'items-start')}>
                        {showMeta && (
                          <div className={cn('flex items-center gap-1.5', isMine ? 'flex-row-reverse' : 'flex-row')}>
                            <span className="text-[10px] font-semibold text-foreground/70">
                              {isMine ? 'You' : (sender?.full_name ?? '?')}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                            </span>
                          </div>
                        )}
                        <div
                          className={cn(
                            'px-3 py-2 rounded-2xl text-sm leading-relaxed break-words',
                            isMine
                              ? 'bg-gradient-to-br from-primary to-secondary text-white rounded-tr-sm'
                              : 'bg-muted text-foreground rounded-tl-sm',
                          )}
                        >
                          {msg.text}
                        </div>
                        {isMine && i === threadMsgs.length - 1 && (
                          <span className="text-[9px] text-muted-foreground">
                            {msg.read_by.length > 1 ? '✓✓ Seen' : '✓ Sent'}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="border-t border-border p-3 flex-shrink-0 bg-card/60">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Message…"
                    rows={1}
                    className="flex-1 px-3 py-2 bg-input border border-border rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed"
                    style={{ maxHeight: '100px', overflowY: 'auto' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        submitMessage()
                      }
                    }}
                  />
                  <button
                    onClick={submitMessage}
                    disabled={!draft.trim()}
                    className="p-2.5 bg-primary rounded-xl text-white hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                  >
                    <IconSend />
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 text-center">Enter to send · Shift+Enter for newline</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* FAB launcher */}
      <button
        onClick={() => setPanel((p) => (p === 'closed' ? 'list' : 'closed'))}
        className={cn(
          'pointer-events-auto w-12 h-12 rounded-full flex items-center justify-center shadow-xl transition-all duration-200 active:scale-95',
          'bg-gradient-to-br from-primary to-secondary text-white',
          panel !== 'closed' ? 'animate-pulse-glow' : 'hover:shadow-[0_0_24px_rgba(168,85,247,0.5)]',
        )}
        aria-label="Toggle chat"
      >
        {panel !== 'closed' ? <IconX /> : <IconChat />}
        {panel === 'closed' && totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold animate-scale-in">
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        )}
      </button>
    </div>
  )
}
