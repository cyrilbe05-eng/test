import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useUpdateProjectStatus } from '@/hooks/useProjects'
import { cn, projectTimeLabel } from '@/lib/utils'
import type { ProjectStatus } from '@/types'
import { isBackward } from '@/lib/statusFlow'
import { COLUMNS, columnLabel, type BoardProject } from '@/lib/board'
import { ClientMark, EditorAvatar, StatusDot } from '@/components/ds'

// Admins can move a card to ANY column. Backwards (an earlier stage outside
// the normal flow) asks first, and the API sends no notifications for it.

interface Props {
  projects: BoardProject[]
}

/** Card tilt toward the cursor (max ±3.5°) + the sheen position, written to
 *  CSS variables once per frame — never React state. */
function tilt(e: React.MouseEvent<HTMLElement>) {
  const el = e.currentTarget as HTMLElement & { __raf?: number }
  const cx = e.clientX, cy = e.clientY
  if (el.__raf) return
  el.__raf = requestAnimationFrame(() => {
    el.__raf = 0
    const r = el.getBoundingClientRect()
    const px = (cx - r.left) / r.width, py = (cy - r.top) / r.height
    el.style.setProperty('--ry', `${((px - 0.5) * 7).toFixed(2)}deg`)
    el.style.setProperty('--rx', `${((0.5 - py) * 7).toFixed(2)}deg`)
    el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`)
    el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`)
  })
}
function untilt(e: React.MouseEvent<HTMLElement>) {
  const el = e.currentTarget as HTMLElement & { __raf?: number }
  if (el.__raf) { cancelAnimationFrame(el.__raf); el.__raf = 0 }
  el.style.setProperty('--rx', '0deg')
  el.style.setProperty('--ry', '0deg')
}

export function KanbanBoard({ projects }: Props) {
  const [dragging, setDragging] = useState<{ id: string; fromStatus: ProjectStatus } | null>(null)
  const [back, setBack] = useState<{ id: string; to: ProjectStatus; title: string } | null>(null)
  const [over, setOver] = useState<ProjectStatus | null>(null)
  // Moves show at once (the card replays its rise) while the API catches up;
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
    setTimeout(() => setLanded((l) => (l === id ? null : l)), 800)
    try {
      await updateStatus.mutateAsync({ id, status: toStatus })
      toast.success('Status updated')
    } catch (err) {
      setMoved((m) => { const n = { ...m }; delete n[id]; return n })
      toast.error((err as Error).message)
    }
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
        <>
          <div className="ds-veil" onClick={() => setBack(null)} />
          <div role="dialog" aria-modal="true" aria-label="Move back" className="ds-sheet" style={{ width: 'min(380px, calc(100vw - 32px))' }}>
            <div className="ds-sheet-in" style={{ padding: '22px 22px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <p style={{ margin: 0, fontSize: 17, fontWeight: 650, letterSpacing: '-.02em', color: 'var(--strong)' }}>Move back to {columnLabel(back.to)}?</p>
                <p className="truncate" style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--ds-muted)' }}>{back.title}</p>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="ds-ghost-btn" onClick={() => setBack(null)}>Cancel</button>
                <button type="button" className="ds-primary" onClick={() => { const b = back; setBack(null); void move(b.id, b.to) }}>Move back</button>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="ds-lanes" style={{ padding: '4px 20px 40px' }}>
        {COLUMNS.map((col, li) => {
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
            <section
              key={col.dropTarget}
              aria-label={col.label}
              className={cn('ds-lane', isOver && 'over')}
              onDragOver={(e) => { e.preventDefault(); if (over !== col.dropTarget) setOver(col.dropTarget) }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o === col.dropTarget ? null : o)) }}
              onDrop={() => handleDrop(col.dropTarget)}
            >
              <div className="ds-lane-head" style={{ animationDelay: `${li * 60}ms` }}>
                <StatusDot status={col.dropTarget} />
                <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--strong)' }}>{col.label}</h2>
                <span style={{ fontSize: 12.5, color: 'var(--faint)', padding: '1px 7px', borderRadius: 999, background: 'var(--pill)' }}>{cards.length}</span>
              </div>

              {cards.map((project, i) => {
                const client = project.profiles?.full_name ?? '—'
                const editors = project.assigned_team_names ?? ''
                const first = editors.split(',')[0]?.trim()
                return (
                  <article
                    key={project.id}
                    className={cn('ds-card', dragging?.id === project.id && 'ghost', landed === project.id && 'landed')}
                    style={{ animationDelay: landed === project.id ? '0ms' : `${li * 60 + Math.min(i, 10) * 55 + 80}ms` }}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move'
                      try { e.dataTransfer.setData('text/plain', project.id) } catch { /* old browsers */ }
                      setDragging({ id: project.id, fromStatus: project.status })
                    }}
                    onDragEnd={() => { setDragging(null); setOver(null) }}
                    onMouseMove={tilt}
                    onMouseLeave={untilt}
                  >
                    <Link to={`/admin/projects/${project.id}`} className="ds-hit" aria-label={`Open ${project.title}`} draggable={false} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ClientMark name={client} />
                      <span className="truncate" style={{ flex: 1, fontSize: 12.5, color: 'var(--ds-muted)' }}>{client}</span>
                      {project.kind === 'carousel' && (
                        <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--car-t)', padding: '3px 8px', borderRadius: 999, background: 'var(--car-b)' }}>Carousel</span>
                      )}
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3, letterSpacing: '-.015em', color: 'var(--strong)' }}>{project.title}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <EditorAvatar name={first || null} />
                      <span className="truncate" style={{ flex: 1, fontSize: 12.5, color: first ? 'var(--soft-text)' : 'var(--faint)' }}>{first ? editors : 'Unassigned'}</span>
                      <span className="whitespace-nowrap" style={{ fontSize: 12, color: 'var(--faint)' }}>{projectTimeLabel(project)}</span>
                    </div>
                  </article>
                )
              })}

              {cards.length === 0 && <div className="ds-slot">Drop a project here</div>}
            </section>
          )
        })}
      </div>
    </>
  )
}
