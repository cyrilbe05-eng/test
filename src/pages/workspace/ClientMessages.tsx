import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { ClientLayout } from '@/components/workspace/ClientLayout'
import { useConnections, useGroups } from '@/hooks/useChat'
import { ConvRow, GroupMark, MessagesEmpty, MessagesShell, MessageThread, SideSection } from '@/components/chat/MessagesUI'
import type { ChatConnection, ChatGroup } from '@/types'

export default function ClientMessages() {
  const { profile } = useAuth()
  const { data: connections } = useConnections()
  const { data: groups } = useGroups()
  const [activeConvId, setActiveConvId] = useState<string | null>(null)

  // Only conversations this client is part of.
  const myConnections = (connections ?? []).filter((c: ChatConnection) => profile && (c.user_a === profile.id || c.user_b === profile.id))
  const myGroups = (groups ?? []).filter((g: ChatGroup) => profile && g.member_ids.includes(profile.id))
  const hasConversations = myConnections.length > 0 || myGroups.length > 0
  const group = myGroups.find((g) => g.id === activeConvId)

  return (
    <ClientLayout>
      <MessagesShell heading="My Conversations" open={!!activeConvId} side={<>
        {!hasConversations && <p className="px-5 py-2" style={{ fontSize: 12.5, color: 'var(--faint)' }}>No conversations assigned to you yet.</p>}
        {myConnections.length > 0 && (
          <SideSection title="Direct Messages">
            {myConnections.map((c) => (
              <ConvRow key={c.id} active={activeConvId === c.id} onClick={() => setActiveConvId(c.id)}
                mark={<GroupMark icon="support_agent" />} title="Support" sub="Direct message" />
            ))}
          </SideSection>
        )}
        {myGroups.length > 0 && (
          <SideSection title="Groups">
            {myGroups.map((g) => (
              <ConvRow key={g.id} active={activeConvId === g.id} onClick={() => setActiveConvId(g.id)}
                mark={<GroupMark />} title={g.name} sub={`${g.member_ids.length} members`} />
            ))}
          </SideSection>
        )}
      </>}>
        {activeConvId ? (
          <MessageThread key={activeConvId} conversationId={activeConvId} currentUserId={profile?.id ?? ''} onBack={() => setActiveConvId(null)}
            title={group?.name ?? 'Support'} sub={group ? `${group.member_ids.length} members` : 'Direct message'}
            mark={<GroupMark size={36} icon={group ? 'group' : 'support_agent'} />} />
        ) : <MessagesEmpty text={hasConversations ? 'Select a conversation to start messaging' : 'No conversations yet'} />}
      </MessagesShell>
    </ClientLayout>
  )
}
