import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { useAuth } from '@/hooks/useAuth'
import { useApiFetch } from '@/lib/api'
import { useSheetClose } from '@/hooks/useSheetClose'
import { cn } from '@/lib/utils'
import { Ms } from '@/components/ds'
import { useConnections, useGroups, useCreateConnection, useDeleteConnection, useCreateGroup, useDeleteGroup } from '@/hooks/useChat'
import { ConvRow, GroupMark, MessagesEmpty, MessagesShell, MessageThread, PersonMark, SideNote, SideSection } from '@/components/chat/MessagesUI'
import type { ChatConnection, ChatGroup, Profile } from '@/types'

// ─── New DM / New Group sheets ───────────────────────────────────────────────
function Sheet({ title, onClose, onCreate, pending, children }: { title: string; onClose: () => void; onCreate: () => void; pending: boolean; children: React.ReactNode }) {
  const { closing, close } = useSheetClose(onClose)
  return (
    <div className={cn('ds-cal-veil', closing && 'closing')} onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}>
      <div className={cn('ds-cal-sheet ds-msheet max-w-sm overflow-hidden', closing && 'closing')}>
        <h2 className="ds-form-title">{title}</h2>
        <div className="px-6 space-y-4">{children}</div>
        <div className="ds-form-foot">
          <button onClick={close} className="ds-ghost-btn">Cancel</button>
          <button onClick={onCreate} disabled={pending} className="ds-primary disabled:opacity-40" style={{ paddingLeft: 16 }}>Create</button>
        </div>
      </div>
    </div>
  )
}

const FieldName = ({ children }: { children: React.ReactNode }) => <p className="mb-1.5" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--faint)' }}>{children}</p>

