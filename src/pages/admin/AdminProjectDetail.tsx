import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getSignedUrlById } from '@/lib/storage'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { useProject, useProjectFiles, useProjectAssignments, useTimelineComments, useUpdateProjectStatus } from '@/hooks/useProjects'
import { TimelineCommentor } from '@/components/project/TimelineCommentor'
import { ProjectStatusBadge } from '@/components/project/ProjectStatusBadge'
import { DeliverableCounter } from '@/components/project/DeliverableCounter'
import { useAuth } from '@/hooks/useAuth'
import { useApiFetch } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { AdminLayout } from '@/components/admin/AdminLayout'
import type { Profile } from '@/types'

interface Deadline {
  id: string
  project_id: string
  team_member_id: string
  assignment_id: string
  due_at: string
  status: 'met' | 'missed' | 'pending'
  member_full_name: string
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('clay-card p-4', className)}>
      <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-3">{title}</h3>
      {children}
    </div>
  )
}

function FileRow({ name, size, fileId }: { name: string; size: number | null; fileId: string }) {
  const apiFetch = useApiFetch()
  const handleDownload = async () => {
    const url = await getSignedUrlById(apiFetch, fileId)
    window.open(url, '_blank')
  }
  return (
    <button onClick={handleDownload} className="flex items-center gap-2 w-full text-left hover:text-primary transition-colors text-sm group py-1">
      <svg className="w-4 h-4 text-muted-foreground group-hover:text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
      </svg>
      <span className="truncate">{name}</span>
      {size && <span className="text-muted-foreground ml-auto flex-shrink-0 text-xs">{formatBytes(size)}</span>}
    </button>
  )
}

