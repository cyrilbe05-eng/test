import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { ProjectStatusBadge } from './ProjectStatusBadge'
import type { Project } from '@/types'

interface Props {
  project: Project & { profiles?: { full_name: string; avatar_url: string | null } }
  href: string
  showClient?: boolean
}

export function ProjectCard({ project, href, showClient = false }: Props) {
  return (
    <Link
      to={href}
      className="block clay-card p-5 hover:shadow-lg transition-all duration-200 group hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors text-sm">
            {project.title}
          </h3>
          {showClient && project.profiles && (
            <p className="text-xs text-muted-foreground mt-0.5">{project.profiles.full_name}</p>
          )}
          {project.inspiration_url && (
            <p className="text-xs text-primary/70 mt-1.5 truncate leading-relaxed">🎬 {project.inspiration_url}</p>
          )}
        </div>
        <ProjectStatusBadge status={project.status} />
      </div>

      <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}</span>
        {project.max_client_revisions !== -1 && (
          <span className="tabular-nums bg-muted px-2 py-0.5 rounded-full">
            {project.max_client_revisions - project.client_revision_count} rev left
          </span>
        )}
      </div>
    </Link>
  )
}
