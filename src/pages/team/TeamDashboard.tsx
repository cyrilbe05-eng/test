import { useState } from 'react'
import { useProjects } from '@/hooks/useProjects'
import { TeamLayout } from '@/components/workspace/TeamLayout'
import { FrameTools } from '@/components/ds/Frame'
import { KanbanBoard } from '@/components/admin/KanbanBoard'
import { ProjectList } from '@/components/admin/ProjectList'
import { ProjectSearch } from '@/components/admin/ProjectSearch'
import { cn, sortByRecentActivity } from '@/lib/utils'
import type { BoardProject } from '@/lib/board'

// Editors' "All projects": the same board and list as the admin Projects page
// (DESIGN.md), read-only (editors don't move cards), opening the editor's
// project page. Their own projects are marked "Mine".

type View = 'kanban' | 'list'
type Row = BoardProject & { is_assigned?: boolean }

export default function TeamDashboard() {
  const { data: projects, isLoading } = useProjects()
  const [view, setView] = useState<View>('kanban')

  const all = (projects ?? []) as Row[]
  const assignedCount = all.filter((p) => p.is_assigned).length
  const mine = (p: BoardProject) => !!(p as Row).is_assigned

  return (
    <TeamLayout bare>
      <main className="flex flex-col min-w-0">
        <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '22px 28px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginRight: 8 }}>
            <h1 style={{ margin: 0 }}>All Projects</h1>
            <span style={{ fontSize: 14, color: 'var(--faint)' }}>{all.length} · {assignedCount} assigned to you</span>
          </div>
          <div className="ds-seg" role="group" aria-label="View">
            <div className="ds-seg-ind" style={{ transform: `translateX(${view === 'kanban' ? 0 : 76}px)` }} />
            <button type="button" className={cn(view === 'kanban' && 'on')} aria-pressed={view === 'kanban'} onClick={() => setView('kanban')}>Board</button>
            <button type="button" className={cn(view === 'list' && 'on')} aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
          </div>
          <div style={{ flex: 1 }} />
          <ProjectSearch base="/team/projects" />
          <div className="hidden md:block"><FrameTools /></div>
        </header>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--ds-accent)', borderTopColor: 'transparent' }} /></div>
        ) : all.length === 0 ? (
          <p className="ds-empty" style={{ padding: '40px 28px' }}>No projects yet. Check back soon!</p>
        ) : view === 'kanban' ? (
          <KanbanBoard projects={all} base="/team/projects" readOnly mine={mine} />
        ) : (
          <ProjectList projects={sortByRecentActivity(all) as BoardProject[]} base="/team/projects" mine={mine} />
        )}
      </main>
    </TeamLayout>
  )
}
