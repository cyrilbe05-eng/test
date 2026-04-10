import { useState } from 'react'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { useApiFetch } from '@/lib/api'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { CreateUserModal } from '@/components/admin/CreateUserModal'
import { cn } from '@/lib/utils'
import type { Profile, Plan, ChatConnection, ChatGroup } from '@/types'

interface UserRow extends Profile {
  plans: { name: string; storage_limit_mb: number } | null
  used_bytes: number
}

// ── Icons ──────────────────────────────────────────────────────────────────────
function IconX() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
function IconEdit() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  )
}
function IconClock() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
function IconUser() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}

function StatBlock({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-muted/40 rounded-xl p-4 text-center">
      <p className="text-2xl font-heading font-bold text-foreground">{value}</p>
      <p className="text-xs font-medium text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
    </div>
  )
}

function UserProfileModal({ user, plans, onClose }: { user: UserRow; plans: Plan[]; onClose: () => void }) {
  const apiFetch = useApiFetch()
  const qc = useQueryClient()
  const isClient = user.role === 'client'
  const isTeam = user.role === 'team'
  const clientPlan = plans.find((p) => p.id === user.plan_id) ?? null
  const limitMb = clientPlan?.storage_limit_mb ?? -1
  const usedBytes = user.used_bytes ?? 0
  const usedMb = usedBytes / 1048576
  const usagePct = limitMb !== -1 ? Math.min(100, (usedMb / limitMb) * 100) : null

  const handleChangePlan = async (newPlanId: string) => {
    try {
      await apiFetch(`/api/users/${user.id}/update`, {
        method: 'PATCH',
        body: JSON.stringify({ plan_id: newPlanId }),
      })
      toast.success('Plan updated')
      qc.invalidateQueries({ queryKey: ['all_users'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleSaveTimeSaved = async (val: string) => {
    const num = parseFloat(val)
    if (isNaN(num) || num < 0) { toast.error('Enter a valid number'); return }
    try {
      await apiFetch(`/api/users/${user.id}/update`, {
        method: 'PATCH',
        body: JSON.stringify({ time_saved_hours: num }),
      })
      toast.success('Time saved updated')
      qc.invalidateQueries({ queryKey: ['all_users'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleSaveClientId = async (val: string) => {
    try {
      await apiFetch(`/api/users/${user.id}/update`, {
        method: 'PATCH',
        body: JSON.stringify({ client_id_label: val.trim() || null }),
      })
      toast.success('Client ID updated')
      qc.invalidateQueries({ queryKey: ['all_users'] })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const [editTimeSaved, setEditTimeSaved] = useState(false)
  const [timeSavedInput, setTimeSavedInput] = useState(user.time_saved_hours !== null ? String(user.time_saved_hours) : '')
  const [editClientId, setEditClientId] = useState(false)
  const [clientIdInput, setClientIdInput] = useState(user.client_id_label ?? '')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative clay-card w-full max-w-lg animate-scale-in overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-border">
          <div className="flex items-center gap-4">
            <div className={cn(
              'w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0',
              user.role === 'client' ? 'bg-green-50 text-green-700' :
              user.role === 'team' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700',
            )}>
              {user.full_name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-heading font-bold">{user.full_name}</h2>
                {user.client_id_label && (
                  <span className="font-mono text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-semibold">{user.client_id_label}</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              {user.phone && <p className="text-xs text-muted-foreground mt-0.5">{user.phone}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground mt-0.5">
            <IconX />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full capitalize border', {
              'bg-green-50 text-green-700 border-green-200': user.role === 'client',
              'bg-blue-50 text-blue-700 border-blue-200': user.role === 'team',
              'bg-violet-50 text-violet-700 border-violet-200': user.role === 'admin',
            })}>
              {user.role}
            </span>
            {user.disabled
              ? <span className="text-xs bg-red-50 border border-red-200 text-red-700 px-2.5 py-1 rounded-full font-semibold">Disabled</span>
              : <span className="text-xs bg-green-50 border border-green-200 text-green-700 px-2.5 py-1 rounded-full font-semibold">Active</span>}
            {isClient && clientPlan && (
              <span className="text-xs bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 rounded-full font-semibold">{clientPlan.name} plan</span>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              Member since {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
            </span>
          </div>

          {/* Client section */}
          {isClient && (
            <>
              {/* Plan selector */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Plan</p>
                <select
                  value={user.plan_id ?? ''}
                  onChange={(e) => handleChangePlan(e.target.value)}
                  className="w-full px-3 py-2.5 bg-input border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">— None —</option>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {/* Client ID */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Client ID</p>
                {editClientId ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={clientIdInput}
                      onChange={(e) => setClientIdInput(e.target.value)}
                      placeholder="e.g. CLT-003"
                      className="flex-1 px-3 py-2 bg-input border border-primary rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') { handleSaveClientId(clientIdInput); setEditClientId(false) } if (e.key === 'Escape') setEditClientId(false) }}
                    />
                    <button onClick={() => { handleSaveClientId(clientIdInput); setEditClientId(false) }} className="px-3 py-2 bg-primary rounded-xl text-white text-sm hover:bg-primary/80 transition-colors">Save</button>
                    <button onClick={() => setEditClientId(false)} className="p-2 text-muted-foreground hover:text-foreground transition-colors"><IconX /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {user.client_id_label
                      ? <span className="font-mono text-sm bg-primary/10 text-primary px-2.5 py-1 rounded font-semibold">{user.client_id_label}</span>
                      : <span className="text-muted-foreground text-sm">Not set</span>}
                    <button onClick={() => setEditClientId(true)} className="p-1 text-muted-foreground hover:text-primary rounded hover:bg-primary/10 transition-colors"><IconEdit /></button>
                  </div>
                )}
              </div>

              {/* Time saved */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Time Saved</p>
                {editTimeSaved ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min="0" step="0.5"
                      value={timeSavedInput}
                      onChange={(e) => setTimeSavedInput(e.target.value)}
                      placeholder="hours"
                      className="w-28 px-3 py-2 bg-input border border-primary rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') { handleSaveTimeSaved(timeSavedInput); setEditTimeSaved(false) } if (e.key === 'Escape') setEditTimeSaved(false) }}
                    />
                    <button onClick={() => { handleSaveTimeSaved(timeSavedInput); setEditTimeSaved(false) }} className="px-3 py-2 bg-primary rounded-xl text-white text-sm hover:bg-primary/80 transition-colors">Save</button>
                    <button onClick={() => setEditTimeSaved(false)} className="p-2 text-muted-foreground hover:text-foreground transition-colors"><IconX /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {user.time_saved_hours !== null
                      ? <span className="flex items-center gap-1.5 text-amber-600 font-semibold"><IconClock />{user.time_saved_hours}h saved</span>
                      : <span className="text-muted-foreground text-sm">Not set</span>}
                    <button onClick={() => setEditTimeSaved(true)} className="p-1 text-muted-foreground hover:text-primary rounded hover:bg-primary/10 transition-colors"><IconEdit /></button>
                  </div>
                )}
              </div>

              {/* Storage */}
              {clientPlan && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Storage</p>
                  <div className="bg-muted/40 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>{formatBytes(usedBytes)} used</span>
                      {limitMb !== -1 && <span className="font-medium">{limitMb >= 1024 ? `${limitMb / 1024} GB` : `${limitMb} MB`} limit</span>}
                    </div>
                    {usagePct !== null && (
                      <>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all', {
                            'bg-red-500': usagePct > 90,
                            'bg-amber-500': usagePct > 70 && usagePct <= 90,
                            'bg-primary': usagePct <= 70,
                          })} style={{ width: `${usagePct}%` }} />
                        </div>
                        <p className="text-xs text-muted-foreground">{usagePct.toFixed(1)}% used</p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Team stats */}
          {isTeam && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Account</p>
              <div className="grid grid-cols-2 gap-3">
                <StatBlock label="Member since" value={formatDistanceToNow(new Date(user.created_at))} />
                <StatBlock label="Status" value={user.disabled ? 'Disabled' : 'Active'} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

type AdminTab = 'users' | 'connections'

export default function AdminUserManagement() {
  const [showCreate, setShowCreate] = useState(false)
  const [profileUser, setProfileUser] = useState<UserRow | null>(null)
  const [tab, setTab] = useState<AdminTab>('users')
  const [newConnA, setNewConnA] = useState('')
  const [newConnB, setNewConnB] = useState('')
  const [groupName, setGroupName] = useState('')
  const [groupMembers, setGroupMembers] = useState<string[]>([])
  const qc = useQueryClient()
  const apiFetch = useApiFetch()

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['all_users'],
    queryFn: () => apiFetch<UserRow[]>('/api/users'),
  })
  const { data: plans = [] } = useQuery({
    queryKey: ['plans'],
    queryFn: () => apiFetch<Plan[]>('/api/plans'),
  })
  const { data: connections = [] } = useQuery({
    queryKey: ['connections'],
    queryFn: () => apiFetch<ChatConnection[]>('/api/messages/connections'),
  })
  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: () => apiFetch<ChatGroup[]>('/api/messages/groups'),
  })

  const disableUser = async (userId: string, name: string) => {
    if (!confirm('Disable account for ' + name + '?')) return
    try {
      await apiFetch('/api/users/' + userId + '/disable', { method: 'PATCH' })
      toast.success(name + "'s account disabled")
      qc.invalidateQueries({ queryKey: ['all_users'] })
    } catch (err) { toast.error((err as Error).message) }
  }

  const enableUser = async (userId: string, name: string) => {
    try {
      await apiFetch('/api/users/' + userId + '/enable', { method: 'PATCH' })
      toast.success(name + "'s account re-enabled")
      qc.invalidateQueries({ queryKey: ['all_users'] })
    } catch (err) { toast.error((err as Error).message) }
  }

  const deleteUser = async (userId: string, name: string) => {
    if (!confirm(`Permanently delete "${name}"? This cannot be undone.`)) return
    try {
      await apiFetch('/api/users/' + userId, { method: 'DELETE' })
      toast.success(name + ' deleted')
      qc.invalidateQueries({ queryKey: ['all_users'] })
    } catch (err) { toast.error((err as Error).message) }
  }

  const addConnection = async () => {
    if (!newConnA || !newConnB) { toast.error('Select both users'); return }
    if (newConnA === newConnB) { toast.error('Cannot connect a user to themselves'); return }
    try {
      await apiFetch('/api/messages/connections', {
        method: 'POST',
        body: JSON.stringify({ user_a: newConnA, user_b: newConnB }),
      })
      toast.success('Connection created')
      setNewConnA(''); setNewConnB('')
      qc.invalidateQueries({ queryKey: ['connections'] })
    } catch (err) { toast.error((err as Error).message) }
  }

  const removeConnection = async (connId: string, nameA: string, nameB: string) => {
    if (!confirm(`Remove connection between ${nameA} and ${nameB}?`)) return
    try {
      await apiFetch('/api/messages/connections/' + connId, { method: 'DELETE' })
      toast.success('Connection removed')
      qc.invalidateQueries({ queryKey: ['connections'] })
    } catch (err) { toast.error((err as Error).message) }
  }

  const createGroup = async () => {
    if (!groupName.trim()) { toast.error('Group name required'); return }
    if (groupMembers.length < 2) { toast.error('Select at least 2 members'); return }
    try {
      await apiFetch('/api/messages/groups', {
        method: 'POST',
        body: JSON.stringify({ name: groupName.trim(), member_ids: groupMembers }),
      })
      toast.success(`Group "${groupName}" created`)
      setGroupName(''); setGroupMembers([])
      qc.invalidateQueries({ queryKey: ['groups'] })
    } catch (err) { toast.error((err as Error).message) }
  }

  const deleteGroup = async (groupId: string, name: string) => {
    if (!confirm(`Delete group "${name}"?`)) return
    try {
      await apiFetch('/api/messages/groups/' + groupId, { method: 'DELETE' })
      toast.success(`Group "${name}" deleted`)
      qc.invalidateQueries({ queryKey: ['groups'] })
    } catch (err) { toast.error((err as Error).message) }
  }

  const toggleGroupMember = (id: string) =>
    setGroupMembers((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  const clients = users.filter((u) => u.role === 'client')
  const team = users.filter((u) => u.role === 'team')
  const admins = users.filter((u) => u.role === 'admin')
  const connectableUsers = users.filter((u) => u.role !== 'admin')

  return (
    <AdminLayout>
      <main className="px-6 py-8">
        {/* Heading */}
        <div className="flex items-center justify-between mb-6 animate-slide-up">
          <div>
            <h1 className="text-2xl font-heading font-bold">User Management</h1>
            <p className="text-muted-foreground text-sm mt-1">{users.length} accounts · {connections.length} DMs · {groups.length} groups</p>
          </div>
          {tab === 'users' && (
            <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-primary rounded-xl text-white text-sm font-semibold shadow-clay hover:brightness-110 transition-all active:scale-[0.98]">
              + Create Account
            </button>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1 border border-border mb-6 w-fit animate-slide-up stagger-1">
          {([
            { id: 'users', label: 'Users', badge: users.length },
            { id: 'connections', label: 'Connections', badge: connections.length + groups.length },
          ] as { id: AdminTab; label: string; badge: number }[]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                tab === t.id ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
              <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', tab === t.id ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground')}>
                {t.badge}
              </span>
            </button>
          ))}
        </div>

        {/* ── Connections tab ── */}
        {tab === 'connections' && (
          <div className="space-y-6 animate-slide-up">
            {/* Add connection */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="font-heading font-semibold text-sm mb-2">Add Connection</h2>
              <p className="text-xs text-muted-foreground mb-4">Connecting two users allows them to exchange direct messages.</p>
              <div className="flex items-end gap-3 flex-wrap">
                <div className="space-y-1.5 flex-1 min-w-[160px]">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">User A</label>
                  <select value={newConnA} onChange={(e) => setNewConnA(e.target.value)} className="w-full px-3 py-2.5 bg-input border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="">Select user…</option>
                    {connectableUsers.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
                  </select>
                </div>
                <div className="pb-2 text-muted-foreground font-bold">↔</div>
                <div className="space-y-1.5 flex-1 min-w-[160px]">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">User B</label>
                  <select value={newConnB} onChange={(e) => setNewConnB(e.target.value)} className="w-full px-3 py-2.5 bg-input border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="">Select user…</option>
                    {connectableUsers.filter((u) => u.id !== newConnA).map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
                  </select>
                </div>
                <button onClick={addConnection} disabled={!newConnA || !newConnB} className="px-4 py-2.5 bg-primary rounded-xl text-white text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  Connect
                </button>
              </div>
            </div>

            {/* Existing connections */}
            <div>
              <h2 className="font-heading font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wider">Active Connections ({connections.length})</h2>
              {connections.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-border rounded-xl text-muted-foreground text-sm">No connections yet.</div>
              ) : (
                <div className="space-y-2">
                  {connections.map((conn) => {
                    const profA = users.find((p) => p.id === conn.user_a)
                    const profB = users.find((p) => p.id === conn.user_b)
                    return (
                      <div key={conn.id} className="flex items-center gap-4 clay-card px-4 py-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0', profA?.role === 'client' ? 'bg-green-50 text-green-700' : profA?.role === 'team' ? 'bg-blue-50 text-blue-700' : 'bg-muted text-muted-foreground')}>
                            {profA?.full_name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{profA?.full_name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{profA?.role}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground flex-shrink-0">
                          <div className="h-px w-4 bg-border" />
                          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                          </div>
                          <div className="h-px w-4 bg-border" />
                        </div>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0', profB?.role === 'client' ? 'bg-green-50 text-green-700' : profB?.role === 'team' ? 'bg-blue-50 text-blue-700' : 'bg-muted text-muted-foreground')}>
                            {profB?.full_name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{profB?.full_name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{profB?.role}</p>
                          </div>
                        </div>
                        <button onClick={() => removeConnection(conn.id, profA?.full_name ?? '?', profB?.full_name ?? '?')} className="ml-auto text-xs text-destructive hover:bg-destructive/10 px-2 py-1 rounded-lg transition-colors flex-shrink-0">
                          Remove
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Create group */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="font-heading font-semibold text-sm mb-1">Create Group Chat</h2>
              <p className="text-xs text-muted-foreground mb-4">Group chats let multiple users message each other in a shared thread.</p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Group Name</label>
                  <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. Q1 Campaign Team" className="w-full px-3 py-2.5 bg-input border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Members ({groupMembers.length} selected)</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {connectableUsers.map((u) => {
                      const selected = groupMembers.includes(u.id)
                      return (
                        <button key={u.id} onClick={() => toggleGroupMember(u.id)} className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all duration-150 text-left',
                          selected ? 'border-primary bg-primary/10 text-primary' :
                          u.role === 'client' ? 'border-green-300 bg-green-50 text-green-700 hover:border-primary/40' :
                          'border-blue-300 bg-blue-50 text-blue-700 hover:border-primary/40',
                        )}>
                          <div className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0', selected ? 'bg-primary text-white' : u.role === 'client' ? 'bg-green-100' : 'bg-blue-100')}>
                            {u.full_name.charAt(0)}
                          </div>
                          <span className="truncate text-xs font-medium">{u.full_name}</span>
                          {selected && <span className="ml-auto text-primary flex-shrink-0">✓</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <button onClick={createGroup} disabled={!groupName.trim() || groupMembers.length < 2} className="px-4 py-2.5 bg-primary rounded-xl text-white text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  Create Group
                </button>
              </div>
            </div>

            {/* Existing groups */}
            {groups.length > 0 && (
              <div>
                <h2 className="font-heading font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wider">Group Chats ({groups.length})</h2>
                <div className="space-y-2">
                  {groups.map((g) => {
                    const members = (g.member_ids ?? []).map((id) => users.find((u) => u.id === id)).filter(Boolean) as UserRow[]
                    return (
                      <div key={g.id} className="flex items-center gap-4 clay-card px-4 py-3">
                        <div className="flex -space-x-2 flex-shrink-0">
                          {members.slice(0, 4).map((m) => (
                            <div key={m.id} className={cn('w-8 h-8 rounded-full border-2 border-card flex items-center justify-center text-xs font-bold', m.role === 'client' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700')} title={m.full_name}>
                              {m.full_name.charAt(0)}
                            </div>
                          ))}
                          {members.length > 4 && <div className="w-8 h-8 rounded-full border-2 border-card bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">+{members.length - 4}</div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{g.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{members.map((m) => m.full_name).join(', ')}</p>
                        </div>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex-shrink-0">{members.length} members</span>
                        <button onClick={() => deleteGroup(g.id, g.name)} className="text-xs text-destructive hover:bg-destructive/10 px-2 py-1 rounded-lg transition-colors flex-shrink-0">Delete</button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Users tab ── */}
        {tab === 'users' && (
          isLoading ? (
            <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
          ) : (<>
            {/* Clients */}
            <section className="mb-8 animate-slide-up stagger-1">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="font-heading font-semibold text-sm text-muted-foreground uppercase tracking-wider">Clients</h2>
                <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">{clients.length}</span>
              </div>
              <div className="clay-card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left bg-muted/40">
                      {['Name', 'Client ID', 'Email', 'Plan', 'Storage', 'Time Saved', 'Status', 'Actions'].map((h) => (
                        <th key={h} className="px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {clients.map((u) => {
                      const limitMb = u.plans?.storage_limit_mb ?? -1
                      const usedMb = (u.used_bytes ?? 0) / 1048576
                      const pct = limitMb !== -1 && limitMb > 0 ? Math.min(100, (usedMb / limitMb) * 100) : 0
                      const barColor = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-400' : 'bg-primary'
                      return (
                        <tr key={u.id} className={cn('hover:bg-muted/20 transition-colors group', u.disabled && 'opacity-50')}>
                          <td className="px-4 py-3">
                            <button onClick={() => setProfileUser(u)} className="flex items-center gap-2.5 hover:text-primary transition-colors text-left">
                              <div className="w-7 h-7 rounded-full bg-green-50 text-green-700 flex items-center justify-center text-xs font-bold flex-shrink-0">{u.full_name.charAt(0)}</div>
                              <span className="font-medium">{u.full_name}</span>
                              <span className="opacity-0 group-hover:opacity-100 transition-opacity"><IconUser /></span>
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            {u.client_id_label
                              ? <span className="font-mono text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-semibold">{u.client_id_label}</span>
                              : <span className="text-muted-foreground text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{u.email}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{u.plans?.name ?? '—'}</td>
                          <td className="px-4 py-3 min-w-[120px]">
                            {u.plans ? (
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">{formatBytes(u.used_bytes ?? 0)}{limitMb !== -1 && ` / ${formatBytes(limitMb * 1048576)}`}</p>
                                {limitMb !== -1 && <div className="h-1.5 bg-muted rounded-full overflow-hidden w-20"><div className={`h-full rounded-full ${barColor}`} style={{ width: pct + '%' }} /></div>}
                              </div>
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {u.time_saved_hours !== null
                              ? <span className="flex items-center gap-1 text-amber-600 font-semibold text-xs"><IconClock />{u.time_saved_hours}h</span>
                              : <span className="text-muted-foreground text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {u.disabled
                              ? <span className="text-xs bg-red-50 border border-red-200 text-red-700 px-2 py-0.5 rounded-full font-medium">Disabled</span>
                              : <span className="text-xs bg-green-50 border border-green-200 text-green-700 px-2 py-0.5 rounded-full font-medium">Active</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              {u.disabled
                                ? <button onClick={() => enableUser(u.id, u.full_name)} className="text-xs text-primary hover:underline">Enable</button>
                                : <button onClick={() => disableUser(u.id, u.full_name)} className="text-xs text-muted-foreground hover:text-foreground hover:underline">Disable</button>}
                              <button onClick={() => deleteUser(u.id, u.full_name)} className="text-xs text-destructive hover:underline">Delete</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {clients.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">No clients yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Team + Admins */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <section className="animate-slide-up stagger-2">
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="font-heading font-semibold text-sm text-muted-foreground uppercase tracking-wider">Team</h2>
                  <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">{team.length}</span>
                </div>
                <div className="clay-card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left bg-muted/40">
                        {['Name', 'Email', 'Status', 'Actions'].map((h) => (
                          <th key={h} className="px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {team.map((u) => (
                        <tr key={u.id} className={cn('hover:bg-muted/20 transition-colors group', u.disabled && 'opacity-50')}>
                          <td className="px-4 py-3">
                            <button onClick={() => setProfileUser(u)} className="flex items-center gap-2.5 hover:text-primary transition-colors text-left">
                              <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">{u.full_name.charAt(0)}</div>
                              <span className="font-medium">{u.full_name}</span>
                            </button>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{u.email}</td>
                          <td className="px-4 py-3">
                            {u.disabled
                              ? <span className="text-xs bg-red-50 border border-red-200 text-red-700 px-2 py-0.5 rounded-full font-medium">Disabled</span>
                              : <span className="text-xs bg-green-50 border border-green-200 text-green-700 px-2 py-0.5 rounded-full font-medium">Active</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              {u.disabled
                                ? <button onClick={() => enableUser(u.id, u.full_name)} className="text-xs text-primary hover:underline">Enable</button>
                                : <button onClick={() => disableUser(u.id, u.full_name)} className="text-xs text-muted-foreground hover:text-foreground hover:underline">Disable</button>}
                              <button onClick={() => deleteUser(u.id, u.full_name)} className="text-xs text-destructive hover:underline">Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {team.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">No team members yet</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="animate-slide-up stagger-3">
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="font-heading font-semibold text-sm text-muted-foreground uppercase tracking-wider">Admins</h2>
                  <span className="text-xs bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full font-medium">{admins.length}</span>
                </div>
                <div className="clay-card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left bg-muted/40">
                        {['Name', 'Email'].map((h) => (
                          <th key={h} className="px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {admins.map((u) => (
                        <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-violet-50 text-violet-700 flex items-center justify-center text-xs font-bold flex-shrink-0">{u.full_name.charAt(0)}</div>
                              <span className="font-medium">{u.full_name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{u.email}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </>)
        )}
      </main>

      {profileUser && (
        <UserProfileModal
          user={profileUser}
          plans={plans}
          onClose={() => setProfileUser(null)}
        />
      )}
      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['all_users'] })}
        />
      )}
    </AdminLayout>
  )
}
