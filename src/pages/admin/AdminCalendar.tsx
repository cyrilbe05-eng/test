import { useState, useMemo } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  parseISO,
} from 'date-fns'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { cn } from '@/lib/utils'
import {
  useCalendarEvents,
  useCreateCalendarEvent,
  useUpdateCalendarEvent,
  useDeleteCalendarEvent,
} from '@/hooks/useCalendar'
import { useAuth } from '@/hooks/useAuth'
import { useQuery } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import { EventCommentThread } from '@/components/calendar/EventCommentThread'
import type { CalendarEvent, ContentType, ContentStatus, Profile } from '@/types'

const EVENT_COLORS = [
  { label: 'Indigo', value: 'bg-indigo-500' },
  { label: 'Violet', value: 'bg-violet-500' },
  { label: 'Pink', value: 'bg-pink-500' },
  { label: 'Rose', value: 'bg-rose-500' },
  { label: 'Amber', value: 'bg-amber-500' },
  { label: 'Teal', value: 'bg-teal-500' },
  { label: 'Cyan', value: 'bg-cyan-500' },
  { label: 'Slate', value: 'bg-slate-500' },
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

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5 min-h-[28px]">
      <span className="text-xs text-muted-foreground w-24 flex-shrink-0 pt-0.5">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

// ─── Create event modal ───────────────────────────────────────────────────────
function CreateEventModal({
  defaultDate,
  onClose,
  clients,
  teamMembers,
}: {
  defaultDate: Date
  onClose: () => void
  clients: Profile[]
  teamMembers: Profile[]
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(format(defaultDate, 'yyyy-MM-dd'))
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
  const createEvent = useCreateCalendarEvent()

  const handleCreate = () => {
    if (!title.trim()) { toast.error('Enter a title'); return }
    createEvent.mutate(
      {
        title: title.trim(),
        date,
        color,
        content_type: contentType || null,
        content_status: contentStatus || null,
        comments: comments.trim() || null,
        double_down: doubleDown,
        inspiration_url: inspirationUrl.trim() || null,
        script: script.trim() || null,
        caption: caption.trim() || null,
        assigned_client_ids: assignedClientIds,
        assigned_team_ids: assignedTeamIds,
      },
      {
        onSuccess: () => { toast.success('Event created'); onClose() },
        onError: () => toast.error('Failed to create event'),
      }
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 overflow-y-auto" style={{ maxHeight: '90vh' }}>
        <h2 className="font-heading font-semibold text-lg">New Event</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title…" className="w-full bg-muted rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" autoFocus />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-muted rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">Content type</label>
              <select value={contentType} onChange={(e) => setContentType(e.target.value as ContentType | '')} className="w-full bg-muted rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                <option value="">None</option>
                {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">Status</label>
              <select value={contentStatus} onChange={(e) => setContentStatus(e.target.value as ContentStatus | '')} className="w-full bg-muted rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                <option value="">None</option>
                {CONTENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">Notes</label>
            <textarea value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Notes…" rows={2} className="w-full bg-muted rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">Inspiration URL</label>
            <input value={inspirationUrl} onChange={(e) => setInspirationUrl(e.target.value)} placeholder="https://…" className="w-full bg-muted rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">Script</label>
            <textarea value={script} onChange={(e) => setScript(e.target.value)} placeholder="Script…" rows={3} className="w-full bg-muted rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">Caption</label>
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption…" rows={2} className="w-full bg-muted rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">Color</label>
              <div className="flex gap-2 flex-wrap">
                {EVENT_COLORS.map((c) => (
                  <button key={c.value} onClick={() => setColor(c.value)} title={c.label} className={cn('w-6 h-6 rounded-full transition-all', c.value, color === c.value && 'ring-2 ring-offset-2 ring-foreground')} />
                ))}
              </div>
            </div>
            <button onClick={() => setDoubleDown(!doubleDown)} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border', doubleDown ? 'bg-orange-500 text-white border-orange-500' : 'bg-muted text-muted-foreground border-border hover:border-orange-400 hover:text-orange-500')}>
              🔥 Double Down
            </button>
          </div>
          {clients.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block">Assign Clients</label>
              <div className="flex flex-wrap gap-1.5">
                {clients.map((c) => (
                  <button key={c.id} onClick={() => setAssignedClientIds(toggleId(assignedClientIds, c.id))} className={cn('flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all', assignedClientIds.includes(c.id) ? 'bg-teal-500 text-white border-teal-500' : 'bg-muted text-muted-foreground border-border hover:border-teal-400 hover:text-teal-600')}>
                    {assignedClientIds.includes(c.id) && <span className="text-[9px]">✓</span>}
                    {c.full_name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {teamMembers.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block">Assign Team</label>
              <div className="flex flex-wrap gap-1.5">
                {teamMembers.map((m) => (
                  <button key={m.id} onClick={() => setAssignedTeamIds(toggleId(assignedTeamIds, m.id))} className={cn('flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all', assignedTeamIds.includes(m.id) ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-muted text-muted-foreground border-border hover:border-indigo-400 hover:text-indigo-600')}>
                    {assignedTeamIds.includes(m.id) && <span className="text-[9px]">✓</span>}
                    {m.full_name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-colors">Cancel</button>
          <button onClick={handleCreate} disabled={createEvent.isPending} className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl shadow-clay hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-40">Create</button>
        </div>
      </div>
    </div>
  )
}

// ─── Event detail/edit modal ──────────────────────────────────────────────────
function EventModal({
  event,
  onClose,
  currentUserId,
  clients,
  teamMembers,
}: {
  event: CalendarEvent
  onClose: () => void
  currentUserId: string
  clients: Profile[]
  teamMembers: Profile[]
}) {
  const [title, setTitle] = useState(event.title)
  const [date, setDate] = useState(event.date)
  const [color, setColor] = useState(event.color ?? EVENT_COLORS[0].value)
  const [contentType, setContentType] = useState<ContentType | ''>(event.content_type ?? '')
  const [contentStatus, setContentStatus] = useState<ContentStatus | ''>(event.content_status ?? '')
  const [comments, setComments] = useState(event.comments ?? '')
  const [doubleDown, setDoubleDown] = useState(event.double_down ?? false)
  const [inspirationUrl, setInspirationUrl] = useState(event.inspiration_url ?? '')
  const [script, setScript] = useState(event.script ?? '')
  const [caption, setCaption] = useState(event.caption ?? '')
  const [assignedClientIds, setAssignedClientIds] = useState<string[]>(event.assigned_client_ids ?? [])
  const [assignedTeamIds, setAssignedTeamIds] = useState<string[]>(event.assigned_team_ids ?? [])

  const updateEvent = useUpdateCalendarEvent()
  const deleteEvent = useDeleteCalendarEvent()
  const isManual = event.type === 'manual'

  const isDirty = useMemo(() => {
    return (
      title !== event.title ||
      date !== event.date ||
      color !== (event.color ?? EVENT_COLORS[0].value) ||
      contentType !== (event.content_type ?? '') ||
      contentStatus !== (event.content_status ?? '') ||
      comments !== (event.comments ?? '') ||
      doubleDown !== (event.double_down ?? false) ||
      inspirationUrl !== (event.inspiration_url ?? '') ||
      script !== (event.script ?? '') ||
      caption !== (event.caption ?? '') ||
      JSON.stringify(assignedClientIds.slice().sort()) !== JSON.stringify((event.assigned_client_ids ?? []).slice().sort()) ||
      JSON.stringify(assignedTeamIds.slice().sort()) !== JSON.stringify((event.assigned_team_ids ?? []).slice().sort())
    )
  }, [title, date, color, contentType, contentStatus, comments, doubleDown, inspirationUrl, script, caption, assignedClientIds, assignedTeamIds, event])

  const handleSave = () => {
    if (!title.trim()) { toast.error('Enter a title'); return }
    updateEvent.mutate(
      {
        id: event.id,
        title: title.trim(),
        date,
        color,
        content_type: contentType || null,
        content_status: contentStatus || null,
        comments: comments.trim() || null,
        double_down: doubleDown,
        inspiration_url: inspirationUrl.trim() || null,
        script: script.trim() || null,
        caption: caption.trim() || null,
        assigned_client_ids: assignedClientIds,
        assigned_team_ids: assignedTeamIds,
      },
      {
        onSuccess: () => { toast.success('Event updated'); onClose() },
        onError: () => toast.error('Failed to update event'),
      }
    )
  }

  const handleDiscard = () => {
    setTitle(event.title)
    setDate(event.date)
    setColor(event.color ?? EVENT_COLORS[0].value)
    setContentType(event.content_type ?? '')
    setContentStatus(event.content_status ?? '')
    setComments(event.comments ?? '')
    setDoubleDown(event.double_down ?? false)
    setInspirationUrl(event.inspiration_url ?? '')
    setScript(event.script ?? '')
    setCaption(event.caption ?? '')
    setAssignedClientIds(event.assigned_client_ids ?? [])
    setAssignedTeamIds(event.assigned_team_ids ?? [])
  }

  const handleDelete = () => {
    deleteEvent.mutate(event.id, {
      onSuccess: () => { toast.success('Event deleted'); onClose() },
      onError: () => toast.error('Failed to delete event'),
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="px-6 pt-6 pb-3 flex-shrink-0 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            {isManual && (
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="flex-1 text-lg font-heading font-semibold bg-transparent focus:outline-none focus:ring-0 border-b-2 border-transparent focus:border-primary transition-colors min-w-0"
              />
            )}
            {!isManual && <h2 className="text-lg font-heading font-semibold flex-1 truncate">{event.title}</h2>}
            <span className={cn('text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize flex-shrink-0')}>
              {event.type.replace('_', ' ')}
            </span>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1 divide-y divide-border/40">
          {/* Property table */}
          <div className="pb-3 space-y-0.5">
            <PropRow label="Status">
              {isManual ? (
                <select value={contentStatus} onChange={(e) => setContentStatus(e.target.value as ContentStatus | '')} className="bg-transparent text-xs focus:outline-none w-full py-0.5">
                  <option value="">—</option>
                  {CONTENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </PropRow>
            <PropRow label="Content type">
              {isManual ? (
                <select value={contentType} onChange={(e) => setContentType(e.target.value as ContentType | '')} className="bg-transparent text-xs focus:outline-none w-full py-0.5">
                  <option value="">—</option>
                  {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </PropRow>
            <PropRow label="Date">
              {isManual ? (
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-transparent text-xs focus:outline-none py-0.5" />
              ) : (
                <span className="text-xs text-muted-foreground">{format(parseISO(event.date), 'MMMM d, yyyy')}</span>
              )}
            </PropRow>
            <PropRow label="Double Down">
              {isManual ? (
                <button onClick={() => setDoubleDown(!doubleDown)} className={cn('flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all', doubleDown ? 'bg-orange-500 text-white border-orange-500' : 'bg-muted text-muted-foreground border-border hover:border-orange-400 hover:text-orange-500')}>
                  🔥 {doubleDown ? 'Yes' : 'No'}
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">{event.double_down ? '🔥 Yes' : 'No'}</span>
              )}
            </PropRow>
            {isManual && (
              <PropRow label="Color">
                <div className="flex gap-1.5 flex-wrap pt-0.5">
                  {EVENT_COLORS.map((c) => (
                    <button key={c.value} onClick={() => setColor(c.value)} title={c.label} className={cn('w-4 h-4 rounded-full transition-all', c.value, color === c.value && 'ring-2 ring-offset-1 ring-foreground')} />
                  ))}
                </div>
              </PropRow>
            )}
            <PropRow label="Clients">
              <div className="flex flex-wrap gap-1 pt-0.5">
                {isManual ? (
                  <>
                    {clients.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setAssignedClientIds(toggleId(assignedClientIds, c.id))}
                        className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all', assignedClientIds.includes(c.id) ? 'bg-teal-500 text-white border-teal-500' : 'bg-muted text-muted-foreground border-border hover:border-teal-400 hover:text-teal-600')}
                      >
                        {assignedClientIds.includes(c.id) && <span className="text-[9px]">✓</span>}
                        {c.full_name}
                      </button>
                    ))}
                    {clients.length === 0 && <span className="text-xs text-muted-foreground">No clients</span>}
                  </>
                ) : (
                  <>
                    {assignedClientIds.length > 0
                      ? assignedClientIds.map((id) => {
                          const c = clients.find((x) => x.id === id)
                          return c ? <span key={id} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-300/40">{c.full_name}</span> : null
                        })
                      : <span className="text-xs text-muted-foreground">—</span>
                    }
                  </>
                )}
              </div>
            </PropRow>
            <PropRow label="Team">
              <div className="flex flex-wrap gap-1 pt-0.5">
                {isManual ? (
                  <>
                    {teamMembers.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setAssignedTeamIds(toggleId(assignedTeamIds, m.id))}
                        className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all', assignedTeamIds.includes(m.id) ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-muted text-muted-foreground border-border hover:border-indigo-400 hover:text-indigo-600')}
                      >
                        {assignedTeamIds.includes(m.id) && <span className="text-[9px]">✓</span>}
                        {m.full_name}
                      </button>
                    ))}
                    {teamMembers.length === 0 && <span className="text-xs text-muted-foreground">No team members</span>}
                  </>
                ) : (
                  <>
                    {assignedTeamIds.length > 0
                      ? assignedTeamIds.map((id) => {
                          const m = teamMembers.find((x) => x.id === id)
                          return m ? <span key={id} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-300/40">{m.full_name}</span> : null
                        })
                      : <span className="text-xs text-muted-foreground">—</span>
                    }
                  </>
                )}
              </div>
            </PropRow>
          </div>

          {/* Notes */}
          {isManual && (
            <div className="pt-3 pb-3 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Notes</p>
                <textarea value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Add notes…" rows={2} className="w-full bg-muted/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Inspiration URL</p>
                <input value={inspirationUrl} onChange={(e) => setInspirationUrl(e.target.value)} placeholder="https://…" className="w-full bg-muted/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Script</p>
                <textarea value={script} onChange={(e) => setScript(e.target.value)} placeholder="Script…" rows={4} className="w-full bg-muted/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Caption</p>
                <textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption…" rows={2} className="w-full bg-muted/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
              </div>
            </div>
          )}
          {!isManual && event.comments && (
            <div className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">{event.comments}</p>
            </div>
          )}

          {/* Comment thread */}
          <div className="pt-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Comments</p>
            <EventCommentThread eventId={event.id} currentUserId={currentUserId} isAdmin={true} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-border px-6 py-3">
          {isDirty && isManual ? (
            <div className="flex items-center justify-between">
              <button onClick={handleDiscard} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-colors">Discard</button>
              <div className="flex gap-2">
                {!isDirty && (
                  <button onClick={handleDelete} disabled={deleteEvent.isPending} className="px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-xl transition-colors disabled:opacity-40">Delete</button>
                )}
                <button onClick={handleSave} disabled={updateEvent.isPending} className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl shadow-clay hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-40">Save changes</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                {isManual && (
                  <button onClick={handleDelete} disabled={deleteEvent.isPending} className="px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-xl transition-colors disabled:opacity-40">Delete</button>
                )}
              </div>
              <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-colors">Close</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Calendar grid ────────────────────────────────────────────────────────────
export default function AdminCalendar() {
  const { profile } = useAuth()
  const apiFetch = useApiFetch()
  const [viewDate, setViewDate] = useState(new Date())
  const [createDay, setCreateDay] = useState<Date | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [filterType, setFilterType] = useState<ContentType | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<ContentStatus | 'all'>('all')

  const from = format(startOfWeek(startOfMonth(viewDate)), 'yyyy-MM-dd')
  const to = format(endOfWeek(endOfMonth(viewDate)), 'yyyy-MM-dd')

  const { data: allEvents } = useCalendarEvents(from, to)
  const { data: clients = [] } = useQuery<Profile[]>({
    queryKey: ['users_clients'],
    queryFn: () => apiFetch<Profile[]>('/api/users/clients'),
  })
  const { data: teamMembers = [] } = useQuery<Profile[]>({
    queryKey: ['users_team'],
    queryFn: () => apiFetch<Profile[]>('/api/users/team'),
  })

  const events = (allEvents ?? []).filter((e) => {
    if (filterType !== 'all' && e.type === 'manual' && e.content_type !== filterType) return false
    if (filterStatus !== 'all' && e.type === 'manual' && e.content_status !== filterStatus) return false
    return true
  })

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(viewDate)),
    end: endOfWeek(endOfMonth(viewDate)),
  })

  const eventsForDay = (day: Date): CalendarEvent[] => {
    const dateStr = format(day, 'yyyy-MM-dd')
    return events.filter((e) => e.date === dateStr)
  }

  return (
    <AdminLayout>
      <main className="px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-heading font-semibold tracking-tight">
              {format(viewDate, 'MMMM yyyy')}
            </h2>
            <p className="text-muted-foreground text-sm mt-0.5">Calendar</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewDate(subMonths(viewDate, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => setViewDate(new Date())}
              className="px-3 py-1.5 text-sm font-medium bg-muted rounded-lg hover:bg-muted/80 transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => setViewDate(addMonths(viewDate, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Filter:</span>
          <div className="flex gap-1">
            <button onClick={() => setFilterType('all')} className={cn('px-2.5 py-1 rounded-lg text-xs font-medium transition-colors', filterType === 'all' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground')}>All types</button>
            {CONTENT_TYPES.map((t) => (
              <button key={t} onClick={() => setFilterType(filterType === t ? 'all' : t)} className={cn('px-2.5 py-1 rounded-lg text-xs font-medium transition-colors', filterType === t ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground')}>{t}</button>
            ))}
          </div>
          <div className="w-px h-4 bg-border mx-1" />
          <div className="flex gap-1">
            <button onClick={() => setFilterStatus('all')} className={cn('px-2.5 py-1 rounded-lg text-xs font-medium transition-colors', filterStatus === 'all' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground')}>All statuses</button>
            {CONTENT_STATUSES.map((s) => (
              <button key={s} onClick={() => setFilterStatus(filterStatus === s ? 'all' : s)} className={cn('px-2.5 py-1 rounded-lg text-xs font-medium transition-colors', filterStatus === s ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground')}>{s}</button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="clay-card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-border">
            {DAY_NAMES.map((d) => (
              <div key={d} className="px-2 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day, idx) => {
              const dayEvents = eventsForDay(day)
              const isCurrentMonth = isSameMonth(day, viewDate)
              const isToday = isSameDay(day, new Date())
              const visible = dayEvents.slice(0, 3)
              const overflow = dayEvents.length - visible.length
              return (
                <div
                  key={idx}
                  onClick={() => setCreateDay(day)}
                  className={cn('min-h-[100px] p-2 border-b border-r border-border/50 cursor-pointer transition-colors hover:bg-muted/30', !isCurrentMonth && 'opacity-40', idx % 7 === 6 && 'border-r-0', idx >= days.length - 7 && 'border-b-0')}
                >
                  <div className={cn('w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold mb-1', isToday ? 'bg-primary text-white' : 'text-foreground')}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-0.5">
                    {visible.map((event) => (
                      <button
                        key={event.id}
                        onClick={(e) => { e.stopPropagation(); setSelectedEvent(event) }}
                        className={cn('w-full flex items-center gap-1 px-1.5 py-0.5 rounded text-left hover:opacity-80 transition-opacity', event.color ?? 'bg-slate-500')}
                      >
                        {event.double_down && <span className="text-[9px] leading-none">🔥</span>}
                        {event.content_type && <span className="text-white/70 text-[9px] leading-none font-bold uppercase tracking-tight flex-shrink-0">{event.content_type.slice(0, 1)}</span>}
                        <span className="text-white text-[10px] font-medium truncate leading-tight">{event.title}</span>
                      </button>
                    ))}
                    {overflow > 0 && <p className="text-[10px] text-muted-foreground px-1">+{overflow} more</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          {CONTENT_TYPES.map((t) => <span key={t} className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', CONTENT_TYPE_STYLES[t])}>{t}</span>)}
          <div className="w-px h-3 bg-border mx-1" />
          {CONTENT_STATUSES.map((s) => <span key={s} className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', CONTENT_STATUS_STYLES[s])}>{s}</span>)}
          <span className="ml-auto text-[10px] text-muted-foreground">🔥 = Double Down</span>
        </div>
      </main>

      {createDay && (
        <CreateEventModal
          defaultDate={createDay}
          onClose={() => setCreateDay(null)}
          clients={clients}
          teamMembers={teamMembers}
        />
      )}
      {selectedEvent && profile && (
        <EventModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          currentUserId={profile.id}
          clients={clients}
          teamMembers={teamMembers}
        />
      )}
    </AdminLayout>
  )
}
