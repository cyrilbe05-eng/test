import { ClientMark, EditorAvatar, Icon, Ms, Segmented, StatusDot } from '@/components/ds'
import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { getSignedUrlById } from '@/lib/storage'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { useProject, useProjectFiles, useProjectAssignments, useTimelineComments, useUpdateProjectStatus } from '@/hooks/useProjects'
import { TimelineCommentor } from '@/components/project/TimelineCommentor'
import { CarouselReview, SlideManager } from '@/components/carousel/Carousel'
import { VersionTabs } from '@/components/project/VersionTabs'
import { currentVersions, commentsForVersion } from '@/lib/versions'
import { slidesOf } from '@/lib/slides'
import { statusLabel } from '@/lib/dsStatus'
import { DeliverableCounter } from '@/components/project/DeliverableCounter'
import { ReviewCopyControl } from '@/components/project/ReviewCopyControl'
import { FileUploader } from '@/components/project/FileUploader'
import { useAuth } from '@/hooks/useAuth'
import { useApiFetch } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { AdminLayout, HeaderTools } from '@/components/admin/AdminLayout'
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

interface StatusHistoryEntry {
  id: string
  project_id: string
  old_status: string | null
  new_status: string
  actor_id: string | null
  actor_name: string | null
  created_at: string
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function Section({ title, children, className, right }: { title: string; children: React.ReactNode; className?: string; right?: React.ReactNode }) {
  return (
    <section className={cn('ds-panel', className)} style={{ padding: '16px 18px 16px' }}>
      <div className="ds-panel-head" style={{ marginBottom: 10 }}><h2>{title}</h2>{right}</div>
      {children}
    </section>
  )
}

function TextBlock({ label, value }: { label: string; value: string }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = value.length > 300
  return (
    <section className="ds-panel" style={{ padding: '16px 18px' }}>
      <div className="ds-panel-head" style={{ marginBottom: 8 }}>
        <h2>{label}</h2>
        {isLong && (
          <button onClick={() => setExpanded((e) => !e)} className="flex-shrink-0 hover:underline" style={{ fontSize: 12.5, color: 'var(--faint)' }}>
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
      <div
        className={cn('whitespace-pre-wrap overflow-hidden transition-all', !expanded && isLong ? 'max-h-32' : 'max-h-none')}
        style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text)', ...(!expanded && isLong ? { WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)' } : {}) }}
      >
        {value}
      </div>
      {!expanded && isLong && (
        <button onClick={() => setExpanded(true)} className="mt-2 hover:underline" style={{ fontSize: 12.5, color: 'var(--faint)' }}>
          Read full text
        </button>
      )}
    </section>
  )
}

/** A file in a list: name, size · time (· who), a label, download. */
function FileLine({ f, label, who }: { f: { id: string; file_name: string; file_size: number | null; created_at: string }; label: React.ReactNode; who?: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5" style={{ borderTop: '1px solid var(--line)' }}>
      <div className="flex-1 min-w-0">
        <p className="truncate" style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--strong)' }}>{f.file_name}</p>
        <p style={{ fontSize: 12, color: 'var(--faint)' }}>
          {f.file_size ? formatBytes(f.file_size) : '—'} · {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}{who && ` · ${who}`}
        </p>
      </div>
      {label}
      <FileRow name="" size={null} fileId={f.id} iconOnly />
    </div>
  )
}

function FileRow({ name, size, fileId, iconOnly }: { name: string; size: number | null; fileId: string; iconOnly?: boolean }) {
  const apiFetch = useApiFetch()
  const [loading, setLoading] = useState(false)
  const handleDownload = async () => {
    setLoading(true)
    try {
      // forDownload=true so R2 returns Content-Disposition: attachment with the
      // original filename + correct content-type. Using <a download> instead
      // of window.open avoids the mobile-Safari quirk where the new tab is
      // closed by the OS before the download completes.
      const url = await getSignedUrlById(apiFetch, fileId, true)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch {
      toast.error('Failed to get download link')
    } finally {
      setLoading(false)
    }
  }
  if (iconOnly) {
    return (
      <button onClick={handleDownload} disabled={loading} title="Download" className="ds-ibtn flex-shrink-0 disabled:opacity-50" style={{ width: 34, height: 34 }}>
        {loading
          ? <div className="w-4 h-4 rounded-full border border-primary border-t-transparent animate-spin" />
          : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
        }
      </button>
    )
  }
  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="flex items-center gap-3 w-full text-left hover:bg-muted/60 transition-colors rounded-lg px-2 py-2 group disabled:opacity-60"
    >
      <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
        <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="truncate" style={{ fontSize: 13, fontWeight: 500, color: 'var(--strong)' }}>{name}</p>
        {size != null && <p className="text-[10px] text-muted-foreground">{formatBytes(size)}</p>}
      </div>
      {loading && <div className="w-3 h-3 rounded-full border border-primary border-t-transparent animate-spin flex-shrink-0" />}
    </button>
  )
}

