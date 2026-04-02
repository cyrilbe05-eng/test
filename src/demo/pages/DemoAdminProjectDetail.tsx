import { useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { MOCK_PROJECTS, MOCK_FILES, MOCK_ASSIGNMENTS, MOCK_COMMENTS, MOCK_PROFILES, _teamNotesStore, formatProjectTitle, createDeadline, getDeadlinesForProject, updateDeadlineDueAt, pushNotification, type Deadline } from '../mockData'
import { triggerNotificationUpdate } from '../useDemoNotifications'
import { ProjectStatusBadge } from '@/components/project/ProjectStatusBadge'
import { DeliverableCounter } from '@/components/project/DeliverableCounter'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { formatTimestamp } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import type { ProjectStatus } from '@/types'
import { DemoProjectStorageTab } from './DemoProjectStorageTab'

// ── Icons ──────────────────────────────────────────────────────────────────────
function IconArrowLeft() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  )
}
function IconPlay() {
  return <svg className="w-6 h-6 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
}
function IconComment() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  )
}
function IconSend() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  )
}
function IconAttach() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
    </svg>
  )
}
function IconChat() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  )
}

// ── Avatar ─────────────────────────────────────────────────────────────────────
function Avatar({ name, role }: { name: string; role: string }) {
  const roleColor: Record<string, string> = {
    client: 'bg-green-50 text-green-700',
    admin:  'bg-violet-50 text-violet-700',
    team:   'bg-blue-50 text-blue-700',
  }
  return (
    <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0', roleColor[role] ?? 'bg-muted text-muted-foreground')}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

// ── Section card ───────────────────────────────────────────────────────────────
function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('clay-card p-4', className)}>
      <h3 className="font-heading font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-3">{title}</h3>
      {children}
    </div>
  )
}

