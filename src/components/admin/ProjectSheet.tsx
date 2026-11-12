import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { useTheme } from '@/lib/theme'
import { statusColor, statusLabel } from '@/lib/dsStatus'
import { ClientMark, EditorAvatar, StatusDot } from '@/components/ds'
import type { Project, ProjectStatus } from '@/types'
import type { SheetOrigin } from '@/lib/board'

export type SheetProject = Project & { profiles?: { full_name: string } | null; assigned_team_names?: string | null }

// Quick look at a project (DESIGN.md §6 "Modal / detail sheet"). Grows out of
// the clicked card; its main action opens the full project page.

export function ProjectSheet({ project, origin, steps, onClose }: {
  project: SheetProject
  origin: SheetOrigin
  /** The board's stages, in order, to place this project on the track. */
  steps: ProjectStatus[][]
  onClose: () => void
}) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const navigate = useNavigate()
  const [closing, setClosing] = useState(false)
  const close = () => { if (closing) return; setClosing(true); setTimeout(onClose, 240) }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const client = project.profiles?.full_name ?? '—'
  const color = statusColor(project.status, dark)
  const step = Math.max(0, steps.findIndex((g) => g.includes(project.status))) + 1
  const editors = (project.assigned_team_names ?? '').split(',').map((n) => n.trim()).filter(Boolean)

  return (
    <>
      <div className={'ds-veil' + (closing ? ' closing' : '')} onClick={close} />
      <section
        className={'ds-sheet' + (closing ? ' closing' : '')}
        role="dialog" aria-modal="true" aria-label={project.title}
        style={{ '--dx': `${origin.dx}px`, '--dy': `${origin.dy}px`, '--s': origin.s } as React.CSSProperties}
      >
        <div className="ds-sheet-in" style={{ padding: '26px 28px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ClientMark name={client} size={26} />
            <span style={{ flex: 1, fontSize: 13.5, color: 'var(--muted)' }}>{client}</span>
            <button type="button" className="ds-ibtn" aria-label="Close" onClick={close} style={{ width: 32, height: 32 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 650, letterSpacing: '-.03em', lineHeight: 1.15, color: 'var(--strong)' }}>{project.title}</h2>
            <span style={{ fontSize: 13.5, color: 'var(--faint)' }}>
              Updated {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}{project.kind === 'carousel' ? ' · Carousel' : ''}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 18, borderRadius: 16, background: 'var(--panel)', boxShadow: 'inset 0 0 0 1px var(--panel-ring)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <StatusDot color={color} />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{statusLabel(project.status)}</span>
              <span style={{ fontSize: 12.5, color: 'var(--faint)' }}>Step {step} of {steps.length}</span>
            </div>
            <div className="ds-track"><i style={{ width: `${(step / steps.length) * 100}%`, background: color }} /></div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={{ fontSize: 12.5, color: 'var(--faint)' }}>Editor</span>
            {editors.length ? editors.map((n) => (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <EditorAvatar name={n} size={32} />
                <span style={{ fontSize: 14.5, fontWeight: 500 }}>{n}</span>
              </div>
            )) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <EditorAvatar name={null} size={32} />
                <span style={{ fontSize: 14.5, color: 'var(--faint)' }}>Unassigned</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" className="ds-ghost-btn" onClick={close}>Close</button>
            <button type="button" className="ds-primary" onClick={() => navigate(`/admin/projects/${project.id}`)}>
              Open project
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </div>
        </div>
      </section>
    </>
  )
}
