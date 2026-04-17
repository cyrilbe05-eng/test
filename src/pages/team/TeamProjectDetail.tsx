import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { TeamLayout } from '@/components/workspace/TeamLayout'
import { getSignedUrlById } from '@/lib/storage'
import { useApiFetch } from '@/lib/api'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { useProject, useProjectFiles, useTimelineComments, useUpdateProjectStatus } from '@/hooks/useProjects'
import { ProjectStatusBadge } from '@/components/project/ProjectStatusBadge'
import { DeliverableCounter } from '@/components/project/DeliverableCounter'
import { FileUploader } from '@/components/project/FileUploader'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes === 0) return '—'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatTimestamp(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

// ── Collapsible long-text block ───────────────────────────────────────────────
function TextBlock({ label, value }: { label: string; value: string }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = value.length > 300
  return (
    <div className="clay-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">{label}</h3>
        {isLong && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-xs text-primary hover:underline flex-shrink-0"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
      <div
        className={cn(
          'px-4 py-3 text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap overflow-hidden transition-all',
          !expanded && isLong ? 'max-h-32' : 'max-h-none',
        )}
        style={!expanded && isLong ? { WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)' } : {}}
      >
        {value}
      </div>
      {!expanded && isLong && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full px-4 pb-3 text-xs text-primary hover:underline text-left"
        >
          Read full text ↓
        </button>
      )}
    </div>
  )
}

// ── File row ──────────────────────────────────────────────────────────────────
function FileRow({ name, size, fileId, badge, canDelete, onDelete }: {
  name: string; size: number | null; fileId: string; badge?: string
  canDelete?: boolean; onDelete?: () => void
}) {
  const apiFetch = useApiFetch()
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDownload = async () => {
    setLoading(true)
    try {
      const url = await getSignedUrlById(apiFetch, fileId)
      window.open(url, '_blank')
    } catch {
      toast.error('Failed to get download link')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await apiFetch(`/api/project-files/${fileId}`, { method: 'DELETE' })
      toast.success('File deleted')
      onDelete?.()
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to delete file')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 hover:bg-muted/60 transition-colors group">
      <button
        onClick={handleDownload}
        disabled={loading}
        className="flex items-center gap-3 flex-1 text-left disabled:opacity-60 min-w-0"
      >
        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
          <svg className="w-4 h-4 text-muted-foreground group-hover:text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate text-foreground group-hover:text-primary transition-colors">{name}</p>
          <p className="text-xs text-muted-foreground">{formatBytes(size)}</p>
        </div>
        {badge && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">{badge}</span>
        )}
        {loading && <div className="w-3.5 h-3.5 rounded-full border border-primary border-t-transparent animate-spin flex-shrink-0" />}
      </button>
      {canDelete && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
          title="Delete file"
        >
          {deleting
            ? <div className="w-3 h-3 rounded-full border border-destructive border-t-transparent animate-spin" />
            : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          }
        </button>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function TeamProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const { data: project } = useProject(id)
  const { data: files, refetch: refetchFiles } = useProjectFiles(id)
  const { data: comments } = useTimelineComments(id)
  const updateStatus = useUpdateProjectStatus()

  const deliverables = (files ?? []).filter((f) => f.file_type === 'deliverable')
  const sourceFiles = (files ?? []).filter((f) => f.file_type !== 'deliverable')

  const canUpload = project?.status === 'in_progress' || project?.status === 'revision_requested'
  const canSubmitReview = canUpload && deliverables.length > 0

  const handleSubmitForReview = async () => {
    if (!id || !confirm('Submit for admin review?')) return
    await updateStatus.mutateAsync({ id, status: 'in_review' })
    toast.success('Submitted for review')
  }

  if (!project) return (
    <TeamLayout>
      <div className="flex-1 flex items-center justify-center py-32">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    </TeamLayout>
  )

  const clientName = (project as any).profiles?.full_name

  return (
    <TeamLayout>
      {/* Breadcrumb */}
      <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-20" style={{ height: '52px' }}>
        <div className="h-full px-6 flex items-center gap-3">
          <Link to="/team" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Projects</span>
          </Link>
          <span className="text-border/60">/</span>
          <span className="text-sm font-medium truncate max-w-xs">{project.title}</span>
          <div className="ml-auto"><ProjectStatusBadge status={project.status} /></div>
        </div>
      </header>

      <main className="px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Left: main content ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Title + meta */}
            <div className="clay-card p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <h1 className="text-xl font-heading font-semibold tracking-tight">{project.title}</h1>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {clientName && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-green-500/20 text-green-600 flex items-center justify-center text-[10px] font-bold">{clientName.charAt(0)}</span>
                    {clientName}
                  </span>
                )}
                {project.inspiration_url && (
                  <a
                    href={project.inspiration_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Inspiration video
                  </a>
                )}
                <span className="ml-auto">{formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}</span>
              </div>
            </div>

            {/* Source files */}
            <div className="clay-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
                <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Source Files from Client</h3>
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{sourceFiles.length}</span>
              </div>
              <div className="p-2">
                {sourceFiles.length === 0 ? (
                  <p className="text-muted-foreground text-sm px-3 py-4 text-center">No source files uploaded yet</p>
                ) : (
                  sourceFiles.map((f) => (
                    <FileRow
                      key={f.id}
                      name={f.file_name}
                      size={f.file_size}
                      fileId={f.id}
                      badge={f.file_type === 'source_video' ? 'Main video' : f.file_type === 'attachment' ? 'Attachment' : undefined}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Revision comments */}
            {comments && comments.length > 0 && (
              <div className="clay-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Revision Comments</h3>
                  <span className="ml-auto text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{comments.length}</span>
                </div>
                <div className="divide-y divide-border/40">
                  {comments.map((c) => (
                    <div key={c.id} className="px-4 py-3">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground flex-shrink-0">
                          {c.profiles?.full_name?.charAt(0) ?? '?'}
                        </span>
                        <span className="text-xs font-medium">{c.profiles?.full_name ?? 'Unknown'}</span>
                        <span className="text-[10px] text-muted-foreground capitalize bg-muted px-1.5 py-0.5 rounded-full">{c.author_role}</span>
                        {c.timestamp_sec !== null && (
                          <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                            {formatTimestamp(c.timestamp_sec)}
                          </span>
                        )}
                        <span className="ml-auto text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
                      </div>
                      <p className="text-sm text-foreground/80 leading-relaxed pl-7">{c.comment_text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Description / instructions / script — below source files & comments */}
            {project.description && <TextBlock label="Description" value={project.description} />}
            {project.instructions && <TextBlock label="Client Instructions" value={project.instructions} />}
            {project.video_script && <TextBlock label="Video Script" value={project.video_script} />}
          </div>

          {/* ── Right: sidebar ── */}
          <div className="space-y-4">

            {/* Deliverable upload */}
            <div className="clay-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between gap-2 overflow-hidden">
                <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground truncate">Your Deliverable</h3>
                <div className="flex-shrink-0"><DeliverableCounter used={deliverables.length} max={project.max_deliverables} /></div>
              </div>
              <div className="p-3 space-y-1">
                {deliverables.map((f) => (
                  <FileRow
                    key={f.id}
                    name={f.file_name}
                    size={f.file_size}
                    fileId={f.id}
                    canDelete={canUpload}
                    onDelete={() => { refetchFiles(); qc.invalidateQueries({ queryKey: ['project_files', id] }) }}
                  />
                ))}
              </div>
              {canUpload && (deliverables.length < project.max_deliverables || project.max_deliverables === -1) && (
                <div className="px-3 pb-3">
                  <FileUploader
                    projectId={project.id}
                    fileType="deliverable"
                    accept="video/*"
                    onUploaded={() => { refetchFiles(); qc.invalidateQueries({ queryKey: ['project_files', id] }) }}
                  />
                </div>
              )}
              {canUpload && deliverables.length >= project.max_deliverables && project.max_deliverables !== -1 && (
                <p className="px-4 pb-3 text-xs text-muted-foreground">
                  Deliverable limit reached — delete the existing file to replace it.
                </p>
              )}
              {!canUpload && (
                <p className="px-4 pb-3 text-xs text-muted-foreground">
                  {project.status === 'in_review' || project.status === 'admin_approved'
                    ? 'Under review — uploads locked'
                    : project.status === 'client_reviewing'
                    ? 'Client is reviewing'
                    : project.status === 'client_approved'
                    ? 'Project complete'
                    : 'Uploads not available in this status'}
                </p>
              )}
            </div>

            {/* Submit for review */}
            {canSubmitReview && (
              <button
                onClick={handleSubmitForReview}
                disabled={updateStatus.isPending}
                className="w-full py-2.5 bg-primary rounded-xl text-white font-semibold text-sm shadow-clay hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {updateStatus.isPending ? 'Submitting…' : 'Submit for Review'}
              </button>
            )}

            {/* Project info */}
            <div className="clay-card p-4 space-y-3">
              <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Project Info</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Revisions</span>
                  <span className="font-medium">{project.client_revision_count} / {project.max_client_revisions === -1 ? '∞' : project.max_client_revisions}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Deliverables</span>
                  <span className="font-medium">{deliverables.length} / {project.max_deliverables}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span className="font-medium text-xs">{formatDistanceToNow(new Date(project.created_at), { addSuffix: true })}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </TeamLayout>
  )
}
