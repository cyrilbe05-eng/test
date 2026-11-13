import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useProjects } from '@/hooks/useProjects'
import { cn } from '@/lib/utils'
import { searchProjects, type SearchRow as Row } from '@/lib/projectSearch'
import { statusLabel } from '@/lib/dsStatus'
import { ClientMark, StatusDot } from '@/components/ds'

// Projects page: find any project by its name, the client, or the editor.
// Uses the project list admin pages already load, so results are instant.

const SearchIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" /></svg>
)

function Results({ results, active, onPick, onHover }: { results: Row[]; active: number; onPick: (p: Row) => void; onHover: (i: number) => void }) {
  if (!results.length) return <p style={{ padding: '14px 16px', fontSize: 13.5, color: 'var(--faint)' }}>No projects</p>
  return (
    <ul role="listbox" style={{ padding: 4, margin: 0, listStyle: 'none' }}>
      {results.map((p, i) => (
        <li key={p.id} role="option" aria-selected={i === active}>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onPick(p) }}
            onMouseEnter={() => onHover(i)}
            className={cn('ds-opt', i === active && 'on')}
            style={{ borderRadius: 10 }}
          >
            <ClientMark name={p.profiles?.full_name ?? '?'} />
            <span className="flex-1 min-w-0">
              <span className="block truncate" style={{ fontWeight: 600, color: 'var(--strong)' }}>{p.title}</span>
              <span className="block truncate" style={{ fontSize: 12, color: 'var(--ds-muted)' }}>
                {[p.profiles?.full_name, p.assigned_team_names].filter(Boolean).join(' · ') || '—'}
              </span>
            </span>
            <span className="flex items-center gap-2 whitespace-nowrap" style={{ fontSize: 12, color: 'var(--soft-text)' }}>
              <StatusDot status={p.status} size={7} />
              {statusLabel(p.status)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function ProjectSearch({ base = '/admin/projects' }: { base?: string } = {}) {
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
    navigate(`${base}/${p.id}`)
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); pick(results[active]) }
    else if (e.key === 'Escape') { setQ(''); setOpen(false); setMobile(false); (e.target as HTMLInputElement).blur() }
  }

  return (
    <>
      {/* Desktop / tablet: the search field (230px, 300px while typing) */}
      <div className="relative hidden md:block">
        <label className="ds-find">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" /></svg>
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
          />
        </label>
        {open && q.trim() && (
          <div className="ds-pop absolute right-0 top-full mt-2 z-50" style={{ width: 380, animation: 'ds-fade .3s var(--out) both' }}>
            <Results results={results} active={active} onPick={pick} onHover={setActive} />
          </div>
        )}
      </div>

      {/* Phone: an icon that opens a full-width search */}
      <span className="md:hidden">
        <button type="button" onClick={() => setMobile(true)} aria-label="Search projects" className="ds-ibtn" style={{ width: 44, height: 44 }}>
          <SearchIcon className="w-5 h-5" />
        </button>
      </span>
      {/* Rendered at the top of the page: the top bar's blur would otherwise
          confine a full-screen layer to the bar itself. */}
      {mobile && createPortal(
        <div className="ds md:hidden fixed inset-0 z-[70] flex flex-col">
          <div className="flex items-center gap-2 px-3 h-14" style={{ borderBottom: '1px solid var(--line)' }}>
            <label className="ds-find flex-1" style={{ width: 'auto' }}>
              <SearchIcon className="w-4 h-4" />
              <input ref={mobileInput} type="search" aria-label="Search projects" placeholder="Search projects"
                value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown} />
            </label>
            <button type="button" onClick={() => { setMobile(false); setQ('') }} style={{ minHeight: 44, padding: '0 10px', fontSize: 13.5, color: 'var(--ds-muted)' }}>Cancel</button>
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
