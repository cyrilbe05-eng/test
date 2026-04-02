import { useParams, Link } from 'react-router-dom'
import { getSignedUrlById } from '@/lib/storage'
import { useApiFetch } from '@/lib/api'
import { toast } from 'sonner'
import { useProject, useProjectFiles, useTimelineComments, useUpdateProjectStatus } from '@/hooks/useProjects'
import { ProjectStatusBadge } from '@/components/project/ProjectStatusBadge'
import { DeliverableCounter } from '@/components/project/DeliverableCounter'
import { FileUploader } from '@/components/project/FileUploader'
import { useQueryClient } from '@tanstack/react-query'

export default function TeamProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const { data: project } = useProject(id)
  const { data: files, refetch: refetchFiles } = useProjectFiles(id)
  const { data: comments } = useTimelineComments(id)
  const updateStatus = useUpdateProjectStatus()

  const deliverables = (files ?? []).filter((f) => f.file_type === 'deliverable')

  const canUpload = project?.status === 'in_progress' || project?.status === 'revision_requested'
  const canSubmitReview = canUpload && deliverables.length > 0

  const handleSubmitForReview = async () => {
    if (!id || !confirm('Submit for admin review?')) return
    await updateStatus.mutateAsync({ id, status: 'in_review' })
    toast.success('Submitted for review')
  }

  if (!project) return <Loader />

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 flex items-center gap-3" style={{ height: '52px' }}>
          <Link to="/team" className="text-muted-foreground hover:text-foreground text-sm transition-colors">← My Assignments</Link>
          <span className="text-border">/</span>
          <span className="text-sm font-medium truncate">{project.title}</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main */}
          <div className="lg:col-span-2 space-y-5">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-heading font-semibold tracking-tight">{project.title}</h1>
              <ProjectStatusBadge status={project.status} />
            </div>

            {/* Instructions */}
            {project.instructions && (
              <div className="clay-card p-4">
                <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Client Instructions</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{project.instructions}</p>
              </div>
            )}

            {/* Revision comments (read-only for team) */}
            {comments && comments.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm mb-3">Revision Comments</h3>
                <div className="space-y-2">
                  {comments.map((c) => (
                    <div key={c.id} className="clay-card px-4 py-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs font-medium text-muted-foreground capitalize bg-muted px-2 py-0.5 rounded-full">{c.author_role}</span>
                        {c.timestamp_sec !== null && (
                          <span className="text-xs text-primary font-mono bg-primary/10 px-2 py-0.5 rounded-full">
                            {String(Math.floor(c.timestamp_sec / 60)).padStart(2, '0')}:{String(Math.floor(c.timestamp_sec % 60)).padStart(2, '0')}
                          </span>
                        )}
                      </div>
                      <p className="text-sm">{c.comment_text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Source files to review */}
            <div className="clay-card p-4">
              <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-3">Source Files from Client</h3>
              {(files ?? []).filter((f) => f.file_type !== 'deliverable').length === 0 ? (
                <p className="text-muted-foreground text-sm">No source files</p>
              ) : (
                <div className="space-y-2">
                  {(files ?? []).filter((f) => f.file_type !== 'deliverable').map((f) => (
                    <FileRow key={f.id} name={f.file_name} size={f.file_size} fileId={f.id} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Upload deliverable */}
            <div className="clay-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Your Deliverable</h3>
                <DeliverableCounter used={deliverables.length} max={project.max_deliverables} />
              </div>
              {canUpload && deliverables.length < project.max_deliverables && (
                <FileUploader
                  projectId={project.id}
                  fileType="deliverable"
                  accept="video/*"
                  onUploaded={() => { refetchFiles(); qc.invalidateQueries({ queryKey: ['project_files', id] }) }}
                />
              )}
              {deliverables.map((f) => (
                <FileRow key={f.id} name={f.file_name} size={f.file_size} fileId={f.id} />
              ))}
            </div>

            {canSubmitReview && (
              <button
                onClick={handleSubmitForReview}
                className="w-full py-2.5 bg-primary rounded-xl text-white font-semibold text-sm shadow-clay hover:brightness-110 transition-all active:scale-[0.98]"
              >
                Submit for Review
              </button>
            )}
          </div>
        </div>
      </main>
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
    <button onClick={handleDownload} className="flex items-center gap-2 w-full text-left hover:text-primary transition-colors text-sm group">
      <svg className="w-4 h-4 text-muted-foreground group-hover:text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
      </svg>
      <span className="truncate">{name}</span>
      {size && <span className="text-muted-foreground ml-auto">{(size / 1024 / 1024).toFixed(1)} MB</span>}
    </button>
  )
}

function Loader() {
  return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
}
