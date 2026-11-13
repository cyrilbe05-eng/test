import { Link } from 'react-router-dom'
import { ClientMark, StatusDot } from '@/components/ds'
import { statusLabel } from '@/lib/dsStatus'
import { projectTimeLabel } from '@/lib/utils'
import type { BoardProject } from '@/lib/board'

// The Projects list view (admin and editors): 52px rows; a row opens the project.

export function ProjectList({ projects, base, mine }: { projects: BoardProject[]; base: string; mine?: (p: BoardProject) => boolean }) {
  const cols = 'minmax(220px,2.4fr) minmax(150px,1.4fr) minmax(150px,1.3fr) minmax(150px,1.3fr) 150px'
  return (
    <div style={{ padding: '4px 16px 40px', overflowX: 'auto' }}>
      <div style={{ minWidth: 760, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 16, padding: '0 20px 10px', fontSize: 12.5, color: 'var(--faint)' }}>
          <span>Project</span><span>Client</span><span>Status</span><span>Editor</span><span style={{ textAlign: 'right' }}>Updated</span>
        </div>
        {projects.map((p, i) => {
          const client = p.profiles?.full_name ?? '—'
          return (
            <Link key={p.id} to={`${base}/${p.id}`} className="ds-lrow" style={{ gridTemplateColumns: cols, animationDelay: `${Math.min(i, 20) * 35}ms` }}>
              <span className="truncate" style={{ fontWeight: 600, color: 'var(--strong)' }}>{p.title}{mine?.(p) && <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 500, color: 'var(--faint)' }}>Mine</span>}</span>
              <span className="flex items-center gap-2 min-w-0" style={{ color: 'var(--ds-muted)' }}><ClientMark name={client} size={18} /><span className="truncate">{client}</span></span>
              <span className="flex items-center gap-2" style={{ color: 'var(--soft-text)' }}><StatusDot status={p.status} size={7} />{statusLabel(p.status)}</span>
              <span className="truncate" style={{ color: p.assigned_team_names ? 'var(--soft-text)' : 'var(--faint)' }}>{p.assigned_team_names || 'Unassigned'}</span>
              <span className="truncate" style={{ textAlign: 'right', fontSize: 12.5, color: 'var(--faint)' }}>{projectTimeLabel(p)}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

