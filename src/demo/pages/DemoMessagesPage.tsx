/**
 * DemoMessagesPage — full-page messaging UI for all roles.
 * Left: conversation list (DMs + group chats). Right: active thread.
 */
import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { useDemoAuth } from '../DemoAuthContext'
import { useDemoChat } from '../useDemoChat'
import { MOCK_PROFILES } from '../mockData'
import { ThemeToggle } from '@/lib/theme'
import { cn } from '@/lib/utils'

// ── Icons ──────────────────────────────────────────────────────────────────────
function IconSend() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  )
}
function IconChat() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
  )
}
function IconUsers() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

// ── Avatar ─────────────────────────────────────────────────────────────────────
function Avatar({ name, role, size = 'md' }: { name: string; role?: string; size?: 'sm' | 'md' | 'lg' }) {
  const roleColor: Record<string, string> = {
    client: 'bg-green-500/25 text-green-400',
    admin:  'bg-purple-500/25 text-purple-400',
    team:   'bg-blue-500/25 text-blue-400',
  }
  const base = roleColor[role ?? ''] ?? 'bg-muted text-muted-foreground'
  const sz = size === 'lg' ? 'w-12 h-12 text-lg' : size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-sm'
  return (
    <div className={cn('rounded-full flex items-center justify-center font-bold flex-shrink-0', base, sz)}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

// Group avatar: stacked initials
function GroupAvatar({ names, size = 'md' }: { names: string[]; size?: 'sm' | 'md' }) {
  const sz = size === 'sm' ? 'w-5 h-5 text-[9px]' : 'w-7 h-7 text-[10px]'
  const containerSz = size === 'sm' ? 'w-9 h-7' : 'w-11 h-9'
  const shown = names.slice(0, 3)
  return (
    <div className={cn('relative flex-shrink-0', containerSz)}>
      {shown.map((name, i) => (
        <div
          key={i}
          className={cn(
            'absolute rounded-full border-2 border-card flex items-center justify-center font-bold bg-primary/20 text-primary',
            sz,
          )}
          style={{ left: `${i * 8}px`, zIndex: shown.length - i }}
        >
          {name.charAt(0).toUpperCase()}
        </div>
      ))}
    </div>
  )
}

// ── Back link by role ──────────────────────────────────────────────────────────
function backLink(role: string) {
  if (role === 'admin') return '/admin'
  if (role === 'team') return '/team'
  return '/workspace'
}
function backLabel(role: string) {
  if (role === 'admin') return 'Projects'
  if (role === 'team') return 'My Assignments'
  return 'Workspace'
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function DemoMessagesPage() {
  const { profile } = useDemoAuth()
  const isAdmin = profile?.role === 'admin'
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { conversations, messages, send, markRead } = useDemoChat(
    profile?.id ?? '',
    isAdmin,
  )

  const activeConv = conversations.find((c) => c.id === activeId)
  const threadMsgs = activeConv
    ? messages.filter((m) => m.connection_id === activeId)
    : []

  // Auto-open first conversation on load
  useEffect(() => {
    if (!activeId && conversations.length > 0) {
      setActiveId(conversations[0].id)
    }
  }, [conversations.length])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [threadMsgs.length])

  // Mark read when thread is open
  useEffect(() => {
    if (activeId) markRead(activeId)
  }, [activeId, threadMsgs.length])

  const openThread = (id: string) => {
    setActiveId(id)
    markRead(id)
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' })
      inputRef.current?.focus()
    }, 50)
  }

  const submitMessage = () => {
    if (!draft.trim() || !activeId) return
    send(activeId, draft.trim())
    setDraft('')
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)
  }

  const getSenderProfile = (id: string) => MOCK_PROFILES.find((p) => p.id === id)

  if (!profile) return null

  // Split conversations by kind for the sidebar sections
  const dmConvs = conversations.filter((c) => c.kind === 'dm')
  const groupConvs = conversations.filter((c) => c.kind === 'group')

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-30 flex-shrink-0">
        <div className="max-w-screen-xl mx-auto px-6 flex items-center gap-4" style={{ height: '52px' }}>
          <Link
            to={backLink(profile.role)}
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            ← {backLabel(profile.role)}
          </Link>
          <span className="text-border">/</span>
          <span className="text-sm font-semibold">Messages</span>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden max-w-screen-xl mx-auto w-full px-4 py-4 gap-4" style={{ height: 'calc(100vh - 52px)' }}>

        {/* ── Conversation list ── */}
        <aside className="w-72 flex-shrink-0 clay-card flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-shrink-0">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <span className="font-heading font-semibold text-sm">Conversations</span>
            <span className="ml-auto text-xs text-muted-foreground">{conversations.length}</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3 text-muted-foreground">
                  <IconChat />
                </div>
                <p className="text-sm text-muted-foreground">No conversations yet.</p>
              </div>
            ) : (
              <>
                {/* DMs */}
                {dmConvs.length > 0 && (
                  <>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-4 pt-3 pb-1">
                      Direct Messages
                    </p>
                    <div className="divide-y divide-border/40">
                      {dmConvs.map((c) => {
                        const isActive = c.id === activeId
                        const other = c.other
                        return (
                          <button
                            key={c.id}
                            onClick={() => openThread(c.id)}
                            className={cn(
                              'w-full text-left flex items-center gap-3 px-4 py-3 transition-all duration-150',
                              isActive ? 'bg-primary/10' : 'hover:bg-muted/40',
                              c.unread > 0 && !isActive && 'bg-primary/5',
                            )}
                          >
                            <div className="relative flex-shrink-0">
                              <Avatar
                                name={isAdmin
                                  ? (MOCK_PROFILES.find((p) => p.id === c.conn?.user_a)?.full_name ?? '?')
                                  : (other?.full_name ?? '?')}
                                role={other?.role}
                              />
                              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-card" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <p className={cn('text-sm truncate', c.unread > 0 ? 'font-semibold' : 'text-foreground/80')}>
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
                                  {c.last.sender_id === profile.id ? 'You: ' : ''}{c.last.text}
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
                      })}
                    </div>
                  </>
                )}

                {/* Groups */}
                {groupConvs.length > 0 && (
                  <>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-4 pt-3 pb-1">
                      Groups
                    </p>
                    <div className="divide-y divide-border/40">
                      {groupConvs.map((c) => {
                        const isActive = c.id === activeId
                        const memberNames = (c.memberProfiles ?? []).map((m) => m.full_name)
                        return (
                          <button
                            key={c.id}
                            onClick={() => openThread(c.id)}
                            className={cn(
                              'w-full text-left flex items-center gap-3 px-4 py-3 transition-all duration-150',
                              isActive ? 'bg-primary/10' : 'hover:bg-muted/40',
                              c.unread > 0 && !isActive && 'bg-primary/5',
                            )}
                          >
                            <GroupAvatar names={memberNames} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <IconUsers />
                                  <p className={cn('text-sm truncate', c.unread > 0 ? 'font-semibold' : 'text-foreground/80')}>
                                    {c.label}
                                  </p>
                                </div>
                                {c.last && (
                                  <span className="text-[10px] text-muted-foreground flex-shrink-0">
                                    {formatDistanceToNow(new Date(c.last.created_at), { addSuffix: false })}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {c.last
                                  ? `${c.last.sender_id === profile.id ? 'You' : (getSenderProfile(c.last.sender_id)?.full_name ?? '?')}: ${c.last.text}`
                                  : `${memberNames.length} members`}
                              </p>
                            </div>
                            {c.unread > 0 && (
                              <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] flex items-center justify-center font-bold flex-shrink-0">
                                {c.unread}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </aside>

        {/* ── Thread panel ── */}
        <main className="flex-1 clay-card flex flex-col overflow-hidden">
          {!activeConv ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4 text-muted-foreground">
                <IconChat />
              </div>
              <p className="text-muted-foreground">Select a conversation to start messaging</p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="px-5 py-3 border-b border-border flex-shrink-0">
                {activeConv.kind === 'group' ? (
                  <div className="flex items-center gap-3">
                    <GroupAvatar names={(activeConv.memberProfiles ?? []).map((m) => m.full_name)} />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <IconUsers />
                        <p className="text-sm font-semibold">{activeConv.label}</p>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {(activeConv.memberProfiles ?? []).map((m) => m.full_name).join(', ')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Avatar name={activeConv.other?.full_name ?? '?'} role={activeConv.other?.role} size="sm" />
                    <div>
                      <p className="text-sm font-semibold">{isAdmin ? activeConv.label : activeConv.other?.full_name}</p>
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                        <span className="text-[10px] text-muted-foreground capitalize">{activeConv.other?.role}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {threadMsgs.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-sm text-muted-foreground">No messages yet. Say hello!</p>
                  </div>
                )}
                {threadMsgs.map((msg, i) => {
                  const isMine = msg.sender_id === profile.id
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
                        'flex gap-2',
                        isMine ? 'flex-row-reverse' : 'flex-row',
                        !showMeta && (isMine ? 'mr-11' : 'ml-11'),
                      )}
                    >
                      {showMeta && (
                        <Avatar name={sender?.full_name ?? '?'} role={sender?.role} size="sm" />
                      )}
                      <div className={cn('flex flex-col gap-0.5 max-w-[68%]', isMine ? 'items-end' : 'items-start')}>
                        {showMeta && (
                          <div className={cn('flex items-center gap-1.5', isMine ? 'flex-row-reverse' : 'flex-row')}>
                            <span className="text-xs font-semibold text-foreground/70">
                              {isMine ? 'You' : (sender?.full_name ?? '?')}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                            </span>
                          </div>
                        )}
                        <div
                          className={cn(
                            'px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words',
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
              <div className="border-t border-border px-4 py-3 flex-shrink-0">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={activeConv.kind === 'group' ? `Message ${activeConv.label}…` : 'Message…'}
                    rows={1}
                    className="flex-1 px-4 py-2.5 bg-input border border-border rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed"
                    style={{ maxHeight: '120px', overflowY: 'auto' }}
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
                    className="p-3 bg-primary rounded-xl text-white hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                  >
                    <IconSend />
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 text-center">Enter to send · Shift+Enter for newline</p>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
