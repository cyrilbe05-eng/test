import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import {
  MOCK_PROFILES, MOCK_PLANS, MOCK_PROJECTS, MOCK_ASSIGNMENTS, MOCK_FILES, MOCK_COMMENTS,
  updateProfilePlan, updateClientIdLabel, formatProjectTitle, pushNotification, _projectsStore, _galleryStore,
} from '../mockData'
import { triggerNotificationUpdate } from '../useDemoNotifications'
import { addConnection, removeConnection, createGroup, deleteGroup, useDemoChat } from '../useDemoChat'
import { useDemoAuth } from '../DemoAuthContext'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { cn } from '@/lib/utils'
import DemoAdminLayout from './DemoAdminLayout'
import type { Profile } from '@/types'

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

// ── Stat block helper ──────────────────────────────────────────────────────────
function StatBlock({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-muted/40 rounded-xl p-4 text-center">
      <p className="text-2xl font-heading font-bold text-foreground">{value}</p>
      <p className="text-xs font-medium text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Profile Modal ──────────────────────────────────────────────────────────────
function UserProfileModal({ user, onClose, onImpersonate }: { user: Profile; onClose: () => void; onImpersonate: (u: Profile) => void }) {
  const isTeam = user.role === 'team'
  const isClient = user.role === 'client'

  // ── Team stats derived from mock data ──
  const assignments = MOCK_ASSIGNMENTS.filter((a) => a.team_member_id === user.id)
  const assignedProjectIds = assignments.map((a) => a.project_id)
  const assignedProjects = MOCK_PROJECTS.filter((p) => assignedProjectIds.includes(p.id))
  const completedProjects = assignedProjects.filter((p) => p.status === 'client_approved')
  const deliverables = MOCK_FILES.filter((f) => f.uploader_id === user.id && f.file_type === 'deliverable')
  // Count revision rounds this editor addressed (comments on their assigned projects by clients/admin)
  const revisionComments = MOCK_COMMENTS.filter(
    (c) => assignedProjectIds.includes(c.project_id) && c.author_role !== 'team',
  )
  const revisionRounds = revisionComments.length
  // Estimate hours: 8h per assigned project + 2h per revision comment (rough demo metric)
  const estimatedHours = assignedProjects.length * 8 + revisionRounds * 2
  const hoursPerVideo = assignedProjects.length > 0
    ? (estimatedHours / assignedProjects.length).toFixed(1)
    : '—'

  // ── Client stats derived from mock data ──
  const clientProjects = _projectsStore.filter((p) => p.client_id === user.id)
  const activeProjects = clientProjects.filter((p) => p.status !== 'client_approved')
  const doneProjects = clientProjects.filter((p) => p.status === 'client_approved')
  const totalRevisions = clientProjects.reduce((s, p) => s + p.client_revision_count, 0)
  const clientPlan = user.plan_id ? MOCK_PLANS.find((p) => p.id === user.plan_id) : null
  const galleryFiles = _galleryStore.filter((f) => f.owner_id === user.id)
  const galleryBytes = galleryFiles.reduce((s, f) => s + f.file_size, 0)
  const galleryGB = (galleryBytes / 1073741824).toFixed(2)
  const limitMb = clientPlan?.storage_limit_mb ?? -1
  const usagePct = limitMb !== -1 ? Math.min(100, (galleryBytes / (limitMb * 1048576)) * 100) : null

  const roleColor: Record<string, string> = {
    client: 'bg-green-50 text-green-700',
    team:   'bg-blue-50 text-blue-700',
    admin:  'bg-violet-50 text-violet-700',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative clay-card w-full max-w-lg animate-scale-in overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-border">
          <div className="flex items-center gap-4">
            <div className={cn(
              'w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0',
              roleColor[user.role] ?? 'bg-muted text-muted-foreground',
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

        {/* Body */}
        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Role + status badges */}
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
              <span className="text-xs bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 rounded-full font-semibold">
                {clientPlan.name} plan
              </span>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              Member since {formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}
            </span>
          </div>

          {/* ── Team stats ── */}
          {isTeam && (
            <>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Performance</p>
                <div className="grid grid-cols-2 gap-3">
                  <StatBlock label="Projects assigned" value={assignedProjects.length} />
                  <StatBlock label="Projects completed" value={completedProjects.length} />
                  <StatBlock label="Deliverables uploaded" value={deliverables.length} />
                  <StatBlock label="Revision rounds handled" value={revisionRounds} />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Time</p>
                <div className="grid grid-cols-2 gap-3">
                  <StatBlock label="Est. hours worked" value={`${estimatedHours}h`} sub="8h/project + 2h/revision" />
                  <StatBlock label="Avg hrs per video" value={`${hoursPerVideo}h`} />
                </div>
              </div>
              {assignedProjects.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Assigned Projects</p>
                  <div className="space-y-1.5">
                    {assignedProjects.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-3 bg-muted/30 rounded-lg px-3 py-2">
                        <span className="text-sm truncate flex-1">{formatProjectTitle(p.title, p.client_id)}</span>
                        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0', {
                          'bg-green-50 text-green-700': p.status === 'client_approved',
                          'bg-blue-50 text-blue-700': p.status === 'in_progress',
                          'bg-amber-50 text-amber-700': p.status === 'pending_assignment',
                          'bg-red-50 text-red-700': p.status === 'revision_requested',
                          'bg-violet-50 text-violet-700': p.status === 'in_review',
                          'bg-orange-50 text-orange-700': p.status === 'client_reviewing',
                          'bg-cyan-50 text-cyan-700': p.status === 'admin_approved',
                        })}>
                          {p.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Client stats ── */}
          {isClient && (
            <>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Projects</p>
                <div className="grid grid-cols-3 gap-3">
                  <StatBlock label="Total" value={clientProjects.length} />
                  <StatBlock label="Active" value={activeProjects.length} />
                  <StatBlock label="Completed" value={doneProjects.length} />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Usage</p>
                <div className="grid grid-cols-2 gap-3">
                  <StatBlock label="Revisions used" value={totalRevisions} />
                  <StatBlock
                    label="Time saved"
                    value={user.time_saved_hours !== null ? `${user.time_saved_hours}h` : '—'}
                  />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Storage</p>
                <div className="bg-muted/40 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>{galleryFiles.length} file{galleryFiles.length !== 1 ? 's' : ''} in gallery</span>
                    <span className="font-medium">{galleryGB} GB used</span>
                  </div>
                  {usagePct !== null && (
                    <>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', {
                            'bg-red-500': usagePct > 90,
                            'bg-amber-500': usagePct > 70 && usagePct <= 90,
                            'bg-primary': usagePct <= 70,
                          })}
                          style={{ width: `${usagePct}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {usagePct.toFixed(1)}% of {clientPlan!.storage_limit_mb >= 1024
                          ? `${clientPlan!.storage_limit_mb / 1024} GB`
                          : `${clientPlan!.storage_limit_mb} MB`} ({clientPlan!.name} plan)
                      </p>
                    </>
                  )}
                </div>
              </div>
              {clientProjects.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Projects</p>
                  <div className="space-y-1.5">
                    {clientProjects.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-3 bg-muted/30 rounded-lg px-3 py-2">
                        <span className="text-sm truncate flex-1">{p.title}</span>
                        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0', {
                          'bg-green-50 text-green-700': p.status === 'client_approved',
                          'bg-blue-50 text-blue-700': p.status === 'in_progress',
                          'bg-amber-50 text-amber-700': p.status === 'pending_assignment',
                          'bg-red-50 text-red-700': p.status === 'revision_requested',
                          'bg-violet-50 text-violet-700': p.status === 'in_review',
                          'bg-orange-50 text-orange-700': p.status === 'client_reviewing',
                          'bg-cyan-50 text-cyan-700': p.status === 'admin_approved',
                        })}>
                          {p.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer — View as */}
        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button
            onClick={() => onImpersonate(user)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            View as {user.full_name.split(' ')[0]}
          </button>
        </div>
      </div>
    </div>
  )
}

type AdminTab = 'users' | 'connections'

export default function DemoAdminUsers() {
  const { impersonate } = useDemoAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<AdminTab>('users')
  const [users, setUsers] = useState<Profile[]>(MOCK_PROFILES)
  const [profileUser, setProfileUser] = useState<Profile | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editTimeSavedId, setEditTimeSavedId] = useState<string | null>(null)
  const [timeSavedInput, setTimeSavedInput] = useState('')
  const [editClientIdId, setEditClientIdId] = useState<string | null>(null)
  const [clientIdInput, setClientIdInput] = useState('')
  const [form, setForm] = useState({ full_name: '', email: '', role: 'client', plan_id: 'plan-growth', client_id_label: '' })
  // Connections management
  const { connections, groups } = useDemoChat('user-admin', true)
  const [newConnA, setNewConnA] = useState('')
  const [newConnB, setNewConnB] = useState('')
  // Group chat creation
  const [groupName, setGroupName] = useState('')
  const [groupMembers, setGroupMembers] = useState<string[]>([])

  const disableUser = (id: string, name: string) => {
    if (!confirm(`Disable ${name}?`)) return
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, disabled: true } : u))
    toast.success(`${name} disabled (demo)`)
  }

  const createUser = () => {
    if (!form.full_name || !form.email) { toast.error('Name and email required'); return }
    const newUser: Profile = {
      id: `user-demo-${Date.now()}`,
      role: form.role as Profile['role'],
      full_name: form.full_name,
      email: form.email,
      phone: null,
      avatar_url: null,
      plan_id: form.role === 'client' ? form.plan_id : null,
      client_id_label: form.role === 'client' ? (form.client_id_label.trim() || null) : null,
      time_saved_hours: null,
      password_changed: false,
      disabled: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setUsers((prev) => [newUser, ...prev])
    toast.success(`Account created — temp password: Demo@${Math.random().toString(36).slice(2, 8)}`)
    setShowCreate(false)
    setForm({ full_name: '', email: '', role: 'client', plan_id: 'plan-growth', client_id_label: '' })
  }

  const saveTimeSaved = (id: string) => {
    const val = parseFloat(timeSavedInput)
    if (isNaN(val) || val < 0) { toast.error('Enter a valid number of hours'); return }
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, time_saved_hours: val } : u))
    toast.success('Time saved updated')
    setEditTimeSavedId(null)
    setTimeSavedInput('')
  }

  const saveClientId = (id: string) => {
    const label = clientIdInput.trim() || null
    updateClientIdLabel(id, label)
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, client_id_label: label } : u))
    toast.success('Client ID updated')
    setEditClientIdId(null)
    setClientIdInput('')
  }

  const changePlan = (userId: string, newPlanId: string) => {
    const planObj = MOCK_PLANS.find((p) => p.id === newPlanId)
    if (!planObj) return
    updateProfilePlan(userId, newPlanId)
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, plan_id: newPlanId } : u))
    const user = users.find((u) => u.id === userId)
    toast.success(`Plan updated → ${planObj.name}`)
    // Notify the client in-app + simulated email
    pushNotification({
      recipient_id: userId,
      project_id: null as unknown as string,
      type: 'project_created',
      message: `Your plan has been updated to ${planObj.name}. New limits: ${planObj.max_deliverables === -1 ? 'unlimited' : planObj.max_deliverables} deliverables, ${planObj.max_client_revisions === -1 ? 'unlimited' : planObj.max_client_revisions} revisions, ${planObj.storage_limit_mb === -1 ? 'unlimited' : `${planObj.storage_limit_mb >= 1024 ? `${planObj.storage_limit_mb / 1024} GB` : `${planObj.storage_limit_mb} MB`}`} storage.`,
    })
    triggerNotificationUpdate()
    if (user) {
      toast.info(`📧 Email sent to ${user.email}: "Your plan has been upgraded to ${planObj.name}"`, { duration: 5000 })
    }
  }

  const openTimeSavedEdit = (u: Profile) => {
    setEditTimeSavedId(u.id)
    setTimeSavedInput(u.time_saved_hours !== null ? String(u.time_saved_hours) : '')
  }

  const getProfileName = (id: string) => MOCK_PROFILES.find((p) => p.id === id)?.full_name ?? id

  const handleAddConnection = () => {
    if (!newConnA || !newConnB) { toast.error('Select both users'); return }
    if (newConnA === newConnB) { toast.error('Cannot connect a user to themselves'); return }
    addConnection(newConnA, newConnB)
    toast.success(`Connection created: ${getProfileName(newConnA)} ↔ ${getProfileName(newConnB)}`)
    setNewConnA('')
    setNewConnB('')
  }

  const handleRemoveConnection = (connId: string, nameA: string, nameB: string) => {
    if (!confirm(`Remove connection between ${nameA} and ${nameB}? Their chat history will be deleted.`)) return
    removeConnection(connId)
    toast.success('Connection removed')
  }

  const toggleGroupMember = (id: string) => {
    setGroupMembers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const handleCreateGroup = () => {
    if (!groupName.trim()) { toast.error('Group name required'); return }
    if (groupMembers.length < 2) { toast.error('Select at least 2 members'); return }
    createGroup(groupName.trim(), groupMembers)
    toast.success(`Group "${groupName.trim()}" created`)
    setGroupName('')
    setGroupMembers([])
  }

  const handleDeleteGroup = (groupId: string, name: string) => {
    if (!confirm(`Delete group "${name}"? All messages will be lost.`)) return
    deleteGroup(groupId)
    toast.success(`Group "${name}" deleted`)
  }

  // All non-admin profiles available for connections
  const connectableUsers = MOCK_PROFILES.filter((p) => p.role !== 'admin')

  const clients = users.filter((u) => u.role === 'client')
  const team = users.filter((u) => u.role === 'team')
  const admins = users.filter((u) => u.role === 'admin')

  return (
    <DemoAdminLayout>
      <main className="px-6 py-8">
        {/* Page heading */}
        <div className="flex items-center justify-between mb-6 animate-slide-up">
          <div>
            <h1 className="text-2xl font-heading font-bold">User Management</h1>
            <p className="text-muted-foreground text-sm mt-1">{users.length} accounts · {connections.length} DMs · {groups.length} groups</p>
          </div>
          {tab === 'users' && (
            <button onClick={() => setShowCreate(true)} className="btn-gradient text-sm">
              + Create Account
            </button>
          )}
        </div>

        {/* ── Tab switcher ── */}
        <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1 border border-border mb-6 w-fit animate-slide-up stagger-1">
          {([
            { id: 'users',       label: 'Users',       badge: users.length },
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
              <span className={cn(
                'text-xs px-1.5 py-0.5 rounded-full font-medium',
                tab === t.id ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground',
              )}>
                {t.badge}
              </span>
            </button>
          ))}
        </div>

        {/* ── Connections tab ── */}
        {tab === 'connections' && (
          <div className="space-y-6 animate-slide-up">
            {/* Add new connection */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="font-heading font-semibold text-sm mb-4">Add Connection</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Connecting two users allows them to exchange direct messages. Clients can only chat with the team members you connect them to.
              </p>
              <div className="flex items-end gap-3 flex-wrap">
                <div className="space-y-1.5 flex-1 min-w-[160px]">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">User A</label>
                  <select
                    value={newConnA}
                    onChange={(e) => setNewConnA(e.target.value)}
                    className="w-full px-3 py-2.5 bg-input border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select user…</option>
                    {connectableUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                    ))}
                  </select>
                </div>
                <div className="pb-2 text-muted-foreground font-bold">↔</div>
                <div className="space-y-1.5 flex-1 min-w-[160px]">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">User B</label>
                  <select
                    value={newConnB}
                    onChange={(e) => setNewConnB(e.target.value)}
                    className="w-full px-3 py-2.5 bg-input border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select user…</option>
                    {connectableUsers.filter((u) => u.id !== newConnA).map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleAddConnection}
                  disabled={!newConnA || !newConnB}
                  className="btn-gradient text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Connect
                </button>
              </div>
            </div>

            {/* Existing connections */}
            <div>
              <h2 className="font-heading font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wider">
                Active Connections ({connections.length})
              </h2>
              {connections.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-border rounded-xl text-muted-foreground text-sm">
                  No connections yet. Add one above to let users chat.
                </div>
              ) : (
                <div className="space-y-2">
                  {connections.map((conn, i) => {
                    const profA = MOCK_PROFILES.find((p) => p.id === conn.user_a)
                    const profB = MOCK_PROFILES.find((p) => p.id === conn.user_b)
                    const roleColorA: Record<string, string> = { client: 'bg-green-50 text-green-700', team: 'bg-blue-50 text-blue-700', admin: 'bg-violet-50 text-violet-700' }
                    return (
                      <div
                        key={conn.id}
                        className={cn(
                          'flex items-center gap-4 clay-card px-4 py-3 animate-slide-up',
                          `stagger-${Math.min(i + 1, 7)}`,
                        )}
                      >
                        {/* User A */}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0', roleColorA[profA?.role ?? ''] ?? 'bg-muted text-muted-foreground')}>
                            {profA?.full_name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{profA?.full_name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{profA?.role}</p>
                          </div>
                        </div>

                        {/* Connector */}
                        <div className="flex items-center gap-1 text-muted-foreground flex-shrink-0">
                          <div className="h-px w-4 bg-border" />
                          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                          </div>
                          <div className="h-px w-4 bg-border" />
                        </div>

                        {/* User B */}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0', roleColorA[profB?.role ?? ''] ?? 'bg-muted text-muted-foreground')}>
                            {profB?.full_name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{profB?.full_name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{profB?.role}</p>
                          </div>
                        </div>

                        {/* Remove button */}
                        <button
                          onClick={() => handleRemoveConnection(conn.id, profA?.full_name ?? '?', profB?.full_name ?? '?')}
                          className="ml-auto text-xs text-destructive hover:text-destructive/80 hover:bg-destructive/10 px-2 py-1 rounded-lg transition-colors flex-shrink-0"
                        >
                          Remove
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          {/* ── Create group chat ── */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-heading font-semibold text-sm mb-1">Create Group Chat</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Group chats let multiple users message each other in a shared thread.
            </p>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Group Name</label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g. Q1 Campaign Team"
                  className="w-full px-3 py-2.5 bg-input border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Members ({groupMembers.length} selected)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {connectableUsers.map((u) => {
                    const selected = groupMembers.includes(u.id)
                    const roleColor: Record<string, string> = {
                      client: 'border-green-300 bg-green-50 text-green-700',
                      team: 'border-blue-300 bg-blue-50 text-blue-700',
                    }
                    return (
                      <button
                        key={u.id}
                        onClick={() => toggleGroupMember(u.id)}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all duration-150 text-left',
                          selected
                            ? 'border-primary bg-primary/10 text-primary'
                            : `${roleColor[u.role] ?? 'border-border bg-card text-foreground'} hover:border-primary/40`,
                        )}
                      >
                        <div className={cn(
                          'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                          selected ? 'bg-primary text-white' : (roleColor[u.role] ?? 'bg-muted'),
                        )}>
                          {u.full_name.charAt(0)}
                        </div>
                        <span className="truncate text-xs font-medium">{u.full_name}</span>
                        {selected && (
                          <span className="ml-auto text-primary flex-shrink-0">✓</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
              <button
                onClick={handleCreateGroup}
                disabled={!groupName.trim() || groupMembers.length < 2}
                className="btn-gradient text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Create Group
              </button>
            </div>
          </div>

          {/* ── Existing groups ── */}
          {groups.length > 0 && (
            <div>
              <h2 className="font-heading font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wider">
                Group Chats ({groups.length})
              </h2>
              <div className="space-y-2">
                {groups.map((g, i) => {
                  const members = g.member_ids
                    .map((id) => MOCK_PROFILES.find((p) => p.id === id))
                    .filter(Boolean) as typeof MOCK_PROFILES
                  return (
                    <div
                      key={g.id}
                      className={cn(
                        'flex items-center gap-4 clay-card px-4 py-3 animate-slide-up',
                        `stagger-${Math.min(i + 1, 7)}`,
                      )}
                    >
                      {/* Group avatar stack */}
                      <div className="flex -space-x-2 flex-shrink-0">
                        {members.slice(0, 4).map((m) => (
                          <div
                            key={m.id}
                            className={cn(
                              'w-8 h-8 rounded-full border-2 border-card flex items-center justify-center text-xs font-bold',
                              m.role === 'client' ? 'bg-green-50 text-green-700' :
                              m.role === 'team' ? 'bg-blue-50 text-blue-700' : 'bg-muted text-muted-foreground',
                            )}
                            title={m.full_name}
                          >
                            {m.full_name.charAt(0)}
                          </div>
                        ))}
                        {members.length > 4 && (
                          <div className="w-8 h-8 rounded-full border-2 border-card bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                            +{members.length - 4}
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{g.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {members.map((m) => m.full_name).join(', ')}
                        </p>
                      </div>

                      {/* Member count */}
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex-shrink-0">
                        {members.length} members
                      </span>

                      {/* Delete */}
                      <button
                        onClick={() => handleDeleteGroup(g.id, g.name)}
                        className="text-xs text-destructive hover:text-destructive/80 hover:bg-destructive/10 px-2 py-1 rounded-lg transition-colors flex-shrink-0"
                      >
                        Delete
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        )}

        {/* ── Users tab ── */}
        {tab === 'users' && (<>

        {/* ── Clients table (with Time Saved column) ── */}
        <section className="mb-8 animate-slide-up stagger-1">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-heading font-semibold text-sm text-muted-foreground uppercase tracking-wider">Clients</h2>
            <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">{clients.length}</span>
          </div>
          <div className="clay-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left bg-muted/40">
                  {['Name', 'Client ID', 'Email', 'Plan', 'Time Saved', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {clients.map((u) => (
                  <tr key={u.id} className={cn('hover:bg-muted/20 transition-colors group', u.disabled && 'opacity-50')}>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setProfileUser(u)}
                        className="flex items-center gap-2.5 hover:text-primary transition-colors text-left"
                      >
                        <div className="w-7 h-7 rounded-full bg-green-50 text-green-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {u.full_name.charAt(0)}
                        </div>
                        <span className="font-medium">{u.full_name}</span>
                        <IconUser />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      {editClientIdId === u.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            value={clientIdInput}
                            onChange={(e) => setClientIdInput(e.target.value)}
                            className="w-24 px-2 py-1 bg-input border border-primary rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="e.g. CLT-003"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveClientId(u.id)
                              if (e.key === 'Escape') setEditClientIdId(null)
                            }}
                          />
                          <button onClick={() => saveClientId(u.id)} className="text-xs px-2 py-1 bg-primary rounded text-white hover:bg-primary/80 transition-colors">Save</button>
                          <button onClick={() => setEditClientIdId(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors"><IconX /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {u.client_id_label ? (
                            <span className="font-mono text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-semibold">{u.client_id_label}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                          <button
                            onClick={() => { setEditClientIdId(u.id); setClientIdInput(u.client_id_label ?? '') }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary p-1 rounded hover:bg-primary/10"
                            title="Edit client ID"
                          >
                            <IconEdit />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3">
                      <select
                        value={u.plan_id ?? ''}
                        onChange={(e) => changePlan(u.id, e.target.value)}
                        className="text-sm bg-transparent border border-border rounded-lg px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer hover:border-primary/50 transition-colors"
                      >
                        <option value="">— None —</option>
                        {MOCK_PLANS.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {editTimeSavedId === u.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={timeSavedInput}
                            onChange={(e) => setTimeSavedInput(e.target.value)}
                            className="w-20 px-2 py-1 bg-input border border-primary rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="hrs"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveTimeSaved(u.id)
                              if (e.key === 'Escape') setEditTimeSavedId(null)
                            }}
                          />
                          <button onClick={() => saveTimeSaved(u.id)} className="text-xs px-2 py-1 bg-primary rounded text-white hover:bg-primary/80 transition-colors">Save</button>
                          <button onClick={() => setEditTimeSavedId(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors"><IconX /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {u.time_saved_hours !== null ? (
                            <span className="flex items-center gap-1.5 text-amber-600 font-semibold">
                              <IconClock />
                              {u.time_saved_hours}h saved
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">Not set</span>
                          )}
                          <button
                            onClick={() => openTimeSavedEdit(u)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary p-1 rounded hover:bg-primary/10"
                            title="Edit time saved"
                          >
                            <IconEdit />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.disabled
                        ? <span className="text-xs bg-red-50 border border-red-200 text-red-700 px-2 py-0.5 rounded-full font-medium">Disabled</span>
                        : <span className="text-xs bg-green-50 border border-green-200 text-green-700 px-2 py-0.5 rounded-full font-medium">Active</span>}
                    </td>
                    <td className="px-4 py-3">
                      {!u.disabled && (
                        <button
                          onClick={() => disableUser(u.id, u.full_name)}
                          className="text-xs text-destructive hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Disable
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Team + Admin tables ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Team */}
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
                        <button
                          onClick={() => setProfileUser(u)}
                          className="flex items-center gap-2.5 hover:text-primary transition-colors text-left"
                        >
                          <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {u.full_name.charAt(0)}
                          </div>
                          <span className="font-medium">{u.full_name}</span>
                          <IconUser />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{u.email}</td>
                      <td className="px-4 py-3">
                        {u.disabled
                          ? <span className="text-xs bg-red-50 border border-red-200 text-red-700 px-2 py-0.5 rounded-full font-medium">Disabled</span>
                          : <span className="text-xs bg-green-50 border border-green-200 text-green-700 px-2 py-0.5 rounded-full font-medium">Active</span>}
                      </td>
                      <td className="px-4 py-3">
                        {!u.disabled && (
                          <button
                            onClick={() => disableUser(u.id, u.full_name)}
                            className="text-xs text-destructive hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            Disable
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Admins */}
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
                          <div className="w-7 h-7 rounded-full bg-violet-50 text-violet-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {u.full_name.charAt(0)}
                          </div>
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
        </>)}
      </main>

      <ChatPanel currentUserId="user-admin" isAdmin />

      {/* ── User profile modal ── */}
      {profileUser && (
        <UserProfileModal
          user={profileUser}
          onClose={() => setProfileUser(null)}
          onImpersonate={(u) => {
            impersonate(u)
            setProfileUser(null)
            const dest = u.role === 'client' ? '/workspace' : u.role === 'team' ? '/team' : '/admin'
            navigate(dest)
          }}
        />
      )}

      {/* ── Create user modal ── */}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => setShowCreate(false)} />
          <div className="relative clay-card w-full max-w-md animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-heading font-semibold text-lg">Create Account</h2>
              <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <IconX />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Role selector */}
              <div className="grid grid-cols-2 gap-3">
                {(['client', 'team'] as const).map((r) => (
                  <label key={r} className="relative cursor-pointer">
                    <input type="radio" value={r} checked={form.role === r} onChange={() => setForm((f) => ({ ...f, role: r }))} className="sr-only" />
                    <div className={cn(
                      'border rounded-xl p-3 text-center text-sm font-medium capitalize transition-all duration-150',
                      form.role === r
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-primary/30 text-muted-foreground',
                    )}>
                      {r}
                    </div>
                  </label>
                ))}
              </div>

              {/* Fields */}
              {[
                { label: 'Full Name', key: 'full_name', placeholder: 'Jane Smith', type: 'text' },
                { label: 'Email', key: 'email', placeholder: 'jane@example.com', type: 'email' },
              ].map(({ label, key, placeholder, type }) => (
                <div key={key} className="space-y-1.5">
                  <label className="text-sm font-medium">{label}</label>
                  <input
                    type={type}
                    value={(form as Record<string, string>)[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2.5 bg-input border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-shadow"
                  />
                </div>
              ))}

              {form.role === 'client' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Client ID <span className="text-muted-foreground font-normal">(optional)</span></label>
                    <input
                      value={form.client_id_label}
                      onChange={(e) => setForm((f) => ({ ...f, client_id_label: e.target.value }))}
                      placeholder="e.g. CLT-003"
                      className="w-full px-3 py-2.5 bg-input border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-shadow font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Plan</label>
                    <select
                      value={form.plan_id}
                      onChange={(e) => setForm((f) => ({ ...f, plan_id: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-input border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {MOCK_PLANS.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <button onClick={createUser} className="btn-gradient w-full py-2.5 text-sm">
                Create Account
              </button>
            </div>
          </div>
        </div>
      )}
    </DemoAdminLayout>
  )
}