function NewDMModal({ users, onClose }: { users: Profile[]; onClose: () => void }) {
  const [userA, setUserA] = useState('')
  const [userB, setUserB] = useState('')
  const createConnection = useCreateConnection()

  const handleCreate = () => {
    if (!userA || !userB || userA === userB) { toast.error('Select two different users'); return }
    createConnection.mutate({ userA, userB }, {
      onSuccess: () => { toast.success('Direct message created'); onClose() },
      onError: () => toast.error('Failed to create DM'),
    })
  }

  const pick = (value: string, set: (v: string) => void) => (
    <select value={value} onChange={(e) => set(e.target.value)}>
      <option value="">Select user…</option>
      {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
    </select>
  )

  return (
    <Sheet title="New Direct Message" onClose={onClose} onCreate={handleCreate} pending={createConnection.isPending}>
      <div><FieldName>User A</FieldName>{pick(userA, setUserA)}</div>
      <div><FieldName>User B</FieldName>{pick(userB, setUserB)}</div>
    </Sheet>
  )
}

function NewGroupModal({ users, onClose }: { users: Profile[]; onClose: () => void }) {
  const [name, setName] = useState('')
  const [memberIds, setMemberIds] = useState<string[]>([])
  const createGroup = useCreateGroup()

  const toggleMember = (id: string) => setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const handleCreate = () => {
    if (!name.trim()) { toast.error('Enter a group name'); return }
    if (memberIds.length < 2) { toast.error('Select at least 2 members'); return }
    createGroup.mutate({ name: name.trim(), memberIds }, {
      onSuccess: () => { toast.success('Group created'); onClose() },
      onError: () => toast.error('Failed to create group'),
    })
  }

  return (
    <Sheet title="New Group" onClose={onClose} onCreate={handleCreate} pending={createGroup.isPending}>
      <div><FieldName>Group name</FieldName><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Project Alpha Team" /></div>
      <div>
        <FieldName>Members</FieldName>
        <div className="max-h-56 overflow-y-auto -mx-2">
          {users.map((u) => {
            const on = memberIds.includes(u.id)
            return (
              <button key={u.id} type="button" onClick={() => toggleMember(u.id)} aria-pressed={on}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-[10px] text-left transition-colors hover:bg-[var(--hover)]">
                <PersonMark name={u.full_name} role={u.role} size={26} />
                <span className="flex-1 min-w-0 truncate" style={{ fontSize: 13.5, color: 'var(--strong)' }}>{u.full_name}</span>
                <span className="capitalize" style={{ fontSize: 12, color: 'var(--faint)' }}>{u.role}</span>
                <span className="grid place-items-center rounded-full flex-none" style={{ width: 20, height: 20, background: on ? 'var(--ds-accent)' : 'transparent', boxShadow: on ? 'none' : 'inset 0 0 0 1.5px var(--dash)', color: 'var(--accent-fg)', transition: 'background .2s' }}>
                  {on && <Ms name="check" style={{ fontSize: 14, width: 14, color: 'inherit' }} />}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </Sheet>
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

  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [showNewDM, setShowNewDM] = useState(false)
  const [showNewGroup, setShowNewGroup] = useState(false)

  const byId = (id: string) => (users ?? []).find((u) => u.id === id) ?? null
  // Admins can set up DMs between any two people: show the other person when
  // the admin is in it, both names otherwise.
  const dmInfo = (c: ChatConnection) => {
    const a = byId(c.user_a) ?? c.profile_a ?? null
    const b = byId(c.user_b) ?? c.profile_b ?? null
    if (c.user_a === profile?.id) return { title: b?.full_name ?? 'Unknown', sub: b?.role, mark: <PersonMark name={b?.full_name} role={b?.role} /> }
    if (c.user_b === profile?.id) return { title: a?.full_name ?? 'Unknown', sub: a?.role, mark: <PersonMark name={a?.full_name} role={a?.role} /> }
    return { title: `${a?.full_name ?? 'Unknown'} & ${b?.full_name ?? 'Unknown'}`, sub: 'Direct message', mark: <PersonMark name={a?.full_name} role={a?.role} /> }
  }

  const add = (label: string, onClick: () => void) => (
    <button onClick={onClick} className="inline-flex items-center gap-1 h-7 px-2 rounded-lg transition-colors hover:bg-[var(--hover)]" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--soft-text)' }}>
      <Ms name="add" style={{ fontSize: 16, width: 16, color: 'inherit' }} />{label}
    </button>
  )

  const conn = (connections ?? []).find((c) => c.id === activeConvId)
  const group = (groups ?? []).find((g) => g.id === activeConvId)
  const open = conn ? dmInfo(conn) : null

  return (
    <AdminLayout>
      <MessagesShell heading="Messages" open={!!activeConvId} side={<>
        <SideSection title="Direct Messages" action={add('New DM', () => setShowNewDM(true))}>
          {(connections ?? []).length === 0 && <SideNote text="No direct messages yet." />}
          {(connections ?? []).map((c) => {
            const d = dmInfo(c)
            return <ConvRow key={c.id} active={activeConvId === c.id} onClick={() => setActiveConvId(c.id)} mark={d.mark} title={d.title} sub={d.sub}
              onDelete={() => deleteConnection.mutate(c.id, {
                onSuccess: () => { toast.success('Connection deleted'); if (activeConvId === c.id) setActiveConvId(null) },
                onError: () => toast.error('Failed to delete'),
              })} />
          })}
        </SideSection>
        <SideSection title="Groups" action={add('New Group', () => setShowNewGroup(true))}>
          {(groups ?? []).length === 0 && <SideNote text="No groups yet." />}
          {(groups ?? []).map((g: ChatGroup) => (
            <ConvRow key={g.id} active={activeConvId === g.id} onClick={() => setActiveConvId(g.id)} mark={<GroupMark />} title={g.name} sub={`${g.member_ids.length} members`}
              onDelete={() => deleteGroup.mutate(g.id, {
                onSuccess: () => { toast.success('Group deleted'); if (activeConvId === g.id) setActiveConvId(null) },
                onError: () => toast.error('Failed to delete'),
              })} />
          ))}
        </SideSection>
      </>}>
        {activeConvId ? (
          <MessageThread key={activeConvId} conversationId={activeConvId} currentUserId={profile?.id ?? ''} onBack={() => setActiveConvId(null)}
            title={group?.name ?? open?.title} sub={group ? `${group.member_ids.length} members` : open?.sub}
            mark={group ? <GroupMark size={36} /> : open?.mark} />
        ) : <MessagesEmpty text="Select a conversation to start messaging" />}
      </MessagesShell>

      {showNewDM && <NewDMModal users={users ?? []} onClose={() => setShowNewDM(false)} />}
      {showNewGroup && <NewGroupModal users={users ?? []} onClose={() => setShowNewGroup(false)} />}
    </AdminLayout>
  )
}
