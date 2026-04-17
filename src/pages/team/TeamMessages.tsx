import { useState, useRef, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { TeamLayout } from '@/components/workspace/TeamLayout'
import { cn } from '@/lib/utils'
import {
  useConnections,
  useGroups,
  useMessages,
  useSendMessage,
} from '@/hooks/useChat'
import type { ChatConnection, ChatGroup, ChatMessage } from '@/types'

type ConversationId = string | null

function roleColor(role?: string) {
  if (role === 'admin') return 'bg-violet-500'
  if (role === 'team') return 'bg-teal-500'
  return 'bg-indigo-500'
}

function getInitial(name?: string) {
  return (name ?? '?')[0].toUpperCase()
}

// ─── Thread panel ────────────────────────────────────────────────────────────
function Thread({
  conversationId,
  currentUserId,
}: {
  conversationId: string
  currentUserId: string
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
    sendMessage.mutate(
      { conversationId, text: trimmed },
      {
        onError: () => toast.error('Failed to send message'),
      }
    )
    setText('')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {(messages ?? []).map((msg: ChatMessage) => {
          const isMe = msg.sender_id === currentUserId
          return (
            <div key={msg.id} className={cn('flex gap-2.5', isMe && 'flex-row-reverse')}>
              <div
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0',
                  roleColor(msg.sender?.role)
                )}
              >
                {getInitial(msg.sender?.full_name)}
              </div>
              <div className={cn('max-w-[70%]', isMe && 'items-end flex flex-col')}>
                <p className="text-xs text-muted-foreground mb-0.5">
                  {msg.sender?.full_name ?? 'Unknown'}
                  {' · '}
                  {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                </p>
                <div
                  className={cn(
                    'px-3 py-2 rounded-2xl text-sm',
                    isMe
                      ? 'bg-primary text-white rounded-tr-sm'
                      : 'bg-muted text-foreground rounded-tl-sm'
                  )}
                >
                  {msg.text}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-border p-3 flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Type a message…"
          rows={2}
          className="flex-1 resize-none bg-muted rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sendMessage.isPending}
          className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl shadow-clay hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-40 self-end"
        >
          Send
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TeamMessages() {
  const { profile } = useAuth()
  const { data: connections } = useConnections()
  const { data: groups } = useGroups()

  const [activeConvId, setActiveConvId] = useState<ConversationId>(null)

  // Filter to only conversations this user is part of
  const myConnections = (connections ?? []).filter(
    (c: ChatConnection) => profile && (c.user_a === profile.id || c.user_b === profile.id)
  )
  const myGroups = (groups ?? []).filter(
    (g: ChatGroup) => profile && g.member_ids.includes(profile.id)
  )

  return (
    <TeamLayout>
      <div className="flex h-full" style={{ minHeight: 'calc(100vh - 52px)' }}>
        {/* Sidebar */}
        <aside className={cn(
          'border-r border-border bg-card/60 flex flex-col flex-shrink-0',
          'w-full md:w-72',
          activeConvId ? 'hidden md:flex' : 'flex',
        )}>
          <div className="p-4 border-b border-border">
            <h2 className="font-heading font-semibold text-sm">Conversations</h2>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Direct Messages */}
            <div className="p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Direct Messages</p>
              {myConnections.length === 0 && (
                <p className="text-xs text-muted-foreground px-1">No direct messages yet.</p>
              )}
              {myConnections.map((conn: ChatConnection) => {
                const isActive = activeConvId === conn.id
                // We don't have user details in the basic ChatConnection, show IDs as placeholder label
                const otherId = profile ? (conn.user_a === profile.id ? conn.user_b : conn.user_a) : '—'
                return (
                  <div
                    key={conn.id}
                    onClick={() => setActiveConvId(conn.id)}
                    className={cn(
                      'flex items-center gap-2.5 px-2 py-2 rounded-xl cursor-pointer transition-colors',
                      isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                    )}
                  >
                    <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                      DM
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">Direct Message</p>
                      <p className="text-xs text-muted-foreground truncate">{otherId.slice(0, 8)}…</p>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Groups */}
            <div className="p-3 border-t border-border/50">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Groups</p>
              {myGroups.length === 0 && (
                <p className="text-xs text-muted-foreground px-1">No groups yet.</p>
              )}
              {myGroups.map((group: ChatGroup) => {
                const isActive = activeConvId === group.id
                return (
                  <div
                    key={group.id}
                    onClick={() => setActiveConvId(group.id)}
                    className={cn(
                      'flex items-center gap-2.5 px-2 py-2 rounded-xl cursor-pointer transition-colors',
                      isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                    )}
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                      {getInitial(group.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{group.name}</p>
                      <p className="text-xs text-muted-foreground">{group.member_ids.length} members</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </aside>

        {/* Thread panel */}
        <main className={cn('flex-1 flex flex-col bg-background', !activeConvId && 'hidden md:flex')}>
          {activeConvId ? (
            <>
              <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b border-border bg-card/60">
                <button
                  onClick={() => setActiveConvId(null)}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back
                </button>
              </div>
              <Thread conversationId={activeConvId} currentUserId={profile?.id ?? ''} />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="text-sm text-muted-foreground">Select a conversation to start messaging</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </TeamLayout>
  )
}
