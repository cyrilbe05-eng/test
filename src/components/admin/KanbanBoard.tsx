import { useState } from 'react'
import { toast } from 'sonner'
import { useUpdateProjectStatus } from '@/hooks/useProjects'
import { projectTimeLabel } from '@/lib/utils'
import type { Project, ProjectStatus } from '@/types'
import { Link } from 'react-router-dom'
import { isBackward } from '@/lib/statusFlow'

const COLUMNS: { statuses: ProjectStatus[]; dropTarget: ProjectStatus; label: string }[] = [
  { statuses: ['pending_assignment'], dropTarget: 'pending_assignment', label: 'Pending Assignment' },
  { statuses: ['in_progress'],        dropTarget: 'in_progress',        label: 'In Progress' },
  { statuses: ['in_review', 'admin_approved'], dropTarget: 'admin_approved', label: 'Admin Approved' },
  { statuses: ['client_reviewing'],   dropTarget: 'client_reviewing',   label: 'Client Reviewing' },
  { statuses: ['revision_requested'], dropTarget: 'revision_requested', label: 'Revision Requested' },
  { statuses: ['client_approved'],    dropTarget: 'client_approved',    label: 'Client Approved' },
]

// Admins can move a card to ANY column. Backwards (an earlier stage outside
// the normal flow) asks first, and the API sends no notifications for it.
const LABEL = (s: ProjectStatus) => COLUMNS.find((c) => c.statuses.includes(s))?.label ?? s

interface Props {
  projects: (Project & { profiles?: { full_name: string }; assigned_team_names?: string | null })[]
}

export function KanbanBoard({ projects }: Props) {
  const [dragging, setDragging] = useState<{ id: string; fromStatus: ProjectStatus } | null>(null)
  const [back, setBack] = useState<{ id: string; to: ProjectStatus; title: string } | null>(null)
  const updateStatus = useUpdateProjectStatus()

  const move = async (id: string, toStatus: ProjectStatus) => {
    try {
      await updateStatus.mutateAsync({ id, status: toStatus })
      toast.success('Status updated')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleDrop = async (toStatus: ProjectStatus) => {
    if (!dragging) return
    const { id, fromStatus } = dragging
    setDragging(null)
    // Same column (In Review and Admin Approved share one): nothing to do.
    if (COLUMNS.find((c) => c.statuses.includes(fromStatus))?.dropTarget === toStatus) return
    if (isBackward(fromStatus, toStatus)) {
      setBack({ id, to: toStatus, title: projects.find((p) => p.id === id)?.title ?? '' })
      return
    }
    // Confirm sensitive transitions
    if (toStatus === 'client_approved') {
      if (!confirm('Mark this project as client approved? This will unlock the download for the client.')) return
    }
    await move(id, toStatus)
  }

  return (
    <>
    {back && (
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={() => setBack(null)}>
        <div role="dialog" aria-modal="true" aria-label="Move back" onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm bg-card border border-border rounded-2xl p-5 space-y-4 shadow-2xl">
          <div>
            <p className="font-heading font-semibold">Move back to {LABEL(back.to)}?</p>
            <p className="text-sm text-muted-foreground mt-1 truncate">{back.title}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="min-h-[44px] rounded-xl border border-border text-sm hover:bg-muted" onClick={() => setBack(null)}>Cancel</button>
            <button className="min-h-[44px] rounded-xl bg-primary text-white text-sm font-semibold hover:brightness-110"
              onClick={() => { const b = back; setBack(null); void move(b.id, b.to) }}>Move back</button>
          </div>
        </div>
      </div>
    )}
    <div className="flex gap-3 overflow-x-auto pb-4">
      {COLUMNS.map((col) => {
        const cards = projects.filter((p) => col.statuses.includes(p.status))
        // Completed column reads as an archive: most recent completion on top.
        // (client_approved is terminal, so updated_at is the completion moment.
        // Other columns keep the API's created_at ordering.)
        if (col.dropTarget === 'client_approved') {
          cards.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        }
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
                    {project.profiles?.full_name && (
                      <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                        {project.profiles.full_name}
                      </p>
                    )}
                    {project.assigned_team_names ? (
                      <p className="text-[10px] text-primary/70 mt-1 flex items-center gap-1">
                        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span className="truncate">{project.assigned_team_names}</span>
                      </p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground/40 mt-1">Unassigned</p>
                    )}
                    <p className="text-[10px] text-muted-foreground/60 mt-1.5">
                      {projectTimeLabel(project)}
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
    </>
  )
}
