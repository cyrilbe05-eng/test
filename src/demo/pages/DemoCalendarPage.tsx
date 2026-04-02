import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, addWeeks, subWeeks, addDays, subDays,
  isSameMonth, isToday, eachDayOfInterval,
  parseISO,
} from 'date-fns'
import { toast } from 'sonner'
import { useDemoAuth } from '../DemoAuthContext'
import {
  MOCK_PROJECTS, MOCK_ASSIGNMENTS, MOCK_PROFILES,
  getCalendarEventsForUser, addCalendarEvent, removeCalendarEvent,
  updateCalendarEventDate, updateCalendarEventTitle, updateCalendarEventColor, updateCalendarEventMeta,
  type CalendarEvent, type ContentType, type ContentStatus,
  _deadlinesStore, updateDeadlineDueAt, resolveDeadline,
} from '../mockData'
import { cn } from '@/lib/utils'
import { DemoEventCommentThread } from '../components/DemoEventCommentThread'

// ── Types ──────────────────────────────────────────────────────────────────────
type CalView = 'month' | 'week' | 'day'

// ── Color palette for manual events ───────────────────────────────────────────
const EVENT_COLORS = [
  { label: 'Indigo',  value: 'bg-indigo-500' },
  { label: 'Violet',  value: 'bg-violet-500' },
  { label: 'Pink',    value: 'bg-pink-500' },
  { label: 'Rose',    value: 'bg-rose-500' },
  { label: 'Amber',   value: 'bg-amber-500' },
  { label: 'Teal',    value: 'bg-teal-500' },
  { label: 'Cyan',    value: 'bg-cyan-500' },
  { label: 'Slate',   value: 'bg-slate-500' },
]

const CONTENT_TYPES: ContentType[] = ['Reel', 'Story', 'Carousel', 'Post']
const CONTENT_STATUSES: ContentStatus[] = ['Idea', 'Drafting', 'Scheduled']

const CONTENT_TYPE_STYLES: Record<ContentType, string> = {
  Reel:     'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  Story:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  Carousel: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  Post:     'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
}