export default function AdminProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: project, isLoading } = useProject(id)
  const { data: files } = useProjectFiles(id)
  const { data: assignments } = useProjectAssignments(id)
  const { data: comments, refetch: refetchComments } = useTimelineComments(id)
  const updateStatus = useUpdateProjectStatus()
  const [selectedTeamMember, setSelectedTeamMember] = useState('')
  // C2: forward-as-FYI state
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

  // C1: status transition audit trail (empty until migration 003 is applied)
  const { data: statusHistory = [] } = useQuery<StatusHistoryEntry[]>({
    queryKey: ['status_history', id],
    queryFn: () => apiFetch<StatusHistoryEntry[]>(`/api/projects/${id}/status-history`),
    enabled: !!id,
    retry: false,
  })

  const deliverables = (files ?? []).filter((f) => f.file_type === 'deliverable')
  const sourceFiles = (files ?? []).filter((f) => f.file_type !== 'deliverable')
  const latestDeliverable = deliverables[0]
  // Carousel (Stage G): the deliverables are the slides, in order.
  const isCarousel = project?.kind === 'carousel'
  const slides = slidesOf(files, 'deliverable')
  // Several versions of one video (migration 020): switch between this
  // cycle's deliverables; each version shows its own comments.
  const versions = currentVersions(files, project?.client_revision_count ?? 0)
  const [versionId, setVersionId] = useState<string | null>(null)
  const shown = versions.find((v) => v.id === versionId) ?? versions[0] ?? latestDeliverable
  const versionIds = versions.map((v) => v.id)
  const versionComments = shown ? commentsForVersion(comments ?? [], shown.id, versionIds) : comments ?? []
  const commentedVersions = new Set((comments ?? []).filter((c) => c.file_id && versionIds.includes(c.file_id)).map((c) => c.file_id!))

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
      qc.invalidateQueries({ queryKey: ['projects'] }); qc.invalidateQueries({ queryKey: ['admin-home'] })
      toast.success('Team member assigned')
      setSelectedTeamMember('')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleApprove = async () => {
    if (!id) return
    await updateStatus.mutateAsync({ id, status: 'client_reviewing' })
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

  const handleDeleteProject = async () => {
    if (!id || !confirm(`Delete "${project?.title}"? This cannot be undone.`)) return
    try {
      await apiFetch(`/api/projects/${id}/delete`, { method: 'DELETE' })
      toast.success('Project deleted')
      qc.invalidateQueries({ queryKey: ['projects'] })
      navigate('/admin')
    } catch (err) {
      toast.error((err as Error).message)
    }
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

  if (isLoading || !project) return (
    <AdminLayout>
      <div className="flex-1 flex items-center justify-center py-32">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    </AdminLayout>
  )

  const assignedIds = new Set((assignments ?? []).map((a) => a.team_member_id))
  const unassignedTeam = (teamMembers ?? []).filter((m) => !assignedIds.has(m.id))
  const revisionRound = project.client_revision_count + 1
  const client = (project as any).profiles

  return (
    <AdminLayout bare>
      <main className="px-4 md:px-7 pb-12" style={{ maxWidth: theater ? 'none' : 1320 }}>
        {/* Header */}
        <header className="flex flex-wrap items-center gap-3 pt-5 pb-5">
          <Link to="/admin" aria-label="Back to projects" className="ds-ibtn -ml-2 flex-none"><Ms name="arrow_back" /></Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate">{project.title}</h1>
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1" style={{ fontSize: 13 }}>
              {client && <span className="flex items-center gap-2 min-w-0" style={{ color: 'var(--ds-muted)' }}><ClientMark name={client.full_name ?? '?'} /><span className="truncate">{client.full_name}</span></span>}
              <span className="flex items-center gap-2" style={{ color: 'var(--soft-text)' }}><StatusDot status={project.status} size={7} />{statusLabel(project.status)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-none">
            <Link to={`/admin/sops/${project.client_id}`} className="ds-ghost-btn ds-tap inline-flex items-center gap-2" style={{ textDecoration: 'none' }}>
              <Ms name="menu_book" style={{ fontSize: 18, width: 18, color: 'inherit' }} /><span className="hidden sm:inline">Client SOPs</span>
            </Link>
            <button type="button" onClick={handleDeleteProject} className="ds-ibtn ds-danger" title="Delete project" aria-label="Delete project"><Ms name="delete" style={{ color: 'inherit' }} /></button>
            <div className="hidden md:block"><HeaderTools /></div>
          </div>
        </header>

        <div className={cn('grid gap-5 items-start', !theater && 'lg:grid-cols-[minmax(0,1fr)_320px]')}>
          {/* ── Main: review / storage ── */}
          <div className="min-w-0 space-y-4">
            <Segmented label="View" width={88} value={activeTab} onChange={setActiveTab}
              options={[{ value: 'review', label: 'Review' }, { value: 'storage', label: 'Storage' }]} />

            {/* Storage tab */}
            {activeTab === 'storage' && (
              <div className="space-y-4 animate-slide-up">
                <Section title="Deliverables" right={deliverables.length > 0 ? <span className="ds-count">{deliverables.length}</span> : undefined}>
                  {deliverables.length === 0 ? <p className="ds-empty">No deliverables yet</p> : (
                    <div className="-mb-2.5">
                      {deliverables.map((f) => (
                        <FileLine key={f.id} f={f} who={(f as any).profiles?.full_name}
                          label={<span className={cn('ds-tag flex-shrink-0', f.approved ? 'text-green-700' : 'text-amber-700')} style={{ fontSize: 12 }}>{f.approved ? 'Approved' : 'Pending'}</span>} />
                      ))}
                    </div>
                  )}
                </Section>
                <Section title="Source files" right={sourceFiles.length > 0 ? <span className="ds-count">{sourceFiles.length}</span> : undefined}>
                  {sourceFiles.length === 0 ? <p className="ds-empty">No source files</p> : (
                    <div className="-mb-2.5">
                      {sourceFiles.map((f) => (
                        <FileLine key={f.id} f={f}
                          label={<span className="flex-shrink-0" style={{ fontSize: 12, color: 'var(--faint)' }}>{f.file_type === 'source_video' ? 'Main video' : f.file_type === 'attachment' ? 'Attachment' : f.file_type}</span>} />
                      ))}
                    </div>
                  )}
                </Section>
              </div>
            )}

            {/* Review tab */}
            {activeTab === 'review' && (
              <div className="space-y-4 animate-slide-up">
                {isCarousel && slides.length > 0 ? (
                  <CarouselReview
                    projectId={project.id}
                    slides={slides}
                    comments={comments ?? []}
                    userId={profile!.id}
                    canComment
                    canResolve
                    revisionRound={revisionRound}
                    onChanged={() => refetchComments()}
                  />
                ) : shown ? (
                  <div className="space-y-3">
                  <VersionTabs versions={versions} value={shown?.id ?? ''} onChange={setVersionId} commented={commentedVersions} />
                  <TimelineCommentor
                    storageKey={shown.storage_key}
                    fileId={shown.id}
                    projectId={project.id}
                    comments={versionComments}
                    currentUserId={profile!.id}
                    currentUserRole="admin"
                    canComment={true}
                    revisionRound={revisionRound}
                    onCommentAdded={() => refetchComments()}
                    theater={theater}
                    onTheaterToggle={() => setTheater((t) => !t)}
                  />
                  </div>
                ) : (
                  <div className="aspect-video rounded-2xl grid place-items-center" style={{ background: 'var(--panel)', boxShadow: 'inset 0 0 0 1px var(--panel-ring)' }}>
                    <div className="text-center">
                      <Ms name="movie" style={{ fontSize: 28, width: 28 }} />
                      <p className="mt-2" style={{ fontSize: 13.5, color: 'var(--faint)' }}>No deliverable uploaded yet</p>
                    </div>
                  </div>
                )}

                {/* Admin review actions */}
                {(project.status === 'in_review' || project.status === 'admin_approved') && (
                  <div className="flex flex-wrap gap-2.5">
                    <button onClick={handleApprove} className="ds-primary ds-tap">
                      <Ms name="check" style={{ fontSize: 18, width: 18, color: 'inherit' }} />Approve for Client
                    </button>
                    <button onClick={handleReject} className="ds-ghost-btn ds-tap">Request Revision</button>
                  </div>
                )}

                {/* Description / script / instructions — below the video */}
                {project.description && <TextBlock label="Description" value={project.description} />}
                {project.instructions && <TextBlock label="Client Instructions" value={project.instructions} />}
                {project.video_script && <TextBlock label="Video Script" value={project.video_script} />}

                {/* Source files from client */}
                {sourceFiles.length > 0 && (
                  <Section title="Source files from client" right={<span className="ds-count">{sourceFiles.length}</span>}>
                    <div className="-mb-2.5">
                      {sourceFiles.map((f) => (
                        <FileLine key={f.id} f={f}
                          label={<span className="flex-shrink-0" style={{ fontSize: 12, color: 'var(--faint)' }}>{f.file_type === 'source_video' ? 'Main video' : 'Attachment'}</span>} />
                      ))}
                    </div>
                  </Section>
                )}
              </div>
            )}
          </div>

          {/* ── Side panels ── */}
          <aside className="min-w-0 space-y-4">
            {/* Team assignment */}
            <Section title="Team">
              {(assignments ?? []).length === 0 && (
                <div className="flex items-center gap-2.5 mb-3" style={{ fontSize: 13, color: 'var(--faint)' }}><EditorAvatar name={null} />Unassigned</div>
              )}
              {(assignments ?? []).map((a) => {
                const dl = deadlines.find((d) => d.assignment_id === a.id)
                return (
                  <div key={a.id} className="mb-3">
                    <div className="flex items-center gap-2.5">
                      <EditorAvatar name={a.profiles.full_name} size={26} />
                      <span className="flex-1 truncate" style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--strong)' }}>{a.profiles.full_name}</span>
                      <button
                        onClick={async () => {
                          if (!id || !confirm(`Unassign ${a.profiles.full_name}?`)) return
                          try {
                            await apiFetch(`/api/projects/${id}/unassign`, { method: 'DELETE', body: JSON.stringify({ team_member_id: a.team_member_id }) })
                            qc.invalidateQueries({ queryKey: ['project_assignments', id] })
                            qc.invalidateQueries({ queryKey: ['project_deadlines', id] })
                            qc.invalidateQueries({ queryKey: ['projects'] }); qc.invalidateQueries({ queryKey: ['admin-home'] })
                            toast.success('Unassigned')
                          } catch (err) { toast.error((err as Error).message) }
                        }}
                        className="ds-ibtn flex-shrink-0"
                        style={{ width: 30, height: 30 }}
                        title="Unassign"
                      ><Icon name="close" size={16} /></button>
                    </div>
                    {dl && (
                      <div className="ml-9 mt-1">
                        <div className="flex items-center gap-x-2.5 gap-y-1 flex-wrap" style={{ fontSize: 12 }}>
                          <span className={cn('ds-tag', dl.status === 'met' ? 'text-green-700' : dl.status === 'missed' ? 'text-red-700' : 'text-orange-700')}>
                            {dl.status === 'met' ? 'Met' : dl.status === 'missed' ? 'Missed' : 'Pending'}
                          </span>
                          {editDeadlineId === dl.id ? (
                            <div className="flex items-center gap-1.5 w-full mt-1">
                              <input
                                type="datetime-local"
                                value={editDeadlineValue}
                                onChange={(e) => setEditDeadlineValue(e.target.value)}
                                className="ds-field flex-1 min-w-0"
                                style={{ height: 34, fontSize: 12.5 }}
                              />
                              <button onClick={() => saveDeadlineEdit(dl.id)} className="ds-ghost-btn" style={{ height: 34, fontSize: 12.5 }}>Save</button>
                              <button onClick={() => setEditDeadlineId(null)} className="ds-ibtn" style={{ width: 30, height: 30 }} aria-label="Cancel"><Icon name="close" size={16} /></button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setEditDeadlineId(dl.id); setEditDeadlineValue(dl.due_at.slice(0, 16)) }}
                              className="inline-flex items-center gap-1 hover:underline"
                              style={{ color: 'var(--faint)' }}
                            >
                              Due {new Date(dl.due_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} <Icon name="edit" size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {unassignedTeam.length > 0 && (
                <div className="flex gap-2 mt-1">
                  <select
                    value={selectedTeamMember}
                    onChange={(e) => setSelectedTeamMember(e.target.value)}
                    className="ds-field flex-1 min-w-0"
                    style={{ height: 38 }}
                  >
                    <option value="">Assign…</option>
                    {unassignedTeam.map((m) => (
                      <option key={m.id} value={m.id}>{m.full_name}</option>
                    ))}
                  </select>
                  <button
                    onClick={assignTeamMember}
                    disabled={!selectedTeamMember}
                    aria-label="Assign"
                    className="ds-primary flex-none disabled:opacity-40"
                    style={{ width: 38, padding: 0, justifyContent: 'center' }}
                  >
                    +
                  </button>
                </div>
              )}
            </Section>

            {/* Deliverables */}
            <Section title="Deliverables" right={
              <div className="flex items-center gap-1 flex-shrink-0">
                {!isCarousel && <DeliverableCounter used={deliverables.length} max={project.max_deliverables} />}
                {!isCarousel && <button
                  onClick={async () => {
                    const input = prompt('Deliverable limit for this project (-1 for unlimited):', String(project.max_deliverables))
                    if (input === null) return
                    const value = Number(input)
                    if (!Number.isInteger(value) || (value !== -1 && value < 1)) { toast.error('Enter -1 or a positive whole number'); return }
                    try {
                      await apiFetch(`/api/projects/${id}/limits`, { method: 'PATCH', body: JSON.stringify({ max_deliverables: value }) })
                      qc.invalidateQueries({ queryKey: ['project', id] })
                      qc.invalidateQueries({ queryKey: ['projects'] })
                      toast.success('Deliverable limit updated')
                    } catch (err) { toast.error((err as Error).message) }
                  }}
                  className="ds-ibtn"
                  style={{ width: 28, height: 28 }}
                  title="Change deliverable limit"
                >
                  <Icon name="edit" />
                </button>}
              </div>
            }>
              {isCarousel ? (
                <SlideManager projectId={project.id} slides={slides} canEdit onChanged={() => qc.invalidateQueries({ queryKey: ['project_files', id] })} />
              ) : (
              <div className="-mx-2 space-y-0.5">
                {deliverables.length === 0
                  ? <p className="ds-empty px-2">None uploaded</p>
                  : deliverables.map((f) => (
                      <div key={f.id}>
                        <FileRow name={f.file_name} size={f.file_size} fileId={f.id} />
                        <ReviewCopyControl
                          file={f}
                          projectId={project.id}
                          canEdit
                          onChanged={() => qc.invalidateQueries({ queryKey: ['project_files', id] })}
                        />
                      </div>
                    ))}
              </div>
              )}
            </Section>

          <Section title="Source files" right={sourceFiles.length > 0 ? <span className="ds-count">{sourceFiles.length}</span> : undefined}>
            {sourceFiles.length === 0
              ? <p className="ds-empty">None uploaded</p>
              : <div className="-mx-2">{sourceFiles.map((f) => <FileRow key={f.id} name={f.file_name} size={f.file_size} fileId={f.id} />)}</div>}
            <div className="mt-3">
              <FileUploader
                projectId={project.id}
                fileType="attachment"
                label="Add supporting files"
                context={project.title}
                onUploaded={() => qc.invalidateQueries({ queryKey: ['project_files', id] })}
              />
            </div>
          </Section>

            {/* C1: status transition history (populated once migration 003 runs) */}
            {statusHistory.length > 0 && (
              <Section title="Status history">
                <ol className="space-y-2.5">
                  {[...statusHistory].reverse().map((h) => (
                    <li key={h.id} className="flex gap-2.5" style={{ fontSize: 12.5 }}>
                      <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-none" style={{ background: 'var(--dash)' }} />
                      <div className="min-w-0">
                        <p className="capitalize" style={{ color: 'var(--text)' }}>
                          {h.old_status && <span style={{ color: 'var(--faint)' }}>{h.old_status.replace(/_/g, ' ')} → </span>}
                          <span style={{ fontWeight: 500 }}>{h.new_status.replace(/_/g, ' ')}</span>
                        </p>
                        <p style={{ color: 'var(--faint)' }}>{h.actor_name ?? 'system'} · {formatDistanceToNow(new Date(h.created_at), { addSuffix: true })}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Section>
            )}

            {/* Inspiration URL */}
            {project.inspiration_url && (
              <Section title="Inspiration Video">
                <a href={project.inspiration_url} target="_blank" rel="noopener noreferrer"
                  className="ds-ghost-btn inline-flex items-center gap-2" style={{ textDecoration: 'none' }}>
                  <Ms name="north_east" style={{ fontSize: 16, width: 16, color: 'inherit' }} />Open link
                </a>
              </Section>
            )}

            {/* Client */}
            {client && (
              <Section title="Client">
                <div className="flex items-center gap-2.5">
                  <ClientMark name={client.full_name ?? '?'} size={28} />
                  <div className="min-w-0">
                    <p className="truncate" style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--strong)' }}>{client.full_name}</p>
                    {client.email && <p className="truncate" style={{ fontSize: 12, color: 'var(--faint)' }}>{client.email}</p>}
                  </div>
                </div>
              </Section>
            )}
          </aside>
        </div>
      </main>
    </AdminLayout>
  )
}