export default function AdminProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const { data: project, isLoading } = useProject(id)
  const { data: files } = useProjectFiles(id)
  const { data: assignments } = useProjectAssignments(id)
  const { data: comments, refetch: refetchComments } = useTimelineComments(id)
  const updateStatus = useUpdateProjectStatus()
  const [selectedTeamMember, setSelectedTeamMember] = useState('')
  const [theater, setTheater] = useState(false)
  const [activeTab, setActiveTab] = useState<'review' | 'storage'>('review')
  const [editDeadlineId, setEditDeadlineId] = useState<string | null>(null)
  const [editDeadlineValue, setEditDeadlineValue] = useState('')

  const apiFetch = useApiFetch()
  const { data: teamMembers } = useQuery<Profile[]>({
    queryKey: ['team_members'],
    queryFn: () => apiFetch<Profile[]>('/api/users/team'),
  })

  const { data: deadlines = [], refetch: refetchDeadlines } = useQuery<Deadline[]>({
    queryKey: ['project_deadlines', id],
    queryFn: () => apiFetch<Deadline[]>(`/api/deadlines/project/${id}`),
    enabled: !!id,
  })

  const deliverables = (files ?? []).filter((f) => f.file_type === 'deliverable')
  const sourceFiles = (files ?? []).filter((f) => f.file_type !== 'deliverable')
  const latestDeliverable = deliverables[0]

  const assignTeamMember = async () => {
    if (!selectedTeamMember || !id || !profile) return
    try {
      await apiFetch('/api/projects/' + id + '/assign', {
        method: 'POST',
        body: JSON.stringify({ team_member_id: selectedTeamMember }),
      })
      qc.invalidateQueries({ queryKey: ['project_assignments', id] })
      qc.invalidateQueries({ queryKey: ['project', id] })
      qc.invalidateQueries({ queryKey: ['project_deadlines', id] })
      toast.success('Team member assigned')
      setSelectedTeamMember('')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleApprove = async () => {
    if (!id) return
    await updateStatus.mutateAsync({ id, status: 'admin_approved' })
    toast.success('Project approved — client notified')
  }

  const handleReject = async () => {
    if (!id || !comments?.length) {
      toast.error('Add at least one timeline comment before rejecting')
      return
    }
    await updateStatus.mutateAsync({ id, status: 'revision_requested' })
    toast.success('Revision requested')
  }

  const saveDeadlineEdit = async (deadlineId: string) => {
    if (!editDeadlineValue) return
    try {
      await apiFetch(`/api/deadlines/${deadlineId}`, {
        method: 'PATCH',
        body: JSON.stringify({ due_at: new Date(editDeadlineValue).toISOString() }),
      })
      toast.success('Deadline updated')
      setEditDeadlineId(null)
      refetchDeadlines()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  if (isLoading || !project) return <Loader />

  const assignedIds = new Set((assignments ?? []).map((a) => a.team_member_id))
  const unassignedTeam = (teamMembers ?? []).filter((m) => !assignedIds.has(m.id))
  const revisionRound = project.client_revision_count + 1
  const client = (project as any).profiles

  return (
    <AdminLayout>
      {/* Breadcrumb header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-20" style={{ height: '52px' }}>
        <div className="h-full flex items-center px-4 gap-3">
          <Link to="/admin" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="hidden sm:inline">Projects</span>
          </Link>
          <span className="text-border/60">/</span>
          <span className="text-sm font-medium truncate max-w-xs">{project.title}</span>
          <div className="ml-auto"><ProjectStatusBadge status={project.status} /></div>
        </div>
      </header>

      <div className="flex" style={{ minHeight: 'calc(100vh - 52px)' }}>
        {/* ── Left metadata sidebar ── */}
        <aside className="w-56 border-r border-border bg-card/20 flex flex-col overflow-y-auto p-3 space-y-3 flex-shrink-0">
          {/* Client */}
          {client && (
            <Section title="Client">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-green-50 text-green-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {client.full_name?.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{client.full_name}</p>
                  {client.email && <p className="text-xs text-muted-foreground truncate">{client.email}</p>}
                </div>
              </div>
            </Section>
          )}

          {/* Source files */}
          <Section title="Source Files">
            {sourceFiles.length === 0
              ? <p className="text-xs text-muted-foreground">None uploaded</p>
              : sourceFiles.map((f) => <FileRow key={f.id} name={f.file_name} size={f.file_size} fileId={f.id} />)}
          </Section>

          {/* Deliverables */}
          <Section title="Deliverables">
            <DeliverableCounter used={deliverables.length} max={project.max_deliverables} />
            <div className="mt-2 space-y-0.5">
              {deliverables.map((f) => <FileRow key={f.id} name={f.file_name} size={f.file_size} fileId={f.id} />)}
            </div>
          </Section>

          {/* Team assignment */}
          <Section title="Assigned Team">
            {(assignments ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground mb-2">Unassigned</p>
            )}
            {(assignments ?? []).map((a) => {
              const dl = deadlines.find((d) => d.assignment_id === a.id)
              return (
                <div key={a.id} className="mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {a.profiles.full_name.charAt(0)}
                    </div>
                    <span className="text-xs font-medium">{a.profiles.full_name}</span>
                  </div>
                  {dl && (
                    <div className="ml-8">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={cn(
                          'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                          dl.status === 'met' ? 'bg-green-100 text-green-700' :
                          dl.status === 'missed' ? 'bg-red-100 text-red-700' :
                          'bg-orange-100 text-orange-700',
                        )}>
                          {dl.status === 'met' ? '✓ Met' : dl.status === 'missed' ? '✗ Missed' : '⏰ Pending'}
                        </span>
                        {editDeadlineId === dl.id ? (
                          <div className="flex items-center gap-1 mt-1">
                            <input
                              type="datetime-local"
                              value={editDeadlineValue}
                              onChange={(e) => setEditDeadlineValue(e.target.value)}
                              className="text-[10px] px-1.5 py-0.5 border border-border rounded bg-input"
                            />
                            <button onClick={() => saveDeadlineEdit(dl.id)} className="text-[10px] text-primary hover:underline">Save</button>
                            <button onClick={() => setEditDeadlineId(null)} className="text-[10px] text-muted-foreground hover:underline">✕</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditDeadlineId(dl.id); setEditDeadlineValue(dl.due_at.slice(0, 16)) }}
                            className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
                          >
                            Due {new Date(dl.due_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} ✎
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {unassignedTeam.length > 0 && (
              <div className="flex gap-1.5 mt-1">
                <select
                  value={selectedTeamMember}
                  onChange={(e) => setSelectedTeamMember(e.target.value)}
                  className="flex-1 px-2 py-1.5 bg-input border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Assign…</option>
                  {unassignedTeam.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
                <button
                  onClick={assignTeamMember}
                  disabled={!selectedTeamMember}
                  className="px-2.5 py-1.5 bg-primary rounded-lg text-white text-xs disabled:opacity-40 hover:bg-primary/90 transition-colors"
                >
                  +
                </button>
              </div>
            )}
          </Section>

          {/* Inspiration URL */}
          {project.inspiration_url && (
            <Section title="Inspiration Video">
              <a
                href={project.inspiration_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline break-all leading-relaxed"
              >
                {project.inspiration_url}
              </a>
            </Section>
          )}

          {/* Video script */}
          {project.video_script && (
            <Section title="Video Script">
              <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{project.video_script}</p>
            </Section>
          )}

          {/* Instructions */}
          {project.instructions && (
            <Section title="Instructions">
              <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{project.instructions}</p>
            </Section>
          )}
        </aside>

        {/* ── Main ── */}
        <div className="flex-1 overflow-y-auto">
          <div className={cn('px-6 pt-6 pb-12 mx-auto transition-all duration-300', theater ? 'max-w-full' : 'max-w-3xl')}>
            <div className="mb-4">
              <h1 className="text-xl font-heading font-semibold tracking-tight">{project.title}</h1>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-5 border-b border-border">
              {(['review', 'storage'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors',
                    activeTab === tab
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab === 'review' ? '🎬 Review' : '📁 Storage'}
                </button>
              ))}
            </div>

            {/* Storage tab */}
            {activeTab === 'storage' && (
              <div className="space-y-4 animate-slide-up">
                {/* Deliverables */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Deliverables</h3>
                  {deliverables.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No deliverables yet</p>
                  ) : (
                    <div className="clay-card divide-y divide-border/50">
                      {deliverables.map((f) => (
                        <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{f.file_name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {f.file_size ? formatBytes(f.file_size) : '—'} · {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}
                            </p>
                          </div>
                          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', f.approved ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200')}>
                            {f.approved ? 'Approved' : 'Pending'}
                          </span>
                          <FileRow name="" size={null} fileId={f.id} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Source files */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Source Files</h3>
                  {sourceFiles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No source files</p>
                  ) : (
                    <div className="clay-card divide-y divide-border/50">
                      {sourceFiles.map((f) => (
                        <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{f.file_name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {f.file_size ? formatBytes(f.file_size) : '—'} · {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}
                            </p>
                          </div>
                          <FileRow name="" size={null} fileId={f.id} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Review tab */}
            {activeTab === 'review' && (
              <div className="animate-slide-up">
                {latestDeliverable ? (
                  <TimelineCommentor
                    storageKey={latestDeliverable.storage_key}
                    fileId={latestDeliverable.id}
                    projectId={project.id}
                    comments={comments ?? []}
                    currentUserId={profile!.id}
                    currentUserRole="admin"
                    canComment={true}
                    revisionRound={revisionRound}
                    onCommentAdded={() => refetchComments()}
                    theater={theater}
                    onTheaterToggle={() => setTheater((t) => !t)}
                  />
                ) : (
                  <div className="aspect-video bg-muted rounded-2xl flex items-center justify-center border border-border/60">
                    <p className="text-muted-foreground text-sm">No deliverable uploaded yet</p>
                  </div>
                )}

                {/* Admin review actions */}
                {project.status === 'in_review' && (
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={handleApprove}
                      className="px-5 py-2.5 bg-green-600 rounded-xl text-white font-semibold text-sm hover:brightness-110 transition-all active:scale-[0.98] shadow-sm"
                    >
                      Approve for Client
                    </button>
                    <button
                      onClick={handleReject}
                      className="px-5 py-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 font-semibold text-sm hover:bg-red-100 transition-colors"
                    >
                      Request Revision
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}

function Loader() {
  return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
}
