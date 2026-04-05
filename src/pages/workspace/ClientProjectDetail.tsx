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

export default function ClientProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const apiFetch = useApiFetch()
  const [theater, setTheater] = useState(false)
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

  const handleDownload = async () => {
    if (!latestDeliverable?.id || !id) return
    try {
      const data = await apiFetch<{ signedUrl: string }>('/api/downloads/' + id + '/' + latestDeliverable.id)
      window.open(data.signedUrl, '_blank')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  if (!project) return <Loader />

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 flex items-center gap-3" style={{ height: '52px' }}>
          <Link to="/workspace" className="text-muted-foreground hover:text-foreground text-sm transition-colors">← My Workspace</Link>
          <span className="text-border">/</span>
          <span className="text-sm font-medium truncate">{project.title}</span>
          <div className="ml-auto"><ProjectStatusBadge status={project.status} /></div>
        </div>
      </header>

      <main className={cn('mx-auto px-4 py-6 transition-all duration-300', theater ? 'max-w-6xl' : 'max-w-4xl')}>
        <div className="flex items-start gap-3 flex-wrap mb-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-heading font-semibold tracking-tight">{project.title}</h1>
          </div>
          <RevisionCounter
            remaining={remaining === Infinity ? 0 : remaining}
            unlimited={project.max_client_revisions === -1}
          />
        </div>

        {project.status === 'pending_assignment' && <StatusBanner color="amber">Your project is waiting for a team member to be assigned.</StatusBanner>}
        {project.status === 'in_progress' && <StatusBanner color="blue">Our team is working on your video. We'll notify you when it's ready.</StatusBanner>}
        {project.status === 'in_review' && <StatusBanner color="purple">Your video is being reviewed by our team. Hang tight!</StatusBanner>}
        {project.status === 'revision_requested' && <StatusBanner color="red">Your feedback has been submitted. The team is working on revisions.</StatusBanner>}

        {(canReview || isApproved) && latestDeliverable ? (
          <div className="space-y-4">
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
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={handleApprove}
                      className="px-5 py-2.5 bg-green-600 rounded-xl text-white font-semibold text-sm hover:brightness-110 transition-all active:scale-[0.98] shadow-clay"
                    >
                      Approve Video
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={submitting || remaining <= 0}
                      title={remaining <= 0 ? 'Revision limit reached — contact your account manager' : undefined}
                      className="px-5 py-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 font-semibold text-sm hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {submitting ? 'Submitting…' : 'Request Revision'}
                    </button>
                  </div>
                )}
                {isApproved && latestDeliverable?.approved && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary rounded-xl text-white font-semibold text-sm shadow-clay hover:brightness-110 transition-all active:scale-[0.98]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download Video
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="aspect-video bg-muted/50 rounded-xl flex items-center justify-center border border-border">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                </svg>
              </div>
              <p className="text-muted-foreground text-sm">Your video will appear here when ready</p>
            </div>
          </div>
        )}
        <div className="pb-16" />
      </main>
    </div>
  )
}

function StatusBanner({ color, children }: { color: string; children: React.ReactNode }) {
  const colors: Record<string, string> = {
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    purple: 'bg-violet-50 border-violet-200 text-violet-800',
    red: 'bg-red-50 border-red-200 text-red-800',
  }
  return <div className={`mb-6 px-4 py-3 rounded-xl border text-sm ${colors[color]}`}>{children}</div>
}

function Loader() {
  return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
}
