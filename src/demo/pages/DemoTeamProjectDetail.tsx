import { useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { MOCK_PROJECTS, MOCK_FILES, MOCK_COMMENTS, MOCK_ASSIGNMENTS, _teamNotesStore, formatProjectTitle, _deadlinesStore, type TeamNote } from '../mockData'
import { useDemoAuth } from '../DemoAuthContext'
import { ProjectStatusBadge } from '@/components/project/ProjectStatusBadge'
import { DeliverableCounter } from '@/components/project/DeliverableCounter'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { formatTimestamp } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import type { ProjectStatus } from '@/types'
import { DemoProjectStorageTab } from './DemoProjectStorageTab'

const DEMO_DURATION = 312 // seconds

// ── Icons ──────────────────────────────────────────────────────────────────────
function IconPlay() {
  return <svg className="w-6 h-6 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
}
function IconNote() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
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
function IconChat() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
  )
}


export default function DemoTeamProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useDemoAuth()
  const [project, setProject] = useState(MOCK_PROJECTS.find((p) => p.id === id))
  const revisionComments = MOCK_COMMENTS.filter((c) => c.project_id === id)
  const files = MOCK_FILES.filter((f) => f.project_id === id)
  const deliverables = files.filter((f) => f.file_type === 'deliverable')
  const sourceFiles = files.filter((f) => f.file_type !== 'deliverable')

  // Deadline for this member on this project
  const myAssignment = MOCK_ASSIGNMENTS.find((a) => a.project_id === id && a.team_member_id === profile?.id)
  const myDeadline = myAssignment ? _deadlinesStore.find((d) => d.assignment_id === myAssignment.id) : undefined

  // Tab state
  const [activeTab, setActiveTab] = useState<'review' | 'storage'>('review')

  // Video state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTimeSec, setCurrentTimeSec] = useState(0)
  const [theater, setTheater] = useState(false)
  const progressRef = useRef<HTMLDivElement>(null)

  // Notes state — persisted in shared store so admin can read them
  const [notes, setNotes] = useState<TeamNote[]>(
    _teamNotesStore.filter((n) => n.project_id === id && n.author_id === profile?.id)
  )
  const [newNote, setNewNote] = useState('')
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)

  // Chat mention
  const [chatMention, setChatMention] = useState<string | undefined>(undefined)

  // Upload + submit
  const [fakeUploaded, setFakeUploaded] = useState(false)
  const canUpload = project?.status === 'in_progress' || project?.status === 'revision_requested'

  if (!project) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground">Project not found</p>
    </div>
  )

  const totalDeliverables = deliverables.length + (fakeUploaded ? 1 : 0)
  const progressPct = (currentTimeSec / DEMO_DURATION) * 100
  const timedNotes = notes.filter((n) => n.timestamp_sec !== null)

  const togglePlay = () => {
    setIsPlaying((p) => !p)
    toast.info('Video playback is simulated in demo mode')
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setCurrentTimeSec(Math.round(pct * DEMO_DURATION))
  }

  const handleAddNote = () => {
    if (!newNote.trim() || !profile) return
    const note: TeamNote = {
      id: `note-${Date.now()}`,
      project_id: id!,
      author_id: profile.id,
      timestamp_sec: currentTimeSec,
      text: newNote.trim(),
      created_at: new Date().toISOString(),
    }
    _teamNotesStore.push(note)
    setNotes((prev) => [...prev, note])
    setNewNote('')
  }

  const handleFakeUpload = () => {
    setFakeUploaded(true)
    toast.success('deliverable-v1.mp4 uploaded (demo)')
  }

  const handleSubmitReview = () => {
    if (!fakeUploaded && deliverables.length === 0) { toast.error('Upload a deliverable first'); return }
    setProject((p) => p ? { ...p, status: 'in_review' as ProjectStatus, updated_at: new Date().toISOString() } : p)
    toast.success('Submitted for admin review')
  }

  const sortedNotes = [...notes].sort((a, b) => {
    if (a.timestamp_sec === null) return 1
    if (b.timestamp_sec === null) return -1
    return a.timestamp_sec - b.timestamp_sec
  })

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-30" style={{ height: '52px' }}>
        <div className="max-w-6xl mx-auto px-6 h-full flex items-center gap-3">
          <Link to="/team" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            My Assignments
          </Link>
          <span className="text-border">/</span>
          <span className="text-sm font-medium truncate max-w-xs">{formatProjectTitle(project.title, project.client_id)}</span>
          <div className="ml-auto">
            <ProjectStatusBadge status={project.status} />
          </div>
        </div>
      </header>

      <main className={cn('mx-auto px-4 py-6 transition-all duration-300', theater ? 'max-w-6xl' : 'max-w-4xl')}>

        {/* Title row */}
        <div className="flex items-start gap-3 flex-wrap mb-5 animate-slide-up">
          <h1 className="text-2xl font-heading font-bold flex-1">{formatProjectTitle(project.title, project.client_id)}</h1>
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
            currentUserId={profile?.id ?? ''}
            role="team"
          />
        )}

        {/* ── Video section ── */}
        {activeTab === 'review' && (deliverables.length > 0 || fakeUploaded ? (
          <div className="animate-slide-up stagger-1">
            {/* Player + timeline fused */}
            <div className="space-y-0">
              {/* Player */}
              <div className="relative aspect-video bg-zinc-950 rounded-t-xl border border-border border-b-0 overflow-hidden group">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1 font-mono">
                      {fakeUploaded ? 'deliverable-v1.mp4 (demo upload)' : deliverables[0]?.file_name}
                    </p>
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

                {/* Note pins on video */}
                {timedNotes.map((n) => {
                  const pct = ((n.timestamp_sec ?? 0) / DEMO_DURATION) * 100
                  return (
                    <button
                      key={n.id}
                      onClick={() => setActiveNoteId(activeNoteId === n.id ? null : n.id)}
                      style={{ left: `${pct}%`, bottom: '40px' }}
                      className="absolute transform -translate-x-1/2 z-10"
                    >
                      <div className={cn(
                        'w-5 h-5 rounded-full border-2 border-background flex items-center justify-center text-[9px] font-bold transition-transform hover:scale-125',
                        activeNoteId === n.id ? 'bg-primary scale-125' : 'bg-violet-400',
                      )}>
                        ✎
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Timeline bar */}
              <div
                ref={progressRef}
                className="relative h-10 bg-zinc-900 rounded-b-xl border border-border border-t-0 px-3 flex items-center gap-3 cursor-pointer select-none"
                onClick={seek}
              >
                <div className="relative flex-1 h-1.5 bg-white/10 rounded-full overflow-visible">
                  <div className="absolute left-0 top-0 h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
                  <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow border border-primary transition-all duration-300" style={{ left: `calc(${progressPct}% - 6px)` }} />
                  {timedNotes.map((n) => {
                    const pct = ((n.timestamp_sec ?? 0) / DEMO_DURATION) * 100
                    return (
                      <button
                        key={n.id}
                        onClick={(e) => { e.stopPropagation(); setActiveNoteId(activeNoteId === n.id ? null : n.id); if (n.timestamp_sec !== null) setCurrentTimeSec(n.timestamp_sec) }}
                        style={{ left: `${pct}%` }}
                        className={cn('timeline-pin', activeNoteId === n.id ? 'bg-primary border-primary' : 'bg-violet-400 border-violet-400')}
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
                  <span>{theater ? 'Exit theater' : 'Theater'}</span>
                </button>
              </div>
            </div>{/* end fused player+timeline */}

            {/* ── My Notes panel ── */}
            <div className={cn('clay-card overflow-hidden mt-5 animate-slide-up stagger-2', theater && 'max-w-full')}>
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <IconNote />
                <h3 className="font-heading font-semibold text-sm">My Notes</h3>
                <span className="ml-1 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">private</span>
                <span className="ml-auto text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{notes.length}</span>
              </div>

              <div className={cn('divide-y divide-border/40 overflow-y-auto', theater ? 'max-h-80' : 'max-h-56')}>
                {sortedNotes.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-muted-foreground text-sm">No notes yet.</p>
                    <p className="text-xs text-muted-foreground mt-1">Pause the video at any point and jot down a note below.</p>
                  </div>
                ) : (
                  sortedNotes.map((n, i) => (
                    <div
                      key={n.id}
                      className={cn(
                        'px-4 py-3 hover:bg-muted/30 transition-all duration-150 group cursor-pointer',
                        activeNoteId === n.id && 'bg-primary/5 border-l-2 border-primary',
                        `stagger-${Math.min(i + 1, 7)}`,
                      )}
                      onClick={() => { setActiveNoteId(activeNoteId === n.id ? null : n.id); if (n.timestamp_sec !== null) setCurrentTimeSec(n.timestamp_sec) }}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        {n.timestamp_sec !== null && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setCurrentTimeSec(n.timestamp_sec!) }}
                            className="text-[10px] font-mono bg-primary/15 text-primary px-1.5 py-0.5 rounded hover:bg-primary/25 transition-colors"
                          >
                            {formatTimestamp(n.timestamp_sec)}
                          </button>
                        )}
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            const ts = n.timestamp_sec !== null ? `[${formatTimestamp(n.timestamp_sec)}]` : ''
                            setChatMention(`Re: "${n.text.slice(0, 60)}..." ${ts}`.trim())
                          }}
                          title="Mention in chat"
                          className="flex-shrink-0 p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <IconChat />
                        </button>
                      </div>
                      <p className="text-sm text-foreground/80 leading-relaxed">{n.text}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Note input */}
              <div className="p-3 border-t border-border bg-muted/20">
                <div className="text-xs text-muted-foreground mb-2 font-mono">@ {formatTimestamp(currentTimeSec)}</div>
                <div className="flex gap-2">
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Add a note at the current timestamp…"
                    rows={2}
                    className="flex-1 px-3 py-2 bg-input border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none leading-relaxed"
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddNote() } }}
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={!newNote.trim()}
                    className="p-2.5 bg-primary rounded-lg text-white hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 self-end"
                  >
                    <IconSend />
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">Enter to save · Shift+Enter for newline · Notes are private to you</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="aspect-video bg-muted/20 rounded-xl flex items-center justify-center border border-dashed border-border animate-slide-up stagger-1 mb-5">
            <div className="text-center">
              <p className="text-muted-foreground text-sm">No deliverable to preview yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Upload your deliverable below to enable video review</p>
            </div>
          </div>
        ))}

        {activeTab === 'review' && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* Main col */}
          <div className="lg:col-span-2 space-y-5">
            {/* Deadline */}
            {myDeadline && (
              <div className={cn(
                'clay-card p-4 animate-slide-up stagger-1 border-l-4',
                myDeadline.status === 'met' ? 'border-l-green-500' :
                myDeadline.status === 'missed' ? 'border-l-red-500' :
                'border-l-orange-500',
              )}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1">Your Deadline</h3>
                    <p className="text-sm font-semibold text-foreground">
                      {new Date(myDeadline.due_at).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {myDeadline.status === 'pending' && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(myDeadline.due_at) > new Date()
                          ? `${Math.max(0, Math.ceil((new Date(myDeadline.due_at).getTime() - Date.now()) / 3600000))}h remaining`
                          : 'Overdue'}
                      </p>
                    )}
                  </div>
                  <span className={cn(
                    'text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0',
                    myDeadline.status === 'met' ? 'bg-green-100 text-green-700' :
                    myDeadline.status === 'missed' ? 'bg-red-100 text-red-700' :
                    'bg-orange-100 text-orange-700',
                  )}>
                    {myDeadline.status === 'met' ? '✓ Met' : myDeadline.status === 'missed' ? '✗ Missed' : '⏰ Pending'}
                  </span>
                </div>
              </div>
            )}

            {/* Inspiration Video */}
            {project.inspiration_url && (
              <div className="clay-card p-4 animate-slide-up stagger-2">
                <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Inspiration Video</h3>
                <a
                  href={project.inspiration_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline break-all"
                >
                  {project.inspiration_url}
                </a>
              </div>
            )}

            {/* Video Script */}
            {project.video_script && (
              <div className="clay-card p-4 animate-slide-up stagger-3">
                <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Video Script</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.video_script}</p>
              </div>
            )}

            {/* Instructions */}
            {project.instructions && (
              <div className="clay-card p-4 animate-slide-up stagger-3">
                <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Client Instructions</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.instructions}</p>
              </div>
            )}

            {/* Revision comments from admin/client (read-only) */}
            {revisionComments.length > 0 && (
              <div className="space-y-3 animate-slide-up stagger-4">
                <h3 className="font-heading font-semibold text-sm">Revision Comments</h3>
                {revisionComments.map((c) => (
                  <div key={c.id} className="clay-card px-4 py-3 group">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-muted-foreground capitalize">{c.author_role}</span>
                      {c.timestamp_sec !== null && (
                        <button
                          onClick={() => setCurrentTimeSec(c.timestamp_sec!)}
                          className="text-xs text-primary font-mono bg-primary/10 px-2 py-0.5 rounded-full hover:bg-primary/20 transition-colors"
                        >
                          {formatTimestamp(c.timestamp_sec)}
                        </button>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
                      <button
                        onClick={() => {
                          const ts = c.timestamp_sec !== null ? `[${formatTimestamp(c.timestamp_sec)}]` : ''
                          setChatMention(`Re: "${c.comment_text.slice(0, 60)}..." ${ts}`.trim())
                        }}
                        title="Mention in chat"
                        className="flex-shrink-0 p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <IconChat />
                      </button>
                    </div>
                    <p className="text-sm">{c.comment_text}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Source files */}
            <div className="clay-card p-4 animate-slide-up stagger-5">
              <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-3">Source Files from Client</h3>
              {sourceFiles.length === 0 ? (
                <p className="text-muted-foreground text-sm">No source files</p>
              ) : (
                <div className="space-y-2">
                  {sourceFiles.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => toast.info('File access requires Supabase Storage in production')}
                      className="flex items-center gap-2 w-full text-left text-sm hover:text-primary transition-colors group"
                    >
                      <svg className="w-4 h-4 text-muted-foreground group-hover:text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      <span>{f.file_name}</span>
                      {f.file_size && <span className="text-muted-foreground ml-auto text-xs">{(f.file_size / 1024 / 1024).toFixed(0)} MB</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            {/* Upload deliverable */}
            <div className="clay-card p-4 animate-slide-up stagger-3">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Your Deliverable</h3>
                <DeliverableCounter used={totalDeliverables} max={project.max_deliverables} />
              </div>

              {canUpload && totalDeliverables < project.max_deliverables && (
                <div
                  className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 transition-colors mb-3"
                  onClick={handleFakeUpload}
                >
                  <p className="text-sm text-muted-foreground">Drop video here or <span className="text-primary">browse</span></p>
                </div>
              )}

              {deliverables.map((f) => (
                <div key={f.id} className="flex items-center gap-2 text-sm py-2">
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="truncate">{f.file_name}</span>
                </div>
              ))}

              {fakeUploaded && (
                <div className="flex items-center gap-2 text-sm py-2">
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>deliverable-v1.mp4 (demo upload)</span>
                </div>
              )}
            </div>

            {(canUpload || project.status === 'in_review') && (
              <button
                onClick={handleSubmitReview}
                disabled={project.status === 'in_review'}
                className="w-full py-2.5 bg-primary rounded-xl text-white font-semibold text-sm shadow-clay hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-50 animate-slide-up stagger-4"
              >
                {project.status === 'in_review' ? 'Submitted for Review' : 'Submit for Review'}
              </button>
            )}
          </div>
        </div>}

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
