import { useState } from 'react'
import { toast } from 'sonner'
import { useUpdateProjectStatus } from '@/hooks/useProjects'
import { formatDistanceToNow } from 'date-fns'
import type { Project, ProjectStatus } from '@/types'
import { Link } from 'react-router-dom'

const COLUMNS: { statuses: ProjectStatus[]; dropTarget: ProjectStatus; label: string }[] = [
  { statuses: ['pending_assignment'], dropTarget: 'pending_assignment', label: 'Pending Assignment' },
  { statuses: ['in_progress'],        dropTarget: 'in_progress',        label: 'In Progress' },
  { statuses: ['in_review', 'admin_approved'], dropTarget: 'admin_approved', label: 'Admin Approved' },
  { statuses: ['client_reviewing'],   dropTarget: 'client_reviewing',   label: 'Client Reviewing' },
  { statuses: ['revision_requested'], dropTarget: 'revision_requested', label: 'Revision Requested' },
  { statuses: ['client_approved'],    dropTarget: 'client_approved',    label: 'Client Approved' },
]

// Allowed drag transitions
const ALLOWED_TRANSITIONS: Partial<Record<ProjectStatus, ProjectStatus[]>> = {
  pending_assignment: ['in_progress'],
  in_progress: ['in_review', 'admin_approved'],
  in_review: ['admin_approved', 'revision_requested'],
  admin_approved: ['client_reviewing'],
  client_reviewing: ['client_approved', 'revision_requested'],
  revision_requested: ['in_progress'],
}

interface Props {
  projects: (Project & { profiles?: { full_name: string } })[]
}

export function KanbanBoard({ projects }: Props) {
  const [dragging, setDragging] = useState<{ id: string; fromStatus: ProjectStatus } | null>(null)
  const updateStatus = useUpdateProjectStatus()

  const handleDrop = async (toStatus: ProjectStatus) => {
    if (!dragging) return
    const allowed = ALLOWED_TRANSITIONS[dragging.fromStatus] ?? []
    if (!allowed.includes(toStatus)) {
      toast.error(`Cannot move from ${dragging.fromStatus} to ${toStatus}`)
      setDragging(null)
      return
    }
    // Confirm sensitive transitions
    if (toStatus === 'client_approved') {
      if (!confirm('Mark this project as client approved? This will unlock the download for the client.')) {
        setDragging(null)
        return
      }
    }
    try {
      await updateStatus.mutateAsync({ id: dragging.id, status: toStatus })
      toast.success('Status updated')
    } catch (err) {
      toast.error((err as Error).message)
    }
    setDragging(null)
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {COLUMNS.map((col) => {
        const cards = projects.filter((p) => col.statuses.includes(p.status))
        return (
          <div
            key={col.dropTarget}
            className="flex-shrink-0 w-60 flex flex-col"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(col.dropTarget)}
          >
            <div className="flex items-center justify-between mb-2.5 px-1">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{col.label}</h3>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-medium">{cards.length}</span>
            </div>
            <div className="space-y-2 min-h-16">
              {cards.map((project) => (
                <div
                  key={project.id}
                  draggable
                  onDragStart={() => setDragging({ id: project.id, fromStatus: project.status })}
                  onDragEnd={() => setDragging(null)}
                  className="clay-card p-3.5 cursor-grab active:cursor-grabbing hover:shadow-lg transition-all duration-150 hover:-translate-y-0.5"
                >
                  <Link to={`/admin/projects/${project.id}`} className="block">
                    <p className="font-medium text-sm text-foreground line-clamp-2 leading-snug">{project.title}</p>
                    {project.profiles && (
                      <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                        {project.profiles.full_name}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground/60 mt-1.5">
                      {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}
                    </p>
                  </Link>
                </div>
              ))}
              {cards.length === 0 && (
                <div className="border border-dashed border-border/60 rounded-xl p-4 flex items-center justify-center text-xs text-muted-foreground/40 min-h-[56px]">
                  Empty
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
