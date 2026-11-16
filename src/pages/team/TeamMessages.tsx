import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { TeamLayout } from '@/components/workspace/TeamLayout'
import { useConnections, useGroups } from '@/hooks/useChat'
import { ConvRow, GroupMark, MessagesEmpty, MessagesShell, MessageThread, PersonMark, SideNote, SideSection } from '@/components/chat/MessagesUI'
import type { ChatConnection, ChatGroup } from '@/types'

export default function TeamMessages() {
  const { profile } = useAuth()
  const { data: connections } = useConnections()
  const { data: groups } = useGroups()
  const [activeConvId, setActiveConvId] = useState<string | null>(null)

  // Only conversations this user is part of.
  const myConnections = (connections ?? []).filter((c: ChatConnection) => profile && (c.user_a === profile.id || c.user_b === profile.id))
  const myGroups = (groups ?? []).filter((g: ChatGroup) => profile && g.member_ids.includes(profile.id))
  const other = (c: ChatConnection) => (c.user_a === profile?.id ? c.profile_b : c.profile_a)

  const conn = myConnections.find((c) => c.id === activeConvId)
  const group = myGroups.find((g) => g.id === activeConvId)
  const who = conn ? other(conn) : undefined

  return (
    <TeamLayout>
      <MessagesShell heading="Conversations" open={!!activeConvId} side={<>
        <SideSection title="Direct Messages">
          {myConnections.length === 0 && <SideNote text="No direct messages yet." />}
          {myConnections.map((c) => {
            const o = other(c)
            return <ConvRow key={c.id} active={activeConvId === c.id} onClick={() => setActiveConvId(c.id)}
              mark={<PersonMark name={o?.full_name} role={o?.role} />} title={o?.full_name ?? 'Direct message'} sub={o?.role} />
          })}
        </SideSection>
        <SideSection title="Groups">
          {myGroups.length === 0 && <SideNote text="No groups yet." />}
          {myGroups.map((g) => (
            <ConvRow key={g.id} active={activeConvId === g.id} onClick={() => setActiveConvId(g.id)}
              mark={<GroupMark />} title={g.name} sub={`${g.member_ids.length} members`} />
          ))}
        </SideSection>
      </>}>
        {activeConvId ? (
          <MessageThread key={activeConvId} conversationId={activeConvId} currentUserId={profile?.id ?? ''} onBack={() => setActiveConvId(null)}
            title={group?.name ?? who?.full_name ?? 'Direct message'}
            sub={group ? `${group.member_ids.length} members` : who?.role}
            mark={group ? <GroupMark size={36} /> : <PersonMark name={who?.full_name} role={who?.role} size={36} />} />
        ) : <MessagesEmpty text="Select a conversation to start messaging" />}
      </MessagesShell>
    </TeamLayout>
  )
}
