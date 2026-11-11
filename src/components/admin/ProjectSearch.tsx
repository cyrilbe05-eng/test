import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useProjects } from '@/hooks/useProjects'
import { ProjectStatusBadge } from '@/components/project/ProjectStatusBadge'
import { cn } from '@/lib/utils'
import { searchProjects, type SearchRow as Row } from '@/lib/projectSearch'

// Admin top bar: find any project by its name, the client, or the editor.
// Uses the project list admin pages already load, so results are instant.

const SearchIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" /></svg>
)

function Results({ results, active, onPick, onHover }: { results: Row[]; active: number; onPick: (p: Row) => void; onHover: (i: number) => void }) {
  if (!results.length) return <p className="px-4 py-3 text-sm text-muted-foreground">No projects</p>
  return (
    <ul role="listbox" className="py-1">
      {results.map((p, i) => (
        <li key={p.id} role="option" aria-selected={i === active}>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onPick(p) }}
            onMouseEnter={() => onHover(i)}
            className={cn('w-full min-h-[48px] px-4 py-2 flex items-center gap-3 text-left', i === active && 'bg-muted')}
          >
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium truncate">{p.title}</span>
              <span className="block text-xs text-muted-foreground truncate">
                {[p.profiles?.full_name, p.assigned_team_names].filter(Boolean).join(' · ') || '—'}
              </span>
            </span>
            <ProjectStatusBadge status={p.status} />
          </button>
        </li>
      ))}
    </ul>
  )
}

export function ProjectSearch() {
  const { data } = useProjects()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const mobileInput = useRef<HTMLInputElement>(null)
  const results = useMemo(() => searchProjects((data ?? []) as Row[], q), [data, q])

  useEffect(() => setActive(0), [q])
  // "/" or Ctrl/Cmd+K jumps to the search from anywhere in the admin.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        if (window.matchMedia('(min-width: 768px)').matches) input.current?.focus()
        else setMobile(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { if (mobile) setTimeout(() => mobileInput.current?.focus(), 0) }, [mobile])

  const pick = (p: Row) => {
    setQ(''); setOpen(false); setMobile(false)
    input.current?.blur()
    navigate(`/admin/projects/${p.id}`)
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); pick(results[active]) }
    else if (e.key === 'Escape') { setQ(''); setOpen(false); setMobile(false); (e.target as HTMLInputElement).blur() }
  }
  const field = 'w-full h-10 pl-9 pr-3 rounded-xl bg-muted border border-transparent text-sm placeholder:text-muted-foreground focus:outline-none focus:border-border focus:bg-background'

  return (
    <>
      {/* Desktop / tablet: a field in the top bar */}
      <div className="relative hidden md:block w-full max-w-md">
        <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          ref={input}
          type="search"
          aria-label="Search projects"
          placeholder="Search projects"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className={field}
        />
        {open && q.trim() && (
          <div className="absolute left-0 right-0 top-full mt-1.5 rounded-xl border border-border bg-card shadow-xl overflow-hidden z-50">
            <Results results={results} active={active} onPick={pick} onHover={setActive} />
          </div>
        )}
      </div>

      {/* Phone: an icon that opens a full-width search */}
      <button onClick={() => setMobile(true)} aria-label="Search projects"
        className="md:hidden w-10 h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted">
        <SearchIcon className="w-5 h-5" />
      </button>
      {/* Rendered at the top of the page: the top bar's blur would otherwise
          confine a full-screen layer to the bar itself. */}
      {mobile && createPortal(
        <div className="md:hidden fixed inset-0 z-[70] bg-background flex flex-col">
          <div className="flex items-center gap-2 px-3 h-14 border-b border-border">
            <div className="relative flex-1">
              <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input ref={mobileInput} type="search" aria-label="Search projects" placeholder="Search projects"
                value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown} className={field} />
            </div>
            <button onClick={() => { setMobile(false); setQ('') }} className="min-h-[44px] px-3 text-sm text-muted-foreground">Cancel</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {q.trim() && <Results results={results} active={active} onPick={pick} onHover={setActive} />}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
