import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClientLayout } from '@/components/workspace/ClientLayout'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  parseISO,
} from 'date-fns'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import {
  useCalendarEvents,
  useCreateCalendarEvent,
  useUpdateCalendarEvent,
  useDeleteCalendarEvent,
} from '@/hooks/useCalendar'
import { EventCommentThread } from '@/components/calendar/EventCommentThread'
import { ProjectEntryModal } from '@/components/calendar/ProjectEntryModal'
import { MonthView } from '@/components/calendar/MonthView'
import { Icon } from '@/components/ds'
import { PostedToggle } from '@/components/calendar/PostedToggle'
import { DayEventsModal } from '@/components/calendar/DayEventsModal'
import type { CalendarEvent, ContentType, ContentStatus } from '@/types'

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
  Story:    'bg-zinc-100 text-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-300',
  Carousel: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  Post:     'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
}

const CONTENT_STATUS_STYLES: Record<ContentStatus, string> = {
  Idea:      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  Drafting:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  Scheduled: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
}



function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5 min-h-[28px]">
      <span className="text-xs text-muted-foreground w-28 flex-shrink-0 pt-0.5">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

// ─── Create event modal ───────────────────────────────────────────────────────
function CreateEventModal({ defaultDate, onClose }: { defaultDate: Date; onClose: () => void }) {
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
      },
      {
        onSuccess: () => { toast.success('Event created'); onClose() },
        onError: () => toast.error('Failed to create event'),
      }
    )
  }

  return (
    <div className="ds-cal-veil">
      <div className="ds-cal-sheet max-w-md p-6 space-y-4 overflow-y-auto" style={{ maxHeight: '90vh' }}>
        <h2 className="font-heading font-semibold text-lg">New Event</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title…" className="w-full bg-muted rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" autoFocus />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-muted rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Content type</label>
              <select value={contentType} onChange={(e) => setContentType(e.target.value as ContentType | '')} className="w-full bg-muted rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                <option value="">None</option>
                {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Status</label>
              <select value={contentStatus} onChange={(e) => setContentStatus(e.target.value as ContentStatus | '')} className="w-full bg-muted rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
                <option value="">None</option>
                {CONTENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
            <textarea value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Notes…" rows={2} className="w-full bg-muted rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Inspiration URL</label>
            <input value={inspirationUrl} onChange={(e) => setInspirationUrl(e.target.value)} placeholder="https://…" className="w-full bg-muted rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Script</label>
            <textarea value={script} onChange={(e) => setScript(e.target.value)} placeholder="Script…" rows={3} className="w-full bg-muted rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Caption</label>
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption…" rows={2} className="w-full bg-muted rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Color</label>
              <div className="flex gap-2 flex-wrap">
                {EVENT_COLORS.map((c) => (
                  <button key={c.value} onClick={() => setColor(c.value)} title={c.label} className={cn('w-6 h-6 rounded-full transition-all', c.value, color === c.value && 'ring-2 ring-offset-2 ring-foreground')} />
                ))}
              </div>
            </div>
            <button onClick={() => setDoubleDown(!doubleDown)} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border', doubleDown ? 'bg-orange-500 text-white border-orange-500' : 'bg-muted text-muted-foreground border-border hover:border-orange-400 hover:text-orange-500')}>
              <Icon name="local_fire_department" className="text-orange-500" /> Double Down
            </button>
          </div>
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
function EventModal({ event, onClose, currentUserId }: { event: CalendarEvent; onClose: () => void; currentUserId: string }) {
  const navigate = useNavigate()
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

  const updateEvent = useUpdateCalendarEvent()
  const deleteEvent = useDeleteCalendarEvent()
  const isManual = event.type === 'manual'
  const isOwner = event.owner_id === currentUserId

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
      caption !== (event.caption ?? '')
    )
  }, [title, date, color, contentType, contentStatus, comments, doubleDown, inspirationUrl, script, caption, event])

  const canEdit = isManual && isOwner

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
      },
      {
        onSuccess: () => { toast.success('Event updated'); onClose() },
        onError: () => toast.error('Failed to update event'),
      }
    )
  }

  /** Hand the entry's brief to the new-project form. Sent via router state
   *  rather than query params: scripts are long and would blow up the URL. */
  const handleCreateProject = () => {
    navigate('/workspace/new', {
      state: {
        prefill: {
          title: title.trim(),
          inspiration_url: inspirationUrl.trim(),
          video_script: script.trim(),
          // The client's notes and caption are both useful context for the
          // editor; caption is labelled so it isn't mistaken for direction.
          instructions: [comments.trim(), caption.trim() ? `Caption:\n${caption.trim()}` : '']
            .filter(Boolean)
            .join('\n\n'),
          fromEventTitle: event.title,
          // Links entry → project so this entry's colour tracks progress.
          fromEventId: event.id,
        },
      },
    })
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
  }

  const handleDelete = () => {
    deleteEvent.mutate(event.id, {
      onSuccess: () => { toast.success('Event deleted'); onClose() },
      onError: () => toast.error('Failed to delete event'),
    })
  }

  // Project entries: date, status and a way into the project.
  if (!isManual) return <ProjectEntryModal event={event} onClose={onClose} projectBase="/workspace/projects" />

  return (
    <div className="ds-cal-veil">
      <div className="ds-cal-sheet max-w-lg flex flex-col" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="px-6 pt-6 pb-3 flex-shrink-0 border-b border-border">
          <div className="flex items-center gap-2">
            {canEdit ? (
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="flex-1 text-lg font-heading font-semibold bg-transparent focus:outline-none border-b-2 border-transparent focus:border-primary transition-colors min-w-0"
              />
            ) : (
              <h2 className="text-lg font-heading font-semibold flex-1 truncate">{event.title}</h2>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full ds-tag bg-muted text-muted-foreground capitalize flex-shrink-0">
              {event.type.replace('_', ' ')}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1 divide-y divide-border/40">
          {/* Property table */}
          <div className="pb-3 space-y-0.5">
            <PropRow label="Status">
              {canEdit ? (
                <select value={contentStatus} onChange={(e) => setContentStatus(e.target.value as ContentStatus | '')} className="bg-transparent text-xs focus:outline-none w-full py-0.5">
                  <option value="">—</option>
                  {CONTENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                event.content_status
                  ? <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full ds-tag', CONTENT_STATUS_STYLES[event.content_status])}>{event.content_status}</span>
                  : <span className="text-xs text-muted-foreground">—</span>
              )}
            </PropRow>
            <PropRow label="Content type">
              {canEdit ? (
                <select value={contentType} onChange={(e) => setContentType(e.target.value as ContentType | '')} className="bg-transparent text-xs focus:outline-none w-full py-0.5">
                  <option value="">—</option>
                  {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              ) : (
                event.content_type
                  ? <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full ds-tag', CONTENT_TYPE_STYLES[event.content_type])}>{event.content_type}</span>
                  : <span className="text-xs text-muted-foreground">—</span>
              )}
            </PropRow>
            <PropRow label="Date">
              {canEdit ? (
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-transparent text-xs focus:outline-none py-0.5" />
              ) : (
                <span className="text-xs text-muted-foreground">{format(parseISO(event.date), 'MMMM d, yyyy')}</span>
              )}
            </PropRow>
            <PropRow label="Posted">
              <PostedToggle event={event} />
            </PropRow>
            <PropRow label="Double Down">
              {canEdit ? (
                <button onClick={() => setDoubleDown(!doubleDown)} className={cn('flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ds-chip text-xs font-medium border transition-all', doubleDown ? 'bg-orange-500 text-white border-orange-500' : 'bg-muted text-muted-foreground border-border hover:border-orange-400 hover:text-orange-500')}>
                  <Icon name="local_fire_department" className="text-orange-500" /> {doubleDown ? 'Yes' : 'No'}
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">{event.double_down ? <><Icon name="local_fire_department" className="text-orange-500" /> Yes</> : 'No'}</span>
              )}
            </PropRow>
            {canEdit && (
              <PropRow label="Color">
                <div className="flex gap-1.5 flex-wrap pt-0.5">
                  {EVENT_COLORS.map((c) => (
                    <button key={c.value} onClick={() => setColor(c.value)} title={c.label} className={cn('w-4 h-4 rounded-full transition-all', c.value, color === c.value && 'ring-2 ring-offset-1 ring-foreground')} />
                  ))}
                </div>
              </PropRow>
            )}
          </div>

          {/* Editable content fields */}
          <div className="pt-3 pb-3 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Notes</p>
              {canEdit
                ? <textarea value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Add notes…" rows={2} className="w-full bg-muted/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
                : event.comments ? <p className="text-sm text-muted-foreground bg-muted/50 rounded-xl px-3 py-2">{event.comments}</p> : <span className="text-xs text-muted-foreground">—</span>
              }
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Inspiration URL</p>
              {canEdit
                ? <input value={inspirationUrl} onChange={(e) => setInspirationUrl(e.target.value)} placeholder="https://…" className="w-full bg-muted/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                : event.inspiration_url
                  ? <a href={event.inspiration_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline break-all">{event.inspiration_url}</a>
                  : <span className="text-xs text-muted-foreground">—</span>
              }
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Script</p>
              {canEdit
                ? <textarea value={script} onChange={(e) => setScript(e.target.value)} placeholder="Script…" rows={4} className="w-full bg-muted/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
                : event.script ? <p className="text-sm text-muted-foreground bg-muted/50 rounded-xl px-3 py-2 whitespace-pre-wrap">{event.script}</p> : <span className="text-xs text-muted-foreground">—</span>
              }
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Caption</p>
              {canEdit
                ? <textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption…" rows={2} className="w-full bg-muted/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
                : event.caption ? <p className="text-sm text-muted-foreground bg-muted/50 rounded-xl px-3 py-2">{event.caption}</p> : <span className="text-xs text-muted-foreground">—</span>
              }
            </div>
          </div>

          {/* Comment thread */}
          <div className="pt-3">
            <p className="text-xs text-muted-foreground mb-2">Comments</p>
            <EventCommentThread eventId={event.id} currentUserId={currentUserId} isAdmin={false} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-border px-6 py-3">
          {isDirty && canEdit ? (
            <div className="flex items-center justify-between">
              <button onClick={handleDiscard} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-colors">Discard</button>
              <button onClick={handleSave} disabled={updateEvent.isPending} className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl shadow-clay hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-40">Save changes</button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div>
                {canEdit && (
                  <button onClick={handleDelete} disabled={deleteEvent.isPending} className="px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-xl transition-colors disabled:opacity-40">Delete</button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Turn a planned calendar entry straight into a project —
                    the brief (title, inspiration, script, notes) is already
                    written here, so it carries over pre-filled. */}
                {isManual && (
                  <button
                    onClick={handleCreateProject}
                    title="Start a project pre-filled with this entry's details"
                    className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl shadow-clay hover:brightness-110 transition-all active:scale-[0.98]"
                  >
                    Create project
                  </button>
                )}
                <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-colors">Close</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ClientCalendar() {
  const { profile } = useAuth()
  const [viewDate, setViewDate] = useState(new Date())
  const [createDay, setCreateDay] = useState<Date | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  // Day whose full entry list is open (the "+N more" overflow view).
  const [dayDetail, setDayDetail] = useState<Date | null>(null)
  const [filterType, setFilterType] = useState<ContentType | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<ContentStatus | 'all'>('all')

  const from = format(startOfWeek(startOfMonth(viewDate)), 'yyyy-MM-dd')
  const to = format(endOfWeek(endOfMonth(viewDate)), 'yyyy-MM-dd')
  const { data: allEvents } = useCalendarEvents(from, to)

  // Clients don't see deadlines; apply content filters
  const events = (allEvents ?? []).filter((e) => {
    if (e.type === 'deadline') return false
    if (filterType !== 'all' && e.type === 'manual' && e.content_type !== filterType) return false
    if (filterStatus !== 'all' && e.type === 'manual' && e.content_status !== filterStatus) return false
    return true
  })

  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(viewDate)), end: endOfWeek(endOfMonth(viewDate)) })
  const eventsForDay = (day: Date) => { const s = format(day, 'yyyy-MM-dd'); return events.filter((e) => e.date === s) }

  return (
    <ClientLayout>
      <main className="px-4 md:px-7 pb-10">
        <MonthView viewDate={viewDate} onMonth={setViewDate} days={days} eventsForDay={eventsForDay}
          onCreate={setCreateDay} onSelect={setSelectedEvent} onMore={setDayDetail}
          type={filterType} onType={setFilterType} status={filterStatus} onStatus={setFilterStatus} />
      </main>

      {createDay && <CreateEventModal defaultDate={createDay} onClose={() => setCreateDay(null)} />}
      {dayDetail && (
        <DayEventsModal
          day={dayDetail}
          events={eventsForDay(dayDetail)}
          onSelect={(event) => setSelectedEvent(event)}
          onClose={() => setDayDetail(null)}
        />
      )}
      {selectedEvent && profile && (
        <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} currentUserId={profile.id} />
      )}
    </ClientLayout>
  )
}