// ── File row ───────────────────────────────────────────────────────────────────
function FileRow({ name, size }: { name: string; size: number | null }) {
  return (
    <button
      onClick={() => toast.info('File download requires real storage in demo mode')}
      className="flex items-center gap-2 w-full text-left text-sm hover:text-primary transition-colors group py-1"
    >
      <IconAttach />
      <span className="truncate flex-1">{name}</span>
      {size && (
        <span className="text-muted-foreground ml-auto text-xs flex-shrink-0">
          {(size / 1024 / 1024).toFixed(0)} MB
        </span>
      )}
    </button>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
const DEMO_DURATION = 60

export default function DemoAdminProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState(MOCK_PROJECTS.find((p) => p.id === id))
  const [activeTab, setActiveTab] = useState<'review' | 'storage'>('review')
  const [comment, setComment] = useState('')
  const [comments, setComments] = useState(MOCK_COMMENTS.filter((c) => c.project_id === id))
  const [selectedTeam, setSelectedTeam] = useState('')
  const [localAssignments, setLocalAssignments] = useState(() => MOCK_ASSIGNMENTS.filter((a) => a.project_id === id))
  const [deadlines, setDeadlines] = useState<Deadline[]>(() => getDeadlinesForProject(id ?? ''))
  const [editDeadlineId, setEditDeadlineId] = useState<string | null>(null)
  const [editDeadlineValue, setEditDeadlineValue] = useState('')
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)
  const [currentTimeSec, setCurrentTimeSec] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [theater, setTheater] = useState(false)
  const [chatMention, setChatMention] = useState<string | undefined>(undefined)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const files = MOCK_FILES.filter((f) => f.project_id === id)
  const deliverables = files.filter((f) => f.file_type === 'deliverable')
  const sourceFiles = files.filter((f) => f.file_type !== 'deliverable')
  const client = MOCK_PROFILES.find((p) => p.id === project?.client_id)
  const unassignedTeam = MOCK_PROFILES.filter(
    (p) => p.role === 'team' && !localAssignments.find((a) => a.team_member_id === p.id),
  )

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    )
  }

  const updateStatus = (status: ProjectStatus) => {
    setProject((p) => p ? { ...p, status, updated_at: new Date().toISOString() } : p)
    toast.success(`Status → ${status.replace(/_/g, ' ')}`)
  }

  const addComment = () => {
    if (!comment.trim()) return
    setComments((prev) => [
      ...prev,
      {
        id: `comment-demo-${Date.now()}`,
        project_id: id!,
        author_id: 'user-admin',
        author_role: 'admin',
        timestamp_sec: currentTimeSec > 0 ? currentTimeSec : null,
        comment_text: comment,
        revision_round: project.client_revision_count + 1,
        created_at: new Date().toISOString(),
        profiles: { full_name: 'Cyril Beaumont', avatar_url: null },
      },
    ])
    setComment('')
    toast.success('Comment added')
  }

  const assignMember = () => {
    if (!selectedTeam) return
    const now = new Date().toISOString()
    const assignmentId = `assign-${Date.now()}`
    const member = MOCK_PROFILES.find((p) => p.id === selectedTeam)
    // Add to local state
    setLocalAssignments((prev) => [
      ...prev,
      {
        id: assignmentId,
        project_id: id!,
        team_member_id: selectedTeam,
        assigned_by: 'user-admin',
        assigned_at: now,
        profiles: { id: selectedTeam, full_name: member?.full_name ?? '', email: member?.email ?? '', avatar_url: null },
      },
    ])
    // Auto-create 48h deadline
    const dl = createDeadline(id!, selectedTeam, assignmentId, now)
    setDeadlines((prev) => [...prev, dl])
    toast.success(`${member?.full_name ?? 'Member'} assigned — deadline set for ${new Date(dl.due_at).toLocaleString()}`)
    setSelectedTeam('')
    if (project.status === 'pending_assignment') updateStatus('in_progress')
  }

  const saveDeadlineEdit = (deadlineId: string) => {
    if (!editDeadlineValue) return
    const newDueAt = new Date(editDeadlineValue).toISOString()
    updateDeadlineDueAt(deadlineId, newDueAt)
    setDeadlines((prev) => prev.map((d) => d.id === deadlineId ? { ...d, due_at: newDueAt } : d))
    setEditDeadlineId(null)

    // Notify the affected team member
    const dl = deadlines.find((d) => d.id === deadlineId)
    if (dl) {
      const project = MOCK_PROJECTS.find((p) => p.id === dl.project_id)
      pushNotification({
        recipient_id: dl.team_member_id,
        project_id: dl.project_id,
        type: 'deadline_due',
        message: `Deadline updated for "${project?.title ?? 'project'}": now due ${new Date(newDueAt).toLocaleString()}`,
      })
      triggerNotificationUpdate()
    }

    toast.success('Deadline updated — team member notified')
  }

  const togglePlay = () => {
    if (isPlaying) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      setIsPlaying(false)
    } else {
      setIsPlaying(true)
      intervalRef.current = setInterval(() => {
        setCurrentTimeSec((t) => {
          if (t >= DEMO_DURATION) {
            clearInterval(intervalRef.current!)
            setIsPlaying(false)
            return DEMO_DURATION
          }
          return t + 1
        })
      }, 1000)
    }
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    setCurrentTimeSec(Math.round(pct * DEMO_DURATION))
  }

  const timedComments = comments.filter((c) => c.timestamp_sec !== null)
  const sortedComments = [...comments].sort((a, b) => {
    if (a.timestamp_sec === null && b.timestamp_sec === null) return 0
    if (a.timestamp_sec === null) return 1
    if (b.timestamp_sec === null) return -1
    return a.timestamp_sec - b.timestamp_sec
  })
  const progressPct = (currentTimeSec / DEMO_DURATION) * 100

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-30" style={{ height: '52px' }}>
        <div className="h-full flex items-center px-4 gap-3">
          <Link
            to="/admin"
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            <IconArrowLeft />
            <span className="hidden sm:inline">Projects</span>
          </Link>
          <span className="text-border/60">/</span>
          <span className="text-sm font-medium truncate max-w-xs">{formatProjectTitle(project.title, project.client_id)}</span>
          <div className="ml-auto"><ProjectStatusBadge status={project.status} /></div>
        </div>
      </header>

      {/* Two-column: left metadata | scrollable main */}
      <div className="flex" style={{ minHeight: 'calc(100vh - 52px)' }}>

        {/* ── Left metadata sidebar ── */}
        <aside className="w-56 border-r border-border bg-card/20 flex flex-col overflow-y-auto p-3 space-y-3 flex-shrink-0 animate-slide-in-left">
          {/* Client */}
          <Section title="Client">
            {client ? (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-green-50 text-green-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {client.full_name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{client.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{client.email}</p>
                </div>
              </div>
            ) : <p className="text-xs text-muted-foreground">Unknown</p>}
          </Section>

          {/* Source files */}
          <Section title="Source Files">
            {sourceFiles.length === 0
              ? <p className="text-xs text-muted-foreground">None uploaded</p>
              : sourceFiles.map((f) => <FileRow key={f.id} name={f.file_name} size={f.file_size} />)}
          </Section>

          {/* Deliverables */}
          <Section title="Deliverables">
            <div className="mb-2">
              <DeliverableCounter used={deliverables.length} max={project.max_deliverables} />
            </div>
            {deliverables.map((f) => <FileRow key={f.id} name={f.file_name} size={f.file_size} />)}
          </Section>

          {/* Team assignment */}
          <Section title="Assigned Team">
            {localAssignments.length === 0 && (
              <p className="text-xs text-muted-foreground mb-2">Unassigned</p>
            )}
            {localAssignments.map((a) => {
              const dl = deadlines.find((d) => d.assignment_id === a.id)
              return (
                <div key={a.id} className="mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-xs font-bold">
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
                            onClick={() => {
                              setEditDeadlineId(dl.id)
                              setEditDeadlineValue(dl.due_at.slice(0, 16))
                            }}
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
                  value={selectedTeam}
                  onChange={(e) => setSelectedTeam(e.target.value)}
                  className="flex-1 px-2 py-1.5 bg-input border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Assign…</option>
                  {unassignedTeam.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
                <button
                  onClick={assignMember}
                  disabled={!selectedTeam}
                  className="px-2.5 py-1.5 bg-primary rounded-lg text-white text-xs disabled:opacity-40 hover:bg-primary/90 transition-colors"
                >
                  +
                </button>
              </div>
            )}
          </Section>

          {/* Inspiration Video */}
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

          {/* Video Script */}
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

          {/* Quick status */}
          <Section title="Quick Status (Demo)">
            <div className="space-y-1">
              {(['pending_assignment','in_progress','in_review','admin_approved','client_reviewing','client_approved','revision_requested'] as ProjectStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => updateStatus(s)}
                  className={cn(
                    'w-full text-left px-2 py-1.5 rounded-lg text-xs transition-all duration-100',
                    project.status === s
                      ? 'bg-primary/20 text-primary font-semibold'
                      : 'hover:bg-muted text-muted-foreground',
                  )}
                >
                  {s.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </Section>
        </aside>

        {/* ── Main: video + inline comments ── */}
        <div className="flex-1 overflow-y-auto">
          <div className={cn('px-6 pt-6 pb-12 mx-auto transition-all duration-300', theater ? 'max-w-full' : 'max-w-3xl')}>
            <div className="mb-4 animate-slide-up">
              <h1 className="text-xl font-heading font-bold">{formatProjectTitle(project.title, project.client_id)}</h1>
            </div>

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

            {activeTab === 'storage' && (
              <DemoProjectStorageTab
                projectId={id!}
                projectTitle={project.title}
                currentUserId="user-admin"
                role="admin"
              />
            )}

            {activeTab === 'review' && (deliverables.length > 0 ? (
              <div className="animate-slide-up stagger-1">
                {/* Player + Timeline fused */}
                <div className="space-y-0">
                <div className="relative aspect-video bg-zinc-950 rounded-t-xl border border-border border-b-0 overflow-hidden group">
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1 font-mono">{deliverables[0].file_name}</p>
                      <p className="text-[10px] text-muted-foreground/40">Demo — production plays from Supabase Storage</p>
                    </div>
                  </div>

                  <button
                    onClick={togglePlay}
                    className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                  >
                    <div className="w-14 h-14 rounded-full bg-black/60 backdrop-blur flex items-center justify-center hover:bg-black/80 transition-colors">
                      {isPlaying ? (
                        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                        </svg>
                      ) : <IconPlay />}
                    </div>
                  </button>

                  {timedComments.map((c) => {
                    const pct = ((c.timestamp_sec ?? 0) / DEMO_DURATION) * 100
                    return (
                      <button
                        key={c.id}
                        onClick={() => setActiveCommentId(activeCommentId === c.id ? null : c.id)}
                        style={{ left: `${pct}%`, bottom: '40px' }}
                        className="absolute transform -translate-x-1/2 z-10"
                      >
                        <div className={cn(
                          'w-5 h-5 rounded-full border-2 border-background flex items-center justify-center text-[9px] font-bold transition-transform hover:scale-125',
                          activeCommentId === c.id ? 'bg-primary scale-125' : 'bg-amber-400',
                        )}>
                          {c.profiles.full_name.charAt(0)}
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* Timeline */}
                <div
                  className="relative h-10 bg-zinc-900 rounded-b-xl border border-border border-t-0 px-3 flex items-center gap-3 cursor-pointer select-none"
                  onClick={seek}
                >
                  <div className="relative flex-1 h-1.5 bg-white/10 rounded-full overflow-visible">
                    <div className="absolute left-0 top-0 h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
                    <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow border border-primary transition-all duration-300" style={{ left: `calc(${progressPct}% - 6px)` }} />
                    {timedComments.map((c) => {
                      const pct = ((c.timestamp_sec ?? 0) / DEMO_DURATION) * 100
                      return (
                        <button
                          key={c.id}
                          onClick={(e) => { e.stopPropagation(); setActiveCommentId(activeCommentId === c.id ? null : c.id) }}
                          style={{ left: `${pct}%` }}
                          className={cn('timeline-pin', activeCommentId === c.id ? 'bg-primary border-primary' : 'bg-amber-400 border-amber-400')}
                        />
                      )
                    })}
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0">
                    {formatTimestamp(currentTimeSec)} / {formatTimestamp(DEMO_DURATION)}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setTheater((t) => !t) }}
                    title={theater ? 'Default size' : 'Theater mode'}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-white/10 flex-shrink-0"
                  >
                    {theater ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" /></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                    )}
                  </button>
                </div>
                </div>{/* end player+timeline */}

                {/* Admin actions */}
                {project.status === 'in_review' && (
                  <div className="flex gap-3 mt-5 animate-slide-up stagger-2">
                    <button
                      onClick={() => updateStatus('admin_approved')}
                      className="flex items-center gap-2 px-5 py-2.5 bg-green-600 rounded-xl text-white font-semibold text-sm shadow-clay hover:brightness-110 transition-all active:scale-[0.98]"
                    >
                      Approve for Client
                    </button>
                    <button
                      onClick={() => updateStatus('revision_requested')}
                      className="flex items-center gap-2 px-5 py-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 font-semibold text-sm hover:bg-red-100 transition-all active:scale-[0.98]"
                    >
                      Request Revision
                    </button>
                  </div>
                )}

                {/* ── Inline comments panel ── */}
                <div className={cn('clay-card overflow-hidden mt-5 animate-slide-up stagger-3', theater && 'max-w-full')}>
                  <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                    <IconComment />
                    <h3 className="font-heading font-semibold text-sm">Review Comments</h3>
                    <span className="ml-auto text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{comments.length}</span>
                  </div>

                  <div className="divide-y divide-border/40 overflow-y-auto max-h-72">
                    {sortedComments.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <p className="text-muted-foreground text-sm">No comments yet.</p>
                        <p className="text-xs text-muted-foreground mt-1">Pause the video and add a timestamped comment below.</p>
                      </div>
                    ) : (
                      sortedComments.map((c) => (
                        <div
                          key={c.id}
                          className={cn(
                            'px-4 py-3 transition-all duration-150',
                            activeCommentId === c.id && 'bg-primary/5 border-l-2 border-primary',
                          )}
                        >
                          <div className="flex items-start gap-2.5">
                            <Avatar name={c.profiles.full_name} role={c.author_role} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                <span className="text-xs font-semibold">{c.profiles.full_name}</span>
                                <span className="text-[10px] text-muted-foreground capitalize">{c.author_role}</span>
                                {c.timestamp_sec !== null && (
                                  <button
                                    onClick={() => { setActiveCommentId(c.id); setCurrentTimeSec(c.timestamp_sec!) }}
                                    className="text-[10px] font-mono bg-primary/15 text-primary px-1.5 py-0.5 rounded hover:bg-primary/25 transition-colors"
                                  >
                                    {formatTimestamp(c.timestamp_sec)}
                                  </button>
                                )}
                                <span className="text-[10px] text-muted-foreground ml-auto">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
                              </div>
                              <p className="text-xs text-foreground/80 leading-relaxed">{c.comment_text}</p>
                            </div>
                            {/* Mention in chat */}
                            <button
                              onClick={() => {
                                const ts = c.timestamp_sec !== null ? `[${formatTimestamp(c.timestamp_sec)}]` : ''
                                setChatMention(`Re: "${c.comment_text.slice(0, 60)}${c.comment_text.length > 60 ? '…' : ''}" ${ts}`.trim())
                              }}
                              title="Mention in chat"
                              className="flex-shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100"
                              style={{ opacity: 1 }}
                            >
                              <IconChat />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Comment input */}
                  <div className="p-3 border-t border-border bg-muted/20">
                    <div className="text-xs text-muted-foreground mb-2 font-mono">@ {formatTimestamp(currentTimeSec)}</div>
                    <div className="flex gap-2">
                      <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Add a review comment…"
                        rows={2}
                        className="flex-1 px-3 py-2 bg-input border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none leading-relaxed"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment() }
                        }}
                      />
                      <button
                        onClick={addComment}
                        disabled={!comment.trim()}
                        className="px-3 py-2 bg-primary rounded-lg text-white self-end hover:brightness-110 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <IconSend />
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5">Enter to post · Shift+Enter for new line</p>
                  </div>
                </div>

                {/* ── Team Member Notes (read-only for admin) ── */}
                {(() => {
                  const teamNotes = _teamNotesStore.filter((n) => n.project_id === id)
                  if (teamNotes.length === 0) return null
                  const sorted = [...teamNotes].sort((a, b) => {
                    if (a.timestamp_sec === null) return 1
                    if (b.timestamp_sec === null) return -1
                    return a.timestamp_sec - b.timestamp_sec
                  })
                  return (
                    <div className={cn('clay-card overflow-hidden mt-5 animate-slide-up stagger-4', theater && 'max-w-full')}>
                      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                        <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <h3 className="font-heading font-semibold text-sm">Team Notes</h3>
                        <span className="ml-1 text-[10px] text-muted-foreground bg-violet-500/10 text-violet-400 px-1.5 py-0.5 rounded-full">read-only</span>
                        <span className="ml-auto text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{teamNotes.length}</span>
                      </div>
                      <div className="divide-y divide-border/40 overflow-y-auto max-h-56">
                        {sorted.map((n) => {
                          const author = MOCK_PROFILES.find((p) => p.id === n.author_id)
                          return (
                            <div key={n.id} className="px-4 py-3 hover:bg-muted/20 transition-colors">
                              <div className="flex items-center gap-1.5 mb-1">
                                <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                                  {author?.full_name.charAt(0) ?? '?'}
                                </div>
                                <span className="text-xs font-semibold text-foreground/70">{author?.full_name ?? 'Team member'}</span>
                                {n.timestamp_sec !== null && (
                                  <button
                                    onClick={() => setCurrentTimeSec(n.timestamp_sec!)}
                                    className="text-[10px] font-mono bg-violet-500/15 text-violet-400 px-1.5 py-0.5 rounded hover:bg-violet-500/25 transition-colors"
                                  >
                                    {formatTimestamp(n.timestamp_sec)}
                                  </button>
                                )}
                                <span className="text-[10px] text-muted-foreground ml-auto">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
                              </div>
                              <p className="text-xs text-foreground/80 leading-relaxed ml-7">{n.text}</p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
              </div>
            ) : (
              <div className="aspect-video bg-muted/20 rounded-xl flex items-center justify-center border border-dashed border-border animate-slide-up stagger-1">
                <p className="text-muted-foreground text-sm">No deliverable uploaded yet</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ChatPanel
        currentUserId="user-admin"
        isAdmin
        mentionText={chatMention}
        onMentionConsumed={() => setChatMention(undefined)}
      />
    </div>
  )
}
