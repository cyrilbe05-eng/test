/**
 * useDemoChat — global in-memory chat state shared across all components.
 *
 * Admin controls connections (DM pairs) and group chats.
 * Each authed user sees only their own connections/groups.
 * Admin sees ALL conversations.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  MOCK_CONNECTIONS,
  MOCK_MESSAGES,
  MOCK_PROFILES,
  _groupsStore,
  addGroupChat as _addGroupChat,
  removeGroupChat as _removeGroupChat,
  type ChatConnection,
  type ChatMessage,
  type GroupChat,
} from './mockData'

// ── Singleton store (module-level so all hook instances share state) ──────────
let _connections: ChatConnection[] = [...MOCK_CONNECTIONS]
let _messages: ChatMessage[] = [...MOCK_MESSAGES]
let _listeners: Array<() => void> = []

function notify() {
  _listeners.forEach((fn) => fn())
}

// ── Public store mutations ────────────────────────────────────────────────────
export function addConnection(userA: string, userB: string): ChatConnection | null {
  if (userA === userB) return null
  const already = _connections.find(
    (c) =>
      (c.user_a === userA && c.user_b === userB) ||
      (c.user_a === userB && c.user_b === userA),
  )
  if (already) return already
  const conn: ChatConnection = {
    id: `conn-${Date.now()}`,
    user_a: userA,
    user_b: userB,
    created_at: new Date().toISOString(),
  }
  _connections = [..._connections, conn]
  notify()
  return conn
}

export function removeConnection(connId: string) {
  _connections = _connections.filter((c) => c.id !== connId)
  _messages = _messages.filter((m) => m.connection_id !== connId)
  notify()
}

export function createGroup(name: string, memberIds: string[]): GroupChat {
  const group = _addGroupChat(name, memberIds)
  notify()
  return group
}

export function deleteGroup(groupId: string) {
  _removeGroupChat(groupId)
  _messages = _messages.filter((m) => m.connection_id !== groupId)
  notify()
}

export function sendMessage(connectionId: string, senderId: string, text: string): ChatMessage {
  const msg: ChatMessage = {
    id: `msg-${Date.now()}`,
    connection_id: connectionId,
    sender_id: senderId,
    text,
    created_at: new Date().toISOString(),
    read_by: [senderId],
  }
  _messages = [..._messages, msg]
  notify()
  return msg
}

export function markMessagesRead(connectionId: string, userId: string) {
  let changed = false
  _messages = _messages.map((m) => {
    if (m.connection_id === connectionId && !m.read_by.includes(userId)) {
      changed = true
      return { ...m, read_by: [...m.read_by, userId] }
    }
    return m
  })
  if (changed) notify()
}

// ── Conversation shape ────────────────────────────────────────────────────────
export type ConvKind = 'dm' | 'group'

export interface Conversation {
  id: string            // connection id or group id
  kind: ConvKind
  label: string
  // DM-only
  conn?: ChatConnection
  other?: (typeof MOCK_PROFILES)[number]
  otherId?: string
  // Group-only
  group?: GroupChat
  memberProfiles?: (typeof MOCK_PROFILES)[number][]
  // Common
  last: ChatMessage | null
  unread: number
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useDemoChat(currentUserId: string, isAdmin = false) {
  const [, forceRender] = useState(0)

  useEffect(() => {
    const fn = () => forceRender((n) => n + 1)
    _listeners.push(fn)
    return () => {
      _listeners = _listeners.filter((l) => l !== fn)
    }
  }, [])

  // ── DM conversations ──
  const myConnections = isAdmin
    ? _connections
    : _connections.filter((c) => c.user_a === currentUserId || c.user_b === currentUserId)

  const dmConversations: Conversation[] = myConnections.map((conn) => {
    const otherId = conn.user_a === currentUserId ? conn.user_b : conn.user_a
    const other = MOCK_PROFILES.find((p) => p.id === otherId)
    const msgs = _messages.filter((m) => m.connection_id === conn.id)
    const last = msgs[msgs.length - 1] ?? null
    const unread = msgs.filter((m) => !m.read_by.includes(currentUserId)).length

    let label = other?.full_name ?? '—'
    if (isAdmin) {
      const profA = MOCK_PROFILES.find((p) => p.id === conn.user_a)
      const profB = MOCK_PROFILES.find((p) => p.id === conn.user_b)
      label = `${profA?.full_name ?? '?'} ↔ ${profB?.full_name ?? '?'}`
    }

    return { id: conn.id, kind: 'dm', label, conn, other, otherId, last, unread }
  })

  // ── Group conversations ──
  const myGroups = isAdmin
    ? _groupsStore
    : _groupsStore.filter((g) => g.member_ids.includes(currentUserId))

  const groupConversations: Conversation[] = myGroups.map((group) => {
    const memberProfiles = group.member_ids
      .map((id) => MOCK_PROFILES.find((p) => p.id === id))
      .filter(Boolean) as (typeof MOCK_PROFILES)[number][]
    const msgs = _messages.filter((m) => m.connection_id === group.id)
    const last = msgs[msgs.length - 1] ?? null
    const unread = msgs.filter((m) => !m.read_by.includes(currentUserId)).length

    return { id: group.id, kind: 'group', label: group.name, group, memberProfiles, last, unread }
  })

  const conversations: Conversation[] = [...dmConversations, ...groupConversations]
  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0)

  const send = useCallback(
    (connectionId: string, text: string) => sendMessage(connectionId, currentUserId, text),
    [currentUserId],
  )

  const markRead = useCallback(
    (connectionId: string) => markMessagesRead(connectionId, currentUserId),
    [currentUserId],
  )

  return {
    conversations,
    totalUnread,
    messages: _messages,
    connections: _connections,
    groups: _groupsStore,
    send,
    markRead,
    addConnection,
    removeConnection,
    createGroup,
    deleteGroup,
  }
}
