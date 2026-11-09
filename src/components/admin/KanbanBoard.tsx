import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useUpdateProjectStatus } from '@/hooks/useProjects'
import { cn, projectTimeLabel } from '@/lib/utils'
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
  const [over, setOver] = useState<ProjectStatus | null>(null)
  // Moves show at once (the card lands with a pop) while the API catches up;
  // undone if it fails.
  const [moved, setMoved] = useState<Record<string, ProjectStatus>>({})
  const [landed, setLanded] = useState<string | null>(null)
  const updateStatus = useUpdateProjectStatus()

  // Drop the local override once the server's list agrees.
  useEffect(() => {
    setMoved((m) => {
      const next = { ...m }
      for (const p of projects) if (next[p.id] && next[p.id] === p.status) delete next[p.id]
      return Object.keys(next).length === Object.keys(m).length ? m : next
    })
  }, [projects])
  const shown = projects.map((p) => (moved[p.id] ? { ...p, status: moved[p.id] } : p))

  const move = async (id: string, toStatus: ProjectStatus) => {
    setMoved((m) => ({ ...m, [id]: toStatus }))
    setLanded(id)
    setTimeout(() => setLanded((l) => (l === id ? null : l)), 500)
    try {
      await updateStatus.mutateAsync({ id, status: toStatus })
      toast.success('Status updated')
    } catch (err) {
      setMoved((m) => { const n = { ...m }; delete n[id]; return n })
      toast.error((err as Error).message)
    }
  }

  /** The card under the cursor: slightly tilted and lifted. */
  const startDrag = (e: React.DragEvent<HTMLDivElement>, project: { id: string; status: ProjectStatus }) => {
    setDragging({ id: project.id, fromStatus: project.status })
    const card = e.currentTarget
    const ghost = card.cloneNode(true) as HTMLDivElement
    const r = card.getBoundingClientRect()
    Object.assign(ghost.style, {
      position: 'fixed', top: '-1000px', left: '-1000px', width: `${r.width}px`,
      transform: 'rotate(3deg) scale(1.04)', boxShadow: '0 18px 40px rgba(0,0,0,0.18)', pointerEvents: 'none',
    })
    document.body.appendChild(ghost)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setDragImage(ghost, e.clientX - r.left, e.clientY - r.top)
    setTimeout(() => ghost.remove(), 0)
  }

  const handleDrop = async (toStatus: ProjectStatus) => {
    setOver(null)
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
        const cards = shown.filter((p) => col.statuses.includes(p.status))
        const fromHere = !!dragging && col.statuses.includes(dragging.fromStatus)
        const isOver = over === col.dropTarget && !!dragging && !fromHere
        // Completed column reads as an archive: most recent completion on top.
        // (client_approved is terminal, so updated_at is the completion moment.
        // Other columns keep the API's created_at ordering.)
        if (col.dropTarget === 'client_approved') {
          cards.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        }
        return (
          <div
            key={col.dropTarget}
            className={cn('flex-shrink-0 w-60 flex flex-col rounded-2xl p-1.5 -m-1.5 transition-colors duration-150',
              isOver && 'bg-primary/5 ring-2 ring-primary/30')}
            onDragOver={(e) => { e.preventDefault(); if (over !== col.dropTarget) setOver(col.dropTarget) }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o === col.dropTarget ? null : o)) }}
            onDrop={() => handleDrop(col.dropTarget)}
          >
            <div className="flex items-center justify-between mb-2.5 px-1">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{col.label}</h3>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-medium">{cards.length}</span>
            </div>
            <div className="space-y-2 min-h-16">
              {isOver && (
                <div className="h-16 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 motion-safe:animate-scale-in" aria-hidden />
              )}
              {cards.map((project) => (
                <div
                  key={project.id}
                  draggable
                  onDragStart={(e) => startDrag(e, project)}
                  onDragEnd={() => { setDragging(null); setOver(null) }}
                  className={cn('clay-card p-3.5 cursor-grab active:cursor-grabbing hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5',
                    dragging?.id === project.id && 'opacity-30 scale-[0.97]',
                    landed === project.id && 'motion-safe:animate-spring-pop ring-2 ring-primary/40')}
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
              {cards.length === 0 && !isOver && (
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
