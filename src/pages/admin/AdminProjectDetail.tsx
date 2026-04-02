import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { getSignedUrlById } from '@/lib/storage'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { useProject, useProjectFiles, useProjectAssignments, useTimelineComments, useUpdateProjectStatus } from '@/hooks/useProjects'
import { TimelineCommentor } from '@/components/project/TimelineCommentor'
import { ProjectStatusBadge } from '@/components/project/ProjectStatusBadge'
import { DeliverableCounter } from '@/components/project/DeliverableCounter'
import { AdminNav } from '@/components/admin/AdminNav'
import { useAuth } from '@/hooks/useAuth'
import { useApiFetch } from '@/lib/api'
import type { Profile } from '@/types'

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

  const apiFetch = useApiFetch()
  const { data: teamMembers } = useQuery<Profile[]>({
    queryKey: ['team_members'],
    queryFn: () => apiFetch<Profile[]>('/api/users/team'),
  })

  const deliverables = (files ?? []).filter((f) => f.file_type === 'deliverable')
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

  if (isLoading || !project) return <Loader />

  const assignedIds = new Set((assignments ?? []).map((a) => a.team_member_id))
  const unassignedTeam = (teamMembers ?? []).filter((m) => !assignedIds.has(m.id))
  const revisionRound = project.client_revision_count + 1

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />

      <main className={cn('mx-auto px-6 py-8 transition-all duration-300', theater ? 'max-w-7xl' : 'max-w-6xl')}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main: Video + Comments */}
          <div className="lg:col-span-2 space-y-5">
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <h1 className="text-xl font-heading font-semibold tracking-tight">{project.title}</h1>
                <ProjectStatusBadge status={project.status} />
              </div>
              {project.inspiration_url && (
                <a href={project.inspiration_url} target="_blank" rel="noopener noreferrer" className="text-primary text-sm hover:underline break-all">
                  🎬 {project.inspiration_url}
                </a>
              )}
            </div>

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
              <div className="flex gap-3">
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

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Source files */}
            <Section title="Source Files">
              {(files ?? []).filter((f) => f.file_type !== 'deliverable').length === 0 ? (
                <p className="text-muted-foreground text-sm">No source files</p>
              ) : (
                <div className="space-y-2">
                  {(files ?? []).filter((f) => f.file_type !== 'deliverable').map((f) => (
                    <FileRow key={f.id} name={f.file_name} size={f.file_size} fileId={f.id} />
                  ))}
                </div>
              )}
            </Section>

            {/* Deliverables */}
            <Section title="Deliverables">
              <DeliverableCounter used={deliverables.length} max={project.max_deliverables} />
              <div className="space-y-2 mt-3">
                {deliverables.map((f) => (
                  <FileRow key={f.id} name={f.file_name} size={f.file_size} fileId={f.id} />
                ))}
              </div>
            </Section>

            {/* Team assignment */}
            <Section title="Assigned Team">
              <div className="space-y-2 mb-3">
                {(assignments ?? []).map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-sm">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary border border-primary/20">
                      {a.profiles.full_name.charAt(0)}
                    </div>
                    <span className="text-sm">{a.profiles.full_name}</span>
                  </div>
                ))}
              </div>
              {unassignedTeam.length > 0 && (
                <div className="flex gap-2">
                  <select
                    value={selectedTeamMember}
                    onChange={(e) => setSelectedTeamMember(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 bg-muted border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">Assign member…</option>
                    {unassignedTeam.map((m) => (
                      <option key={m.id} value={m.id}>{m.full_name}</option>
                    ))}
                  </select>
                  <button
                    onClick={assignTeamMember}
                    disabled={!selectedTeamMember}
                    className="px-3 py-1.5 bg-primary rounded-xl text-white text-sm font-medium disabled:opacity-40 hover:brightness-110 transition-all"
                  >
                    Assign
                  </button>
                </div>
              )}
            </Section>

            {/* Instructions */}
            {project.instructions && (
              <Section title="Instructions">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{project.instructions}</p>
              </Section>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="clay-card p-4">
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
    <button onClick={handleDownload} className="flex items-center gap-2 w-full text-left hover:text-primary transition-colors text-sm group">
      <svg className="w-4 h-4 text-muted-foreground group-hover:text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
      </svg>
      <span className="truncate">{name}</span>
      {size && <span className="text-muted-foreground ml-auto flex-shrink-0">{(size / 1024 / 1024).toFixed(1)} MB</span>}
    </button>
  )
}

function Loader() {
  return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
}
