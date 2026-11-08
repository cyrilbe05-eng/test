import { useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { MOCK_PROJECTS, MOCK_FILES, MOCK_COMMENTS, _profilesStore, pushNotification } from '../mockData'
import { triggerNotificationUpdate } from '../useDemoNotifications'
import { useDemoAuth } from '../DemoAuthContext'
import { ProjectStatusBadge } from '@/components/project/ProjectStatusBadge'
import { RevisionCounter } from '@/components/project/RevisionCounter'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { formatTimestamp } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import type { ProjectStatus } from '@/types'
import { DemoProjectStorageTab } from './DemoProjectStorageTab'

// ── Tiny icons ─────────────────────────────────────────────────────────────────
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
function IconThumbUp() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
    </svg>
  )
}
function IconComment() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  )
}
function IconDownload() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
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

// ── Status banners ─────────────────────────────────────────────────────────────
function Banner({ color, children }: { color: string; children: React.ReactNode }) {
  const c: Record<string, string> = {
    amber:  'bg-amber-50 border-amber-200 text-amber-700',
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
    purple: 'bg-violet-50 border-violet-200 text-violet-700',
    red:    'bg-red-50 border-red-200 text-red-700',
  }
  return (
    <div className={`px-4 py-3 rounded-xl border text-sm animate-slide-up ${c[color]}`}>
      {children}
    </div>
  )
}

// ── Avatar initials ────────────────────────────────────────────────────────────
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

