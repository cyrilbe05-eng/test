import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useProject, useProjectFiles, useTimelineComments } from '@/hooks/useProjects'
import { TimelineCommentor } from '@/components/project/TimelineCommentor'
import { ProjectStatusBadge } from '@/components/project/ProjectStatusBadge'
import { RevisionCounter } from '@/components/project/RevisionCounter'
import { useAuth } from '@/hooks/useAuth'
import { useApiFetch } from '@/lib/api'
import { ClientLayout } from '@/components/workspace/ClientLayout'
import type { ProjectFile } from '@/types'

function IconArrowLeft() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
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
function IconThumbUp() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
    </svg>
  )
}

function StatusBanner({ color, children }: { color: string; children: React.ReactNode }) {
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

function StorageTab({ files, onDownload }: { files: ProjectFile[]; onDownload: (file: ProjectFile) => void }) {
  const deliverables = files.filter((f) => f.file_type === 'deliverable' && f.approved)
  const sources = files.filter((f) => f.file_type === 'source_video')

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-heading font-semibold text-sm mb-3">Your Deliverable</h3>
        {deliverables.length === 0 ? (
          <div className="clay-card p-8 text-center">
            <p className="text-muted-foreground text-sm">No deliverable ready yet.</p>
            <p className="text-xs text-muted-foreground mt-1">You'll be notified when your video is ready for download.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {deliverables.map((f) => (
              <div key={f.id} className="clay-card p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{f.file_name}</p>
                  <p className="text-xs text-muted-foreground">Approved deliverable</p>
                </div>
                <button
                  onClick={() => onDownload(f)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors text-xs font-medium"
                >
                  <IconDownload />
                  Download
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {sources.length > 0 && (
        <div>
          <h3 className="font-heading font-semibold text-sm mb-3">Source Files</h3>
          <div className="space-y-1">
            {sources.map((f) => (
              <div key={f.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/40 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 text-sm">
                  {f.file_name.match(/\.(mp4|mov|avi|webm)$/i) ? '🎬' : f.file_name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? '🖼️' : '📎'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{f.file_name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ClientProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const apiFetch = useApiFetch()
  const [theater, setTheater] = useState(false)
  const [activeTab, setActiveTab] = useState<'review' | 'storage'>('review')
  const { data: project, refetch: refetchProject } = useProject(id)
  const { data: files } = useProjectFiles(id)
  const { data: comments, refetch: refetchComments } = useTimelineComments(id)
  const [submitting, setSubmitting] = useState(false)

  const deliverables = (files ?? []).filter((f) => f.file_type === 'deliverable' && f.approved)
  const latestDeliverable = deliverables[0]

  const remaining = project
    ? project.max_client_revisions === -1
      ? Infinity
      : project.max_client_revisions - project.client_revision_count
    : 0

  const canReview = project?.status === 'client_reviewing'
  const canComment = canReview && remaining > 0
  const isApproved = project?.status === 'client_approved'
  const revisionRound = project ? project.client_revision_count + 1 : 1

  const handleApprove = async () => {
    if (!id || !confirm('Approve this video? This will finalise your project and unlock the download.')) return
    try {
      await apiFetch('/api/projects/' + id + '/approve-client', {
        method: 'POST',
        body: JSON.stringify({ file_id: latestDeliverable?.id }),
      })
      toast.success('Video approved!')
      refetchProject()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleReject = async () => {
    if (!id) return
    if (remaining <= 0) { toast.error('Revision limit reached'); return }

    const pendingComments = (comments ?? []).filter(
      (c) => c.author_id === profile?.id && c.revision_round === revisionRound
    )
    if (pendingComments.length === 0) {
      toast.error('Please add at least one comment before requesting a revision')
      return
    }

    setSubmitting(true)
    try {
      await apiFetch('/api/revisions/submit', {
        method: 'POST',
        body: JSON.stringify({ project_id: id }),
      })
      toast.success('Revision requested')
      refetchProject()
    } catch (err: any) {
      if (err?.message?.includes('revision_limit_reached')) {
        toast.error('Revision limit reached — contact your account manager')
      } else {
        toast.error(err.message)
      }
    }
    setSubmitting(false)
  }

  const handleDownload = async (file?: { id: string }) => {
    const fileId = file?.id ?? latestDeliverable?.id
    if (!fileId || !id) return
    try {
      const data = await apiFetch<{ signedUrl: string }>('/api/downloads/' + id + '/' + fileId)
      window.open(data.signedUrl, '_blank')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  if (!project) return (
    <ClientLayout>
      <div className="flex-1 flex items-center justify-center py-32">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    </ClientLayout>
  )

  return (
    <ClientLayout>
      {/* Sticky breadcrumb */}
      <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-20" style={{ height: '52px' }}>
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
          <div className="ml-auto">
            <ProjectStatusBadge status={project.status} />
          </div>
        </div>
      </header>

      <main className={cn('mx-auto px-4 py-6 transition-all duration-300', theater ? 'max-w-6xl' : 'max-w-4xl')}>
        {/* Title + revisions row */}
        <div className="flex items-start gap-3 flex-wrap mb-3 animate-slide-up">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-heading font-bold">{project.title}</h1>
          </div>
          <RevisionCounter
            remaining={remaining === Infinity ? 0 : remaining}
            unlimited={project.max_client_revisions === -1}
          />
        </div>

        {/* Status banners */}
        <div className="space-y-2 mb-4">
          {project.status === 'pending_assignment' && <StatusBanner color="amber">Your project is waiting for a team member to be assigned. We'll notify you when work begins.</StatusBanner>}
          {project.status === 'in_progress' && <StatusBanner color="blue">Our team is actively working on your video. You'll be notified when it's ready to review.</StatusBanner>}
          {project.status === 'in_review' && <StatusBanner color="purple">Your video is being quality-checked by our team. Almost there!</StatusBanner>}
          {project.status === 'revision_requested' && <StatusBanner color="red">Your feedback has been submitted. The team is working on the revisions.</StatusBanner>}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b border-border">
          {(['review', 'storage'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab === 'review' ? '📺 My Video' : '📁 Files'}
            </button>
          ))}
        </div>

        {/* Storage tab */}
        {activeTab === 'storage' && (
          <StorageTab
            files={files ?? []}
            onDownload={handleDownload}
          />
        )}

        {/* Review tab */}
        {activeTab === 'review' && (
          (canReview || isApproved) && latestDeliverable ? (
            <div className="space-y-4 animate-slide-up stagger-2">
              <TimelineCommentor
                storageKey={latestDeliverable.storage_key}
                fileId={latestDeliverable.id}
                projectId={project.id}
                comments={comments ?? []}
                currentUserId={profile!.id}
                currentUserRole="client"
                canComment={canComment}
                revisionRound={revisionRound}
                onCommentAdded={refetchComments}
                theater={theater}
                onTheaterToggle={() => setTheater((t) => !t)}
              />

              <div className={cn('gap-5', theater ? 'flex items-start' : 'space-y-4')}>
                <div className={cn('space-y-3', theater && 'flex-1')}>
                  {canReview && (
                    <div className="flex items-center gap-3 flex-wrap animate-slide-up stagger-3">
                      <button
                        onClick={handleApprove}
                        className="flex items-center gap-2 px-5 py-2.5 bg-green-600 rounded-xl text-white font-semibold text-sm hover:brightness-110 transition-all active:scale-[0.98] shadow-clay"
                      >
                        <IconThumbUp />
                        Approve Video
                      </button>
                      <button
                        onClick={handleReject}
                        disabled={submitting || remaining <= 0}
                        title={remaining <= 0 ? 'Revision limit reached — contact your account manager' : undefined}
                        className="flex items-center gap-2 px-5 py-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 font-semibold text-sm hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {submitting ? 'Submitting…' : 'Request Revision'}
                      </button>
                    </div>
                  )}
                  {isApproved && latestDeliverable?.approved && (
                    <div className="animate-slide-up stagger-3">
                      <button
                        onClick={() => handleDownload()}
                        className="flex items-center gap-2 px-5 py-2.5 bg-primary rounded-xl text-white font-semibold text-sm shadow-clay hover:brightness-110 transition-all active:scale-[0.98]"
                      >
                        <IconDownload />
                        Download Video
                      </button>
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
          )
        )}

        <div className="pb-16" />
      </main>
    </ClientLayout>
  )
}
