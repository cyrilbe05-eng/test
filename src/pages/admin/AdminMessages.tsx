import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { AdminNav } from '@/components/admin/AdminNav'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { useApiFetch } from '@/lib/api'
import {
  useConnections,
  useGroups,
  useMessages,
  useSendMessage,
  useCreateConnection,
  useDeleteConnection,
  useCreateGroup,
  useDeleteGroup,
} from '@/hooks/useChat'
import type { ChatConnection, ChatGroup, ChatMessage, Profile } from '@/types'

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

// ─── New DM Modal ─────────────────────────────────────────────────────────────
function NewDMModal({
  users,
  onClose,
}: {
  users: Profile[]
  onClose: () => void
}) {
  const [userA, setUserA] = useState('')
  const [userB, setUserB] = useState('')
  const createConnection = useCreateConnection()

  const handleCreate = () => {
    if (!userA || !userB || userA === userB) {
      toast.error('Select two different users')
      return
    }
    createConnection.mutate(
      { userA, userB },
      {
        onSuccess: () => {
          toast.success('Direct message created')
          onClose()
        },
        onError: () => toast.error('Failed to create DM'),
      }
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <h2 className="font-heading font-semibold text-lg">New Direct Message</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">User A</label>
            <select
              value={userA}
              onChange={(e) => setUserA(e.target.value)}
              className="w-full bg-muted rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">Select user…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.role})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">User B</label>
            <select
              value={userB}
              onChange={(e) => setUserB(e.target.value)}
              className="w-full bg-muted rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">Select user…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.role})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-colors">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={createConnection.isPending}
            className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl shadow-clay hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── New Group Modal ──────────────────────────────────────────────────────────
function NewGroupModal({
  users,
  onClose,
}: {
  users: Profile[]
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [memberIds, setMemberIds] = useState<string[]>([])
  const createGroup = useCreateGroup()

  const toggleMember = (id: string) => {
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error('Enter a group name')
      return
    }
    if (memberIds.length < 2) {
      toast.error('Select at least 2 members')
      return
    }
    createGroup.mutate(
      { name: name.trim(), memberIds },
      {
        onSuccess: () => {
          toast.success('Group created')
          onClose()
        },
        onError: () => toast.error('Failed to create group'),
      }
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <h2 className="font-heading font-semibold text-lg">New Group</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">Group Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Project Alpha Team"
              className="w-full bg-muted rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">Members</label>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {users.map((u) => (
                <label key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={memberIds.includes(u.id)}
                    onChange={() => toggleMember(u.id)}
                    className="accent-primary"
                  />
                  <span className="text-sm">{u.full_name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{u.role}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-colors">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={createGroup.isPending}
            className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl shadow-clay hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminMessages() {
  const { profile } = useAuth()
  const apiFetch = useApiFetch()
  const { data: connections } = useConnections()
  const { data: groups } = useGroups()
  const deleteConnection = useDeleteConnection()
  const deleteGroup = useDeleteGroup()

  const { data: users } = useQuery<Profile[]>({
    queryKey: ['users'],
    queryFn: () => apiFetch('/api/users'),
  })

  const [activeConvId, setActiveConvId] = useState<ConversationId>(null)
  const [showNewDM, setShowNewDM] = useState(false)
  const [showNewGroup, setShowNewGroup] = useState(false)

  const getOtherUser = (conn: ChatConnection) => {
    if (!profile) return null
    const otherId = conn.user_a === profile.id ? conn.user_b : conn.user_a
    return (users ?? []).find((u) => u.id === otherId) ?? null
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />

      <div className="flex h-[calc(100vh-52px)]">
        {/* Sidebar */}
        <aside className="w-72 border-r border-border bg-card/60 flex flex-col flex-shrink-0">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="font-heading font-semibold text-sm">Messages</h2>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Direct Messages */}
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Direct Messages</p>
                <button
                  onClick={() => setShowNewDM(true)}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  + New DM
                </button>
              </div>
              {(connections ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground px-1">No direct messages yet.</p>
              )}
              {(connections ?? []).map((conn) => {
                const other = getOtherUser(conn)
                const isActive = activeConvId === conn.id
                return (
                  <div
                    key={conn.id}
                    onClick={() => setActiveConvId(conn.id)}
                    className={cn(
                      'flex items-center gap-2.5 px-2 py-2 rounded-xl cursor-pointer group transition-colors',
                      isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                    )}
                  >
                    <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0', roleColor(other?.role))}>
                      {getInitial(other?.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{other?.full_name ?? 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground capitalize">{other?.role}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteConnection.mutate(conn.id, {
                          onSuccess: () => {
                            toast.success('Connection deleted')
                            if (activeConvId === conn.id) setActiveConvId(null)
                          },
                          onError: () => toast.error('Failed to delete'),
                        })
                      }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1 rounded"
                      title="Delete"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Groups */}
            <div className="p-3 border-t border-border/50">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Groups</p>
                <button
                  onClick={() => setShowNewGroup(true)}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  + New Group
                </button>
              </div>
              {(groups ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground px-1">No groups yet.</p>
              )}
              {(groups ?? []).map((group: ChatGroup) => {
                const isActive = activeConvId === group.id
                return (
                  <div
                    key={group.id}
                    onClick={() => setActiveConvId(group.id)}
                    className={cn(
                      'flex items-center gap-2.5 px-2 py-2 rounded-xl cursor-pointer group transition-colors',
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
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteGroup.mutate(group.id, {
                          onSuccess: () => {
                            toast.success('Group deleted')
                            if (activeConvId === group.id) setActiveConvId(null)
                          },
                          onError: () => toast.error('Failed to delete'),
                        })
                      }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1 rounded"
                      title="Delete"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </aside>

        {/* Thread panel */}
        <main className="flex-1 flex flex-col bg-background">
          {activeConvId ? (
            <Thread conversationId={activeConvId} currentUserId={profile?.id ?? ''} />
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

      {showNewDM && <NewDMModal users={users ?? []} onClose={() => setShowNewDM(false)} />}
      {showNewGroup && <NewGroupModal users={users ?? []} onClose={() => setShowNewGroup(false)} />}
    </div>
  )
}