const CONTENT_STATUS_STYLES: Record<ContentStatus, string> = {
  Idea:      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  Drafting:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  Scheduled: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toLocalDatetimeValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Create / Edit Event Modal ──────────────────────────────────────────────────
function CreateEventModal({
  initialDate,
  isAdmin,
  onSave,
  onClose,
}: {
  initialDate: string
  isAdmin: boolean
  onSave: (
    title: string, date: string, color: string,
    contentType: ContentType | null, contentStatus: ContentStatus | null,
    comments: string | null, doubleDown: boolean,
    inspirationUrl: string | null, script: string | null, caption: string | null,
    assignedClientIds: string[], assignedTeamIds: string[],
  ) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(initialDate)
  const [color, setColor] = useState(EVENT_COLORS[0].value)
  const [contentType, setContentType] = useState<ContentType | ''>('')
  const [contentStatus, setContentStatus] = useState<ContentStatus | ''>('')
  const [comments, setComments] = useState('')
  const [doubleDown, setDoubleDown] = useState(false)
  const [inspirationUrl, setInspirationUrl] = useState('')
  const [script, setScript] = useState('')
  const [caption, setCaption] = useState('')
  const [assignedClientIds, setAssignedClientIds] = useState<string[]>([])
  const [assignedTeamIds, setAssignedTeamIds] = useState<string[]>([])

  const clients = MOCK_PROFILES.filter((p) => p.role === 'client')
  const teamMembers = MOCK_PROFILES.filter((p) => p.role === 'team')

  function toggleId(ids: string[], setIds: (v: string[]) => void, id: string) {
    setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
  }

  function handleSave() {
    if (!title.trim()) { toast.error('Event title is required'); return }
    onSave(
      title.trim(), date, color,
      contentType || null, contentStatus || null,
      comments.trim() || null, doubleDown,
      inspirationUrl.trim() || null, script.trim() || null, caption.trim() || null,
      assignedClientIds, assignedTeamIds,
    )
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg pointer-events-auto animate-scale-in flex flex-col" style={{ maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
          <div className="px-5 pt-5 pb-3 border-b border-border flex items-center justify-between flex-shrink-0">
            <h3 className="font-heading font-semibold text-sm">New Content Event</h3>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Title</label>
              <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }} placeholder="e.g. D10 — UGC Hook Reel…" className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block">Color</label>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {EVENT_COLORS.map((c) => (
                    <button key={c.value} onClick={() => setColor(c.value)} className={cn('w-6 h-6 rounded-full transition-all', c.value, color === c.value ? 'ring-2 ring-offset-1 ring-primary scale-110' : 'opacity-60 hover:opacity-100')} title={c.label} />
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Content type</label>
                <select value={contentType} onChange={(e) => setContentType(e.target.value as ContentType | '')} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                  <option value="">None</option>
                  {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Status</label>
                <select value={contentStatus} onChange={(e) => setContentStatus(e.target.value as ContentStatus | '')} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                  <option value="">None</option>
                  {CONTENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div />
              <button onClick={() => setDoubleDown(!doubleDown)} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border', doubleDown ? 'bg-orange-500 text-white border-orange-500' : 'bg-muted text-muted-foreground border-border hover:border-orange-400 hover:text-orange-500')}>
                🔥 Double Down
              </button>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Inspiration URL</label>
              <input type="url" value={inspirationUrl} onChange={(e) => setInspirationUrl(e.target.value)} placeholder="https://www.instagram.com/p/…" className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Script</label>
              <textarea value={script} onChange={(e) => setScript(e.target.value)} placeholder="Write the script…" rows={4} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Caption</label>
              <textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Write the caption…" rows={2} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
            </div>
            {isAdmin && (
              <>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Assign clients</label>
                  <div className="flex flex-wrap gap-2">
                    {clients.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleId(assignedClientIds, setAssignedClientIds, c.id)}
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                          assignedClientIds.includes(c.id)
                            ? 'bg-teal-500 text-white border-teal-500'
                            : 'bg-muted text-muted-foreground border-border hover:border-teal-400 hover:text-teal-600',
                        )}
                      >
                        <span className="w-4 h-4 rounded-full bg-teal-200 text-teal-700 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                          {c.full_name.charAt(0)}
                        </span>
                        {c.full_name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Assign team members</label>
                  <div className="flex flex-wrap gap-2">
                    {teamMembers.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleId(assignedTeamIds, setAssignedTeamIds, m.id)}
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                          assignedTeamIds.includes(m.id)
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-muted text-muted-foreground border-border hover:border-blue-400 hover:text-blue-600',
                        )}
                      >
                        <span className="w-4 h-4 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                          {m.full_name.charAt(0)}
                        </span>
                        {m.full_name}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Notes</label>
              <textarea value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Additional notes…" rows={2} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
            </div>
          </div>
          <div className="px-5 pb-5 pt-3 border-t border-border flex gap-2 flex-shrink-0">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
            <button onClick={handleSave} className="flex-1 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:brightness-110 transition-all active:scale-[0.98]">Add Event</button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Event Chip ─────────────────────────────────────────────────────────────────
// Uses <div> instead of <button> so HTML5 drag works reliably across browsers
function EventChip({
  event,
  onClick,
  draggable: isDraggable,
}: {
  event: CalendarEvent
  onClick: () => void
  draggable?: boolean
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={isDraggable}
      onDragStart={isDraggable ? (e) => {
        e.stopPropagation()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', event.id)
        e.dataTransfer.setData('eventId', event.id)
      } : undefined}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
      className={cn(
        'w-full text-left text-[11px] font-medium px-1.5 py-0.5 rounded text-white transition-opacity hover:opacity-80 select-none flex items-center gap-1',
        event.color,
        isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
      )}
    >
      {event.double_down && <span className="text-[9px] leading-none flex-shrink-0">🔥</span>}
      {event.content_type && <span className="text-white/70 text-[9px] leading-none font-bold uppercase tracking-tight flex-shrink-0">{event.content_type.slice(0, 1)}</span>}
      <span className="truncate">{event.title}</span>
    </div>
  )
}

// ── Event Detail Modal ─────────────────────────────────────────────────────────
function EventModal({
  event,
  onClose,
  canEditDeadline,
  canEditManual,
  onDeadlineUpdate,
  onDeadlineResolve,
  onManualUpdate,
  onManualDelete,
  currentUserId,
  isAdmin,
}: {
  event: CalendarEvent
  onClose: () => void
  canEditDeadline: boolean
  canEditManual: boolean
  onDeadlineUpdate: (deadlineId: string, newDueAt: string) => void
  onDeadlineResolve: (deadlineId: string, status: 'met' | 'missed') => void
  onManualUpdate: (
    eventId: string, title: string, date: string, color: string,
    contentType: ContentType | null, contentStatus: ContentStatus | null,
    comments: string | null, doubleDown: boolean,
    inspirationUrl: string | null, script: string | null, caption: string | null,
    assignedClientIds: string[], assignedTeamIds: string[],
  ) => void
  onManualDelete: (eventId: string) => void
  currentUserId: string
  isAdmin: boolean
}) {
  const dl = event.deadline_id ? _deadlinesStore.find((d) => d.id === event.deadline_id) : null
  const [editingDeadline, setEditingDeadline] = useState(false)
  const [deadlineValue, setDeadlineValue] = useState(dl ? toLocalDatetimeValue(dl.due_at) : '')

  // All manual fields — always editable inline (no separate "editing" mode)
  const [manualTitle, setManualTitle] = useState(event.title)
  const [manualDate, setManualDate] = useState(event.date)
  const [manualColor, setManualColor] = useState(event.color)
  const [manualContentType, setManualContentType] = useState<ContentType | ''>(event.content_type ?? '')
  const [manualContentStatus, setManualContentStatus] = useState<ContentStatus | ''>(event.content_status ?? '')
  const [manualComments, setManualComments] = useState(event.comments ?? '')
  const [manualDoubleDown, setManualDoubleDown] = useState(event.double_down ?? false)
  const [manualInspirationUrl, setManualInspirationUrl] = useState(event.inspiration_url ?? '')
  const [manualScript, setManualScript] = useState(event.script ?? '')
  const [manualCaption, setManualCaption] = useState(event.caption ?? '')
  const [assignedClientIds, setAssignedClientIds] = useState<string[]>(event.assigned_client_ids ?? [])
  const [assignedTeamIds, setAssignedTeamIds] = useState<string[]>(event.assigned_team_ids ?? [])
  const [dirty, setDirty] = useState(false)

  const project = MOCK_PROJECTS.find((p) => p.id === event.project_id)
  const isManual = event.type === 'manual'

  const clients = MOCK_PROFILES.filter((p) => p.role === 'client')
  const teamMembers = MOCK_PROFILES.filter((p) => p.role === 'team')

  function markDirty<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setDirty(true) }
  }

  function toggleAssignment(ids: string[], setter: (v: string[]) => void, id: string) {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
    setter(next)
    setDirty(true)
  }

  function handleSaveManual() {
    if (!manualTitle.trim()) return
    onManualUpdate(
      event.id, manualTitle.trim(), manualDate, manualColor,
      manualContentType || null, manualContentStatus || null,
      manualComments.trim() || null, manualDoubleDown,
      manualInspirationUrl.trim() || null, manualScript.trim() || null, manualCaption.trim() || null,
      assignedClientIds, assignedTeamIds,
    )
    setDirty(false)
  }

  // Prop row used in the Notion-style property table
  function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <div className="flex min-h-[36px] border-b border-border/50 last:border-0">
        <div className="w-28 flex-shrink-0 flex items-start pt-2 pb-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
        </div>
        <div className="flex-1 flex items-start pt-1.5 pb-1 min-w-0">{children}</div>
      </div>
    )
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg pointer-events-auto animate-scale-in flex flex-col"
          style={{ maxHeight: '90vh' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Colored header ── */}
          <div className={cn('px-5 pt-5 pb-4 rounded-t-2xl flex-shrink-0', isManual ? manualColor : event.color)}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-white/70 uppercase tracking-wide font-semibold mb-1">
                  {isManual ? 'Content event' : event.type.replace(/_/g, ' ')}
                </p>
                {isManual && canEditManual ? (
                  <input
                    value={manualTitle}
                    onChange={(e) => markDirty(setManualTitle)(e.target.value)}
                    className="w-full bg-white/20 text-white placeholder:text-white/50 text-lg font-bold rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-white/50"
                  />
                ) : (
                  <p className="text-white font-bold text-lg leading-snug">{event.title}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {isManual && canEditManual && (
                  <button
                    onClick={() => { onManualDelete(event.id); onClose() }}
                    className="text-white/60 hover:text-white/90 transition-colors"
                    title="Delete event"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                )}
                <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
          </div>

          {/* ── Scrollable body ── */}
          <div className="flex-1 overflow-y-auto min-h-0">

            {/* ── Property table (manual events) ── */}
            {isManual && (
              <div className="px-5 pt-4 pb-2">
                <PropRow label="Status">
                  {canEditManual ? (
                    <select
                      value={manualContentStatus}
                      onChange={(e) => markDirty(setManualContentStatus)(e.target.value as ContentStatus | '')}
                      className="text-xs px-2 py-1 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="">Empty</option>
                      {CONTENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    manualContentStatus
                      ? <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', CONTENT_STATUS_STYLES[manualContentStatus as ContentStatus])}>{manualContentStatus}</span>
                      : <span className="text-xs text-muted-foreground">Empty</span>
                  )}
                </PropRow>

                <PropRow label="Content type">
                  {canEditManual ? (
                    <select
                      value={manualContentType}
                      onChange={(e) => markDirty(setManualContentType)(e.target.value as ContentType | '')}
                      className="text-xs px-2 py-1 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="">Empty</option>
                      {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  ) : (
                    manualContentType
                      ? <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', CONTENT_TYPE_STYLES[manualContentType as ContentType])}>{manualContentType}</span>
                      : <span className="text-xs text-muted-foreground">Empty</span>
                  )}
                </PropRow>

                <PropRow label="Date">
                  {canEditManual ? (
                    <input type="date" value={manualDate} onChange={(e) => markDirty(setManualDate)(e.target.value)} className="text-xs px-2 py-1 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                  ) : (
                    <span className="text-sm text-foreground">{format(parseISO(event.date), 'd MMM yyyy')}</span>
                  )}
                </PropRow>

                <PropRow label="Double Down">
                  {canEditManual ? (
                    <button
                      onClick={() => markDirty(setManualDoubleDown)(!manualDoubleDown)}
                      className={cn('flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border transition-all', manualDoubleDown ? 'bg-orange-500 text-white border-orange-500' : 'bg-muted text-muted-foreground border-border hover:border-orange-400 hover:text-orange-500')}
                    >
                      🔥 {manualDoubleDown ? 'Yes' : 'No'}
                    </button>
                  ) : (
                    <span className="text-sm">{manualDoubleDown ? '🔥 Yes' : '—'}</span>
                  )}
                </PropRow>

                {canEditManual && (
                  <PropRow label="Color">
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {EVENT_COLORS.map((c) => (
                        <button key={c.value} onClick={() => markDirty(setManualColor)(c.value)} className={cn('w-5 h-5 rounded-full transition-all', c.value, manualColor === c.value ? 'ring-2 ring-offset-1 ring-primary scale-110' : 'opacity-60 hover:opacity-100')} title={c.label} />
                      ))}
                    </div>
                  </PropRow>
                )}

                {/* ── Assign clients (admin only) ── */}
                {isAdmin && (
                  <PropRow label="Clients">
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {clients.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => toggleAssignment(assignedClientIds, setAssignedClientIds, c.id)}
                          className={cn(
                            'flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all',
                            assignedClientIds.includes(c.id)
                              ? 'bg-teal-500 text-white border-teal-500'
                              : 'bg-muted text-muted-foreground border-border hover:border-teal-400 hover:text-teal-600',
                          )}
                        >
                          <span className="w-3.5 h-3.5 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-[8px] font-bold flex-shrink-0">
                            {c.full_name.charAt(0)}
                          </span>
                          {c.full_name}
                        </button>
                      ))}
                    </div>
                  </PropRow>
                )}

                {/* ── Assign team members (admin only) ── */}
                {isAdmin && (
                  <PropRow label="Team">
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {teamMembers.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => toggleAssignment(assignedTeamIds, setAssignedTeamIds, m.id)}
                          className={cn(
                            'flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all',
                            assignedTeamIds.includes(m.id)
                              ? 'bg-blue-500 text-white border-blue-500'
                              : 'bg-muted text-muted-foreground border-border hover:border-blue-400 hover:text-blue-600',
                          )}
                        >
                          <span className="w-3.5 h-3.5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[8px] font-bold flex-shrink-0">
                            {m.full_name.charAt(0)}
                          </span>
                          {m.full_name}
                        </button>
                      ))}
                    </div>
                  </PropRow>
                )}
              </div>
            )}

            {/* ── Deadline info ── */}
            {dl && (
              <div className="px-5 pt-4 pb-2 space-y-3">
                {project && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">Project</p>
                    <Link to={`/admin/projects/${event.project_id}`} onClick={onClose} className="text-sm text-primary hover:underline font-medium">{project.title}</Link>
                  </div>
                )}
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">Status</p>
                  <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', dl.status === 'met' ? 'bg-green-100 text-green-700' : dl.status === 'missed' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700')}>
                    {dl.status === 'met' ? '✓ Met' : dl.status === 'missed' ? '✗ Missed' : '⏰ Pending'}
                  </span>
                </div>
                {canEditDeadline && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Due at</p>
                    {editingDeadline ? (
                      <div className="flex items-center gap-2">
                        <input type="datetime-local" value={deadlineValue} onChange={(e) => setDeadlineValue(e.target.value)} className="flex-1 text-xs px-2 py-1.5 border border-border rounded-lg bg-input focus:outline-none focus:ring-1 focus:ring-primary" />
                        <button onClick={() => { onDeadlineUpdate(dl.id, new Date(deadlineValue).toISOString()); setEditingDeadline(false) }} className="text-xs bg-primary text-white px-2.5 py-1.5 rounded-lg hover:bg-primary/90 transition-colors">Save</button>
                        <button onClick={() => setEditingDeadline(false)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
                      </div>
                    ) : (
                      <button onClick={() => setEditingDeadline(true)} className="text-sm text-foreground hover:text-primary transition-colors flex items-center gap-1.5">
                        {format(parseISO(dl.due_at), 'd MMM yyyy, HH:mm')}
                        <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                    )}
                  </div>
                )}
                {canEditDeadline && dl.status === 'pending' && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Mark as</p>
                    <div className="flex gap-2">
                      <button onClick={() => { onDeadlineResolve(dl.id, 'met'); onClose() }} className="flex-1 text-xs bg-green-500 text-white py-1.5 rounded-lg hover:bg-green-600 transition-colors font-medium">✓ Met</button>
                      <button onClick={() => { onDeadlineResolve(dl.id, 'missed'); onClose() }} className="flex-1 text-xs bg-red-500 text-white py-1.5 rounded-lg hover:bg-red-600 transition-colors font-medium">✗ Missed</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Comments section (Notion-style inline) ── */}
            <div className="px-5 pt-3 pb-1">
              <p className="text-xs font-semibold text-foreground mb-2">Comments</p>
              {isManual && canEditManual && (
                <div className="mb-3">
                  <textarea
                    value={manualComments}
                    onChange={(e) => markDirty(setManualComments)(e.target.value)}
                    placeholder="Add a note…"
                    rows={2}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-muted/50 text-xs focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                </div>
              )}
              {!canEditManual && event.comments && (
                <p className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2 mb-3">{event.comments}</p>
              )}
            </div>

            {/* ── Thread ── */}
            <div style={{ minHeight: '180px' }}>
              <DemoEventCommentThread eventId={event.id} currentUserId={currentUserId} isAdmin={isAdmin} />
            </div>

            {/* ── Content property table (Notion rows: Inspiration / Script / Caption) ── */}
            {isManual && (
              <div className="border-t border-border">
                {/* Inspiration */}
                <div className="flex border-b border-border/50">
                  <div className="w-28 flex-shrink-0 px-5 py-2.5 flex items-start">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Inspiration</span>
                  </div>
                  <div className="flex-1 px-3 py-2 min-w-0">
                    {canEditManual ? (
                      <input
                        type="url"
                        value={manualInspirationUrl}
                        onChange={(e) => markDirty(setManualInspirationUrl)(e.target.value)}
                        placeholder="https://…"
                        className="w-full text-xs text-primary bg-transparent focus:outline-none placeholder:text-muted-foreground"
                      />
                    ) : (
                      event.inspiration_url
                        ? <a href={event.inspiration_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate block">{event.inspiration_url}</a>
                        : <span className="text-xs text-muted-foreground">Empty</span>
                    )}
                  </div>
                </div>

                {/* Script */}
                <div className="flex border-b border-border/50">
                  <div className="w-28 flex-shrink-0 px-5 py-2.5 flex items-start">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Script</span>
                  </div>
                  <div className="flex-1 px-3 py-2 min-w-0">
                    {canEditManual ? (
                      <textarea
                        value={manualScript}
                        onChange={(e) => markDirty(setManualScript)(e.target.value)}
                        placeholder="Write the script…"
                        rows={4}
                        className="w-full text-xs bg-transparent focus:outline-none resize-none placeholder:text-muted-foreground leading-relaxed"
                      />
                    ) : (
                      event.script
                        ? <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{event.script}</p>
                        : <span className="text-xs text-muted-foreground">Empty</span>
                    )}
                  </div>
                </div>

                {/* Caption */}
                <div className="flex">
                  <div className="w-28 flex-shrink-0 px-5 py-2.5 flex items-start">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Caption</span>
                  </div>
                  <div className="flex-1 px-3 py-2 min-w-0">
                    {canEditManual ? (
                      <textarea
                        value={manualCaption}
                        onChange={(e) => markDirty(setManualCaption)(e.target.value)}
                        placeholder="Write the caption…"
                        rows={2}
                        className="w-full text-xs bg-transparent focus:outline-none resize-none placeholder:text-muted-foreground leading-relaxed"
                      />
                    ) : (
                      event.caption
                        ? <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{event.caption}</p>
                        : <span className="text-xs text-muted-foreground">Empty</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Footer: save bar (only when dirty) ── */}
          {isManual && canEditManual && dirty && (
            <div className="px-5 py-3 border-t border-border flex gap-2 flex-shrink-0">
              <button
                onClick={handleSaveManual}
                className="flex-1 text-xs bg-primary text-white py-2 rounded-lg hover:bg-primary/90 transition-colors font-semibold"
              >
                Save changes
              </button>
              <button
                onClick={() => {
                  setManualTitle(event.title)
                  setManualDate(event.date)
                  setManualColor(event.color)
                  setManualContentType(event.content_type ?? '')
                  setManualContentStatus(event.content_status ?? '')
                  setManualComments(event.comments ?? '')
                  setManualDoubleDown(event.double_down ?? false)
                  setManualInspirationUrl(event.inspiration_url ?? '')
                  setManualScript(event.script ?? '')
                  setManualCaption(event.caption ?? '')
                  setAssignedClientIds(event.assigned_client_ids ?? [])
                  setAssignedTeamIds(event.assigned_team_ids ?? [])
                  setDirty(false)
                }}
                className="px-4 text-xs border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Discard
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Day cell (shared) ──────────────────────────────────────────────────────────
function DayCell({
  day,
  inMonth,
  events,
  onEventClick,
  onDayClick,
  onDrop,
  maxChips = 3,
}: {
  day: Date
  inMonth: boolean
  events: CalendarEvent[]
  onEventClick: (e: CalendarEvent) => void
  onDayClick: (dateStr: string) => void
  onDrop: (dateStr: string, eventId: string) => void
  maxChips?: number
}) {
  const [dragOver, setDragOver] = useState(false)
  const justDropped = useState(false)
  const dateStr = format(day, 'yyyy-MM-dd')

  return (
    <div
      className={cn(
        'border-b border-r border-border px-1.5 py-1.5 flex flex-col min-h-0 overflow-hidden cursor-pointer group transition-colors',
        !inMonth && 'bg-muted/20',
        dragOver && 'bg-primary/8 ring-inset ring-1 ring-primary',
      )}
      onClick={() => { if (justDropped[0]) { justDropped[1](false); return } onDayClick(dateStr) }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(true) }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false) }}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const id = e.dataTransfer.getData('eventId') || e.dataTransfer.getData('text/plain')
        if (id) { justDropped[1](true); onDrop(dateStr, id) }
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={cn(
          'text-xs font-medium self-start w-6 h-6 flex items-center justify-center rounded-full',
          isToday(day) ? 'bg-primary text-white' : inMonth ? 'text-foreground' : 'text-muted-foreground/50',
        )}>
          {format(day, 'd')}
        </span>
        {/* + button on hover */}
        <span className="opacity-0 group-hover:opacity-100 text-[10px] text-muted-foreground leading-none transition-opacity">+</span>
      </div>
      <div className="space-y-0.5 overflow-hidden">
        {events.slice(0, maxChips).map((ev) => (
          <EventChip
            key={ev.id}
            event={ev}
            onClick={() => onEventClick(ev)}
            draggable={ev.type === 'manual'}
          />
        ))}
        {events.length > maxChips && (
          <p className="text-[10px] text-muted-foreground px-1">+{events.length - maxChips} more</p>
        )}
      </div>
    </div>
  )
}

// ── Month View ─────────────────────────────────────────────────────────────────
function MonthView({
  currentDate, events, onEventClick, onDayClick, onDrop,
}: {
  currentDate: Date
  events: CalendarEvent[]
  onEventClick: (e: CalendarEvent) => void
  onDayClick: (dateStr: string) => void
  onDrop: (dateStr: string, eventId: string) => void
}) {
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 flex-1" style={{ gridAutoRows: 'minmax(100px, 1fr)' }}>
        {days.map((day) => {
          const dayEvents = events.filter((e) => e.date === format(day, 'yyyy-MM-dd'))
          return (
            <DayCell
              key={day.toISOString()}
              day={day}
              inMonth={isSameMonth(day, currentDate)}
              events={dayEvents}
              onEventClick={onEventClick}
              onDayClick={onDayClick}
              onDrop={onDrop}
            />
          )
        })}
      </div>
    </div>
  )
}

// ── Week View ──────────────────────────────────────────────────────────────────
function WeekView({
  currentDate, events, onEventClick, onDayClick, onDrop,
}: {
  currentDate: Date
  events: CalendarEvent[]
  onEventClick: (e: CalendarEvent) => void
  onDayClick: (dateStr: string) => void
  onDrop: (dateStr: string, eventId: string) => void
}) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="grid grid-cols-7 border-b border-border">
        {days.map((day) => (
          <div key={day.toISOString()} className="py-3 text-center border-r border-border last:border-r-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{format(day, 'EEE')}</p>
            <span className={cn('text-lg font-semibold mt-0.5 w-9 h-9 flex items-center justify-center rounded-full mx-auto', isToday(day) ? 'bg-primary text-white' : 'text-foreground')}>
              {format(day, 'd')}
            </span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 flex-1 overflow-y-auto">
        {days.map((day) => {
          const dayEvents = events.filter((e) => e.date === format(day, 'yyyy-MM-dd'))
          return (
            <DayCell
              key={day.toISOString()}
              day={day}
              inMonth={true}
              events={dayEvents}
              onEventClick={onEventClick}
              onDayClick={onDayClick}
              onDrop={onDrop}
              maxChips={99}
            />
          )
        })}
      </div>
    </div>
  )
}

// ── Day View ───────────────────────────────────────────────────────────────────
function DayView({
  currentDate, events, onEventClick, onDayClick,
}: {
  currentDate: Date
  events: CalendarEvent[]
  onEventClick: (e: CalendarEvent) => void
  onDayClick: (dateStr: string) => void
}) {
  const dateStr = format(currentDate, 'yyyy-MM-dd')
  const dayEvents = events.filter((e) => e.date === dateStr)

  return (
    <div className="flex flex-col flex-1 min-h-0 px-6 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-heading font-semibold">
          {format(currentDate, 'EEEE, d MMMM yyyy')}
          {isToday(currentDate) && <span className="ml-2 text-xs bg-primary text-white px-2 py-0.5 rounded-full font-normal">Today</span>}
        </h2>
        <button
          onClick={() => onDayClick(dateStr)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary text-white rounded-lg font-medium hover:brightness-110 transition-all"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add event
        </button>
      </div>
      {dayEvents.length === 0 ? (
        <div
          className="flex-1 flex flex-col items-center justify-center border border-dashed border-border rounded-xl gap-3 cursor-pointer hover:border-primary/50 hover:bg-primary/3 transition-colors"
          onClick={() => onDayClick(dateStr)}
        >
          <svg className="w-8 h-8 text-muted-foreground/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
          <p className="text-muted-foreground text-sm">No events — click to add one</p>
        </div>
      ) : (
        <div className="space-y-2">
          {dayEvents.map((ev) => {
            const dl = ev.deadline_id ? _deadlinesStore.find((d) => d.id === ev.deadline_id) : null
            return (
              <div
                key={ev.id}
                role="button"
                tabIndex={0}
                draggable={ev.type === 'manual'}
                onDragStart={ev.type === 'manual' ? (e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', ev.id)
                  e.dataTransfer.setData('eventId', ev.id)
                } : undefined}
                onClick={() => onEventClick(ev)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onEventClick(ev) }}
                className={cn(
                  'w-full text-left clay-card p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all group flex items-center gap-4 select-none',
                  ev.type === 'manual' ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
                )}
              >
                <div className={cn('w-3 h-3 rounded-full flex-shrink-0', ev.color)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {ev.double_down && <span className="text-sm leading-none" title="Double Down">🔥</span>}
                    <p className="font-medium text-sm text-foreground truncate">{ev.title}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs text-muted-foreground capitalize">{ev.type === 'manual' ? 'Custom event' : ev.type.replace(/_/g, ' ')}</p>
                    {ev.content_type && <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', CONTENT_TYPE_STYLES[ev.content_type])}>{ev.content_type}</span>}
                    {ev.content_status && <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', CONTENT_STATUS_STYLES[ev.content_status])}>{ev.content_status}</span>}
                  </div>
                  {ev.comments && <p className="text-[11px] text-muted-foreground mt-1 truncate">{ev.comments}</p>}
                </div>
                {dl && (
                  <span className={cn(
                    'text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0',
                    dl.status === 'met' ? 'bg-green-100 text-green-700' : dl.status === 'missed' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700',
                  )}>
                    {dl.status === 'met' ? '✓ Met' : dl.status === 'missed' ? '✗ Missed' : 'Pending'}
                  </span>
                )}
                {ev.type === 'manual' && (
                  <span className="text-[10px] text-muted-foreground border border-border px-1.5 py-0.5 rounded flex-shrink-0">custom</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main Calendar Page ─────────────────────────────────────────────────────────
export default function DemoCalendarPage() {
  const { profile } = useDemoAuth()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<CalView>('month')
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [createDate, setCreateDate] = useState<string | null>(null)
  const [, forceRender] = useState(0)
  const refresh = () => forceRender((n) => n + 1)

  const [filterType, setFilterType] = useState<ContentType | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<ContentStatus | 'all'>('all')

  if (!profile) return null

  const role = profile.role as 'admin' | 'team' | 'client'

  const visibleProjectIds = useMemo(() => {
    if (role === 'admin') return MOCK_PROJECTS.map((p) => p.id)
    if (role === 'team') return MOCK_ASSIGNMENTS.filter((a) => a.team_member_id === profile.id).map((a) => a.project_id)
    return MOCK_PROJECTS.filter((p) => p.client_id === profile.id).map((p) => p.id)
  }, [profile.id, role])

  const allEvents = useMemo(
    () => getCalendarEventsForUser(profile.id, role, visibleProjectIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile.id, role, visibleProjectIds, forceRender],
  )

  const events = useMemo(() => allEvents.filter((e) => {
    if (filterType !== 'all' && e.type === 'manual' && e.content_type !== filterType) return false
    if (filterStatus !== 'all' && e.type === 'manual' && e.content_status !== filterStatus) return false
    return true
  }), [allEvents, filterType, filterStatus])

  // Navigation
  const prev = () => {
    if (view === 'month') setCurrentDate(subMonths(currentDate, 1))
    else if (view === 'week') setCurrentDate(subWeeks(currentDate, 1))
    else setCurrentDate(subDays(currentDate, 1))
  }
  const next = () => {
    if (view === 'month') setCurrentDate(addMonths(currentDate, 1))
    else if (view === 'week') setCurrentDate(addWeeks(currentDate, 1))
    else setCurrentDate(addDays(currentDate, 1))
  }
  const goToday = () => setCurrentDate(new Date())

  const headerLabel = () => {
    if (view === 'month') return format(currentDate, 'MMMM yyyy')
    if (view === 'week') {
      const ws = startOfWeek(currentDate, { weekStartsOn: 1 })
      const we = endOfWeek(currentDate, { weekStartsOn: 1 })
      return `${format(ws, 'd MMM')} – ${format(we, 'd MMM yyyy')}`
    }
    return format(currentDate, 'EEEE, d MMMM yyyy')
  }

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleDeadlineUpdate = (deadlineId: string, newDueAt: string) => {
    updateDeadlineDueAt(deadlineId, newDueAt)
    if (selectedEvent?.deadline_id === deadlineId) setSelectedEvent({ ...selectedEvent, date: newDueAt.slice(0, 10) })
    refresh()
  }

  const handleDeadlineResolve = (deadlineId: string, status: 'met' | 'missed') => {
    resolveDeadline(deadlineId, status)
    refresh()
    setSelectedEvent(null)
  }

  const handleDayClick = (dateStr: string) => {
    setCreateDate(dateStr)
  }

  const handleCreateEvent = (
    title: string, date: string, color: string,
    contentType: ContentType | null, contentStatus: ContentStatus | null,
    comments: string | null, doubleDown: boolean,
    inspirationUrl: string | null, script: string | null, caption: string | null,
    assignedClientIds: string[], assignedTeamIds: string[],
  ) => {
    addCalendarEvent({
      project_id: '',
      type: 'manual',
      title,
      date,
      color,
      owner_id: profile.id,
      content_type: contentType,
      content_status: contentStatus,
      comments,
      double_down: doubleDown,
      inspiration_url: inspirationUrl,
      script,
      caption,
      assigned_client_ids: assignedClientIds,
      assigned_team_ids: assignedTeamIds,
    })
    setCreateDate(null)
    refresh()
    toast.success(`Event "${title}" added`)
  }

  const handleDrop = (dateStr: string, eventId: string) => {
    updateCalendarEventDate(eventId, dateStr)
    if (selectedEvent?.id === eventId) setSelectedEvent({ ...selectedEvent, date: dateStr })
    refresh()
    toast.success('Event moved')
  }

  const handleManualUpdate = (
    eventId: string, title: string, date: string, color: string,
    contentType: ContentType | null, contentStatus: ContentStatus | null,
    comments: string | null, doubleDown: boolean,
    inspirationUrl: string | null, script: string | null, caption: string | null,
    assignedClientIds: string[], assignedTeamIds: string[],
  ) => {
    updateCalendarEventTitle(eventId, title)
    updateCalendarEventDate(eventId, date)
    updateCalendarEventColor(eventId, color)
    updateCalendarEventMeta(eventId, {
      content_type: contentType, content_status: contentStatus,
      comments, double_down: doubleDown,
      inspiration_url: inspirationUrl, script, caption,
      assigned_client_ids: assignedClientIds, assigned_team_ids: assignedTeamIds,
    })
    refresh()
    toast.success('Event updated')
  }

  const handleManualDelete = (eventId: string) => {
    removeCalendarEvent(eventId)
    refresh()
    toast.success('Event deleted')
  }

  // Legend
  const LEGEND = [
    { label: 'Created', color: 'bg-blue-500' },
    { label: 'Approved', color: 'bg-green-500' },
    { label: 'Deadline (pending)', color: 'bg-orange-500' },
    { label: 'Deadline (met)', color: 'bg-green-500' },
    { label: 'Deadline (missed)', color: 'bg-red-500' },
    { label: 'Custom', color: 'bg-indigo-500' },
  ]

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border flex-shrink-0 flex-wrap gap-y-2">
        <div className="flex items-center gap-1">
          <button onClick={prev} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button onClick={next} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>

        <h2 className="text-base font-heading font-semibold flex-1 min-w-0">{headerLabel()}</h2>

        <button onClick={goToday} className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-muted transition-colors font-medium">Today</button>

        {/* Add event button */}
        <button
          onClick={() => setCreateDate(format(currentDate, 'yyyy-MM-dd'))}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary text-white rounded-lg font-medium hover:brightness-110 transition-all active:scale-[0.98]"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add event
        </button>

        {/* View toggle */}
        <div className="flex items-center bg-muted/50 rounded-lg p-0.5 border border-border">
          {(['month', 'week', 'day'] as CalView[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn('px-3 py-1.5 rounded text-xs font-medium capitalize transition-all', view === v ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground')}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center gap-4 px-6 py-2 border-b border-border/50 flex-wrap flex-shrink-0">
        {LEGEND.filter((_, i) => {
          if (role === 'client') return i <= 1
          return true
        }).map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', l.color)} />
            <span className="text-[11px] text-muted-foreground">{l.label}</span>
          </div>
        ))}
        {CONTENT_TYPES.map((t) => (
          <span key={t} className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', CONTENT_TYPE_STYLES[t])}>{t}</span>
        ))}
        <span className="text-[10px] text-muted-foreground">🔥 Double Down</span>
        <span className="text-[11px] text-muted-foreground ml-auto hidden sm:block">Click a day to add an event · Drag custom events to move</span>
      </div>

      {/* ── Content filters ── */}
      <div className="flex items-center gap-2 px-6 py-2 border-b border-border/50 flex-wrap flex-shrink-0">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Filter:</span>
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setFilterType('all')} className={cn('px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors', filterType === 'all' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground')}>All types</button>
          {CONTENT_TYPES.map((t) => (
            <button key={t} onClick={() => setFilterType(filterType === t ? 'all' : t)} className={cn('px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors', filterType === t ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground')}>{t}</button>
          ))}
        </div>
        <div className="w-px h-3 bg-border mx-1" />
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setFilterStatus('all')} className={cn('px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors', filterStatus === 'all' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground')}>All statuses</button>
          {CONTENT_STATUSES.map((s) => (
            <button key={s} onClick={() => setFilterStatus(filterStatus === s ? 'all' : s)} className={cn('px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors', filterStatus === s ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground')}>{s}</button>
          ))}
        </div>
      </div>

      {/* ── Calendar body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {view === 'month' && (
          <MonthView
            currentDate={currentDate}
            events={events}
            onEventClick={setSelectedEvent}
            onDayClick={handleDayClick}
            onDrop={handleDrop}
          />
        )}
        {view === 'week' && (
          <WeekView
            currentDate={currentDate}
            events={events}
            onEventClick={setSelectedEvent}
            onDayClick={handleDayClick}
            onDrop={handleDrop}
          />
        )}
        {view === 'day' && (
          <DayView
            currentDate={currentDate}
            events={events}
            onEventClick={setSelectedEvent}
            onDayClick={handleDayClick}
          />
        )}
      </div>

      {/* ── Create event modal ── */}
      {createDate && (
        <CreateEventModal
          initialDate={createDate}
          isAdmin={role === 'admin'}
          onSave={handleCreateEvent}
          onClose={() => setCreateDate(null)}
        />
      )}

      {/* ── Event detail modal ── */}
      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          canEditDeadline={role === 'admin'}
          canEditManual={selectedEvent.owner_id === profile.id || role === 'admin'}
          onDeadlineUpdate={handleDeadlineUpdate}
          onDeadlineResolve={handleDeadlineResolve}
          onManualUpdate={handleManualUpdate}
          onManualDelete={handleManualDelete}
          currentUserId={profile.id}
          isAdmin={role === 'admin'}
        />
      )}
    </div>
  )
}