// ── Page ───────────────────────────────────────────────────────────────────────
export default function DemoClientProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useDemoAuth()
  const [activeTab, setActiveTab] = useState<'review' | 'storage'>('review')
  const [project, setProject] = useState(MOCK_PROJECTS.find((p) => p.id === id))
  const [comments, setComments] = useState(MOCK_COMMENTS.filter((c) => c.project_id === id))
  const [newComment, setNewComment] = useState('')
  const [chatMention, setChatMention] = useState<string | undefined>(undefined)
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)
  const [theater, setTheater] = useState(false)
  // Simulated current time (0–100 representing 0–60s for demo)
  const [currentTimeSec, setCurrentTimeSec] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const DEMO_DURATION = 60 // seconds

  const files = MOCK_FILES.filter((f) => f.project_id === id)
  const deliverables = files.filter(
    (f) => f.file_type === 'deliverable' && (f.approved || project?.status === 'client_reviewing' || project?.status === 'client_approved'),
  )

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    )
  }

  const remaining = project.max_client_revisions === -1 ? Infinity : project.max_client_revisions - project.client_revision_count
  const canReview = project.status === 'client_reviewing'
  const isApproved = project.status === 'client_approved'
  const revisionRound = project.client_revision_count + 1

  // Simulate play/pause
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

  const handleApprove = () => {
    if (!confirm('Approve this video? This will finalise your project and unlock the download.')) return
    setProject((p) => p ? { ...p, status: 'client_approved' as ProjectStatus, updated_at: new Date().toISOString() } : p)
    toast.success('Video approved! Download is now available.')
  }

  const handleReject = () => {
    if (remaining <= 0) {
      // Fire a limit-reached notification + simulated email
      if (profile) {
        pushNotification({
          recipient_id: profile.id,
          project_id: project.id,
          type: 'revision_requested',
          message: `You have used all ${project.max_client_revisions} revision rounds on "${project.title}". Contact your account manager to upgrade your plan.`,
        })
        triggerNotificationUpdate()
        toast.error('Revision limit reached — check your notifications', { duration: 5000 })
        toast.info(`📧 Email sent to ${profile.email}: "Revision limit reached for ${project.title}"`, { duration: 6000 })
      }
      return
    }
    const myComments = comments.filter(
      (c) => c.author_id === profile?.id && c.revision_round === revisionRound,
    )
    if (myComments.length === 0) {
      toast.error('Please add at least one comment before requesting a revision')
      return
    }
    const newCount = project.client_revision_count + 1
    setProject((p) =>
      p ? { ...p, status: 'revision_requested' as ProjectStatus, client_revision_count: newCount, updated_at: new Date().toISOString() } : p,
    )
    toast.success('Revision requested — the team will get back to you shortly.')
    // Warn when this was the last revision
    const maxRev = project.max_client_revisions
    if (maxRev !== -1 && profile && newCount >= maxRev) {
      pushNotification({
        recipient_id: profile.id,
        project_id: project.id,
        type: 'revision_requested',
        message: `You have used your last revision round (${maxRev}/${maxRev}) on "${project.title}". Approve the next version or upgrade your plan to request more.`,
      })
      pushNotification({
        recipient_id: 'user-admin',
        project_id: project.id,
        type: 'revision_requested',
        message: `${profile.full_name} has reached the revision limit (${maxRev}) on "${project.title}".`,
      })
      triggerNotificationUpdate()
      toast.warning(`⚠️ This was your last revision round on this project.`, { duration: 6000 })
      toast.info(`📧 Email sent to ${profile.email}: "Revision limit warning for ${project.title}"`, { duration: 6000 })
    }
  }

  const addComment = () => {
    if (!newComment.trim() || !canReview) return
    const ts = currentTimeSec > 0 ? currentTimeSec : null
    setComments((prev) => [
      ...prev,
      {
        id: `comment-client-${Date.now()}`,
        project_id: id!,
        author_id: profile!.id,
        author_role: 'client',
        timestamp_sec: ts,
        comment_text: newComment,
        revision_round: revisionRound,
        created_at: new Date().toISOString(),
        profiles: { full_name: profile!.full_name, avatar_url: null },
      },
    ])
    setNewComment('')
  }

  // Sort comments by timestamp (nulls last)
  const sortedComments = [...comments].sort((a, b) => {
    if (a.timestamp_sec === null && b.timestamp_sec === null) return 0
    if (a.timestamp_sec === null) return 1
    if (b.timestamp_sec === null) return -1
    return a.timestamp_sec - b.timestamp_sec
  })

  // Timeline pins (comments with timestamps)
  const timedComments = comments.filter((c) => c.timestamp_sec !== null)

  const progressPct = (currentTimeSec / DEMO_DURATION) * 100

  return (
    <div className="min-h-screen bg-background">
      {/* ── Top bar ── */}
      <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-30" style={{ height: '52px' }}>
        <div className="h-full flex items-center px-4 gap-3">
          <Link
            to="/workspace"
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            <IconArrowLeft />
            <span className="hidden sm:inline">My Workspace</span>
          </Link>
          <span className="text-border/60">/</span>
          <span className="text-sm font-medium truncate max-w-xs">{project.title}</span>
          <div className="ml-auto flex items-center gap-2">
            <ProjectStatusBadge status={project.status} />
          </div>
        </div>
      </header>

      <main className={cn('mx-auto px-4 py-6 transition-all duration-300', theater ? 'max-w-6xl' : 'max-w-4xl')}>
        {/* Title + meta row */}
        <div className="flex items-start gap-3 flex-wrap mb-3 animate-slide-up">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-heading font-bold">{project.title}</h1>
            {project.inspiration_url && (
              <a
                href={project.inspiration_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline mt-0.5 block truncate"
              >
                🎬 {project.inspiration_url}
              </a>
            )}
          </div>
          <RevisionCounter
            remaining={remaining === Infinity ? 0 : remaining}
            unlimited={project.max_client_revisions === -1}
          />
        </div>

        {/* Status banners */}
        <div className="space-y-2 mb-4">
          {project.status === 'pending_assignment' && <Banner color="amber">Your project is waiting for a team member to be assigned. We'll notify you when work begins.</Banner>}
          {project.status === 'in_progress' && <Banner color="blue">Our team is actively working on your video. You'll be notified when it's ready to review.</Banner>}
          {project.status === 'in_review' && <Banner color="purple">Your video is being quality-checked by our team. Almost there!</Banner>}
          {project.status === 'revision_requested' && <Banner color="red">Your feedback has been submitted. The team is working on the revisions.</Banner>}
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
              {tab === 'review' ? '📺 My Video' : '📁 Files'}
            </button>
          ))}
        </div>

        {activeTab === 'storage' && (
          <DemoProjectStorageTab
            projectId={id!}
            projectTitle={project.title}
            currentUserId={profile?.id ?? ''}
            role="client"
          />
        )}

        {activeTab === 'review' && ((canReview || isApproved) && deliverables.length > 0 ? (
          <div className="animate-slide-up stagger-2">
            {/* ── Video player ── */}
            <div className="space-y-0">
              <div className="relative aspect-video bg-zinc-950 rounded-t-xl border border-border border-b-0 overflow-hidden group">
                {/* Simulated video content */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1 font-mono">{deliverables[0].file_name}</p>
                    <p className="text-[10px] text-muted-foreground/50">Demo mode — production uses signed Supabase Storage URL</p>
                  </div>
                </div>

                {/* Play overlay */}
                <button
                  onClick={togglePlay}
                  className="absolute inset-0 flex items-center justify-center transition-opacity group-hover:opacity-100 opacity-0 hover:opacity-100"
                >
                  <div className="w-14 h-14 rounded-full bg-black/60 backdrop-blur flex items-center justify-center hover:bg-black/80 transition-colors">
                    {isPlaying
                      ? <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                      : <IconPlay />
                    }
                  </div>
                </button>

                {/* Comment pins above timeline */}
                {timedComments.map((c) => {
                  const pct = ((c.timestamp_sec ?? 0) / DEMO_DURATION) * 100
                  return (
                    <button
                      key={c.id}
                      onClick={() => setActiveCommentId(activeCommentId === c.id ? null : c.id)}
                      style={{ left: `${pct}%`, bottom: '36px' }}
                      className="absolute transform -translate-x-1/2"
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

              {/* Timeline bar */}
              <div
                className="relative h-10 bg-zinc-900 rounded-b-xl border border-border border-t-0 px-3 flex items-center gap-3 cursor-pointer select-none"
                onClick={seek}
              >
                <div className="relative flex-1 h-1.5 bg-white/10 rounded-full overflow-visible">
                  <div className="absolute left-0 top-0 h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
                  <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-lg border border-primary transition-all duration-300" style={{ left: `calc(${progressPct}% - 6px)` }} />
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
                {canReview && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toast.info(`Timestamp marked at ${formatTimestamp(currentTimeSec)}`) }}
                    className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors font-medium"
                  >
                    Mark
                  </button>
                )}
                {/* Theater toggle */}
                <button
                  onClick={(e) => { e.stopPropagation(); setTheater((t) => !t) }}
                  title={theater ? 'Default size' : 'Theater mode'}
                  className="flex-shrink-0 p-1 rounded text-white/50 hover:text-white transition-colors"
                >
                  {theater ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                  )}
                </button>
              </div>
            </div>

            {/* ── Below-video row: actions + comments ── */}
            <div className={cn('mt-4 gap-5', theater ? 'flex items-start' : 'space-y-5')}>

              {/* Left: actions */}
              <div className={cn('space-y-4', theater && 'flex-1 min-w-0')}>
                {canReview && (
                  <div className="flex items-center gap-3 flex-wrap animate-slide-up stagger-3">
                    <button
                      onClick={handleApprove}
                      className="flex items-center gap-2 px-5 py-2.5 bg-green-600 rounded-xl text-white font-semibold text-sm shadow-clay hover:brightness-110 transition-all active:scale-[0.98]"
                    >
                      <IconThumbUp />
                      Approve Video
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={remaining <= 0}
                      title={remaining <= 0 ? 'Revision limit reached — contact your account manager' : undefined}
                      className="flex items-center gap-2 px-5 py-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 font-semibold text-sm hover:bg-red-100 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Request Revision
                    </button>
                  </div>
                )}
                {isApproved && (
                  <div className="animate-slide-up stagger-3">
                    <button
                      onClick={() => toast.info('Download requires Supabase Storage in production — signed URL would be issued here')}
                      className="flex items-center gap-2 px-5 py-2.5 bg-primary rounded-xl text-white font-semibold text-sm shadow-clay hover:brightness-110 transition-all active:scale-[0.98]"
                    >
                      <IconDownload />
                      Download Video
                    </button>
                  </div>
                )}
              </div>

              {/* Right / below: comments */}
              <div className={cn('clay-card overflow-hidden animate-slide-up stagger-4', theater ? 'w-80 flex-shrink-0' : 'w-full')}>
                <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                  <IconComment />
                  <h3 className="font-heading font-semibold text-sm">Comments</h3>
                  <span className="ml-auto text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{comments.length}</span>
                </div>

                <div className={cn('divide-y divide-border/40 overflow-y-auto', theater ? 'max-h-80' : 'max-h-64')}>
                  {sortedComments.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <p className="text-muted-foreground text-sm">No comments yet.</p>
                      {canReview && <p className="text-xs text-muted-foreground mt-1">Add a timestamp and leave your feedback below.</p>}
                    </div>
                  ) : (
                    sortedComments.map((c, i) => (
                      <div
                        key={c.id}
                        className={cn(
                          'w-full text-left px-4 py-3 hover:bg-muted/30 transition-all duration-150 group',
                          activeCommentId === c.id && 'bg-primary/8 border-l-2 border-primary',
                          `stagger-${Math.min(i + 1, 7)}`,
                        )}
                      >
                        <div className="flex items-start gap-2.5">
                          <button onClick={() => { setActiveCommentId(activeCommentId === c.id ? null : c.id); if (c.timestamp_sec !== null) setCurrentTimeSec(c.timestamp_sec) }} className="flex-1 text-left flex items-start gap-2.5">
                            <Avatar name={c.profiles.full_name} role={c.author_role} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-semibold">{c.profiles.full_name}</span>
                                {c.timestamp_sec !== null && (
                                  <span className="text-[10px] font-mono bg-primary/15 text-primary px-1.5 py-0.5 rounded">{formatTimestamp(c.timestamp_sec)}</span>
                                )}
                                <span className="text-[10px] text-muted-foreground ml-auto">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
                              </div>
                              <p className="text-xs text-foreground/80 mt-1 leading-relaxed">{c.comment_text}</p>
                            </div>
                          </button>
                          <button
                            onClick={() => {
                              const ts = c.timestamp_sec !== null ? `[${formatTimestamp(c.timestamp_sec)}]` : ''
                              setChatMention(`Re: "${c.comment_text.slice(0, 60)}..." ${ts}`.trim())
                            }}
                            title="Mention in chat"
                            className="flex-shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {canReview && (
                  <div className="p-3 border-t border-border bg-muted/20">
                    <div className="text-xs text-muted-foreground mb-2 font-mono">@ {formatTimestamp(currentTimeSec)}</div>
                    <div className="flex gap-2">
                      <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Add a comment at the current timestamp…"
                        rows={2}
                        className="flex-1 px-3 py-2 bg-input border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none leading-relaxed"
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment() } }}
                      />
                      <button
                        onClick={addComment}
                        disabled={!newComment.trim()}
                        className="px-3 py-2 bg-primary rounded-lg text-white self-end hover:brightness-110 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <IconSend />
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5">Enter to post · Shift+Enter for new line</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="animate-fade-in">
            <div className="aspect-video bg-muted/20 rounded-xl flex items-center justify-center border border-dashed border-border">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-3 text-muted-foreground">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                  </svg>
                </div>
                <p className="text-muted-foreground text-sm">Your video will appear here when it's ready</p>
              </div>
            </div>
          </div>
        ))}

        <div className="pb-16" />
      </main>

      {profile && (
        <ChatPanel
          currentUserId={profile.id}
          mentionText={chatMention}
          onMentionConsumed={() => setChatMention(undefined)}
        />
      )}
    </div>
  )
}
