import { useState } from 'react'
import { addDays, format } from 'date-fns'
import { toast } from 'sonner'
import { Ms } from '@/components/ds'
import { useSheetClose } from '@/hooks/useSheetClose'
import { SCRIPT_TYPES } from '@/lib/scriptStatus'
import { cn } from '@/lib/utils'
import type { useScriptActions } from '@/hooks/useScripts'
import type { Script, ScriptType } from '@/types/scripts'

// Approved script → the client's calendar: pick a date (and the type, set
// from the script). Script, caption, client notes and editor notes all go
// with it; the script then shows as Scheduled.

function Sheet({ script, actions, onClose }: { script: Script; actions: ReturnType<typeof useScriptActions>; onClose: () => void }) {
  const { closing, close } = useSheetClose(onClose)
  const [date, setDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
  const [type, setType] = useState<ScriptType>(script.type)
  const push = () => actions.push.mutate({ id: script.id, date, type }, {
    onSuccess: () => { toast.success(`Added to the calendar for ${format(new Date(`${date}T12:00:00`), 'd MMM')}`); close() },
    onError: (e) => toast.error((e as Error)?.message ?? 'Not pushed'),
  })
  return (
    <div className={cn('ds-cal-veil', closing && 'closing')} onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}>
      <div className={cn('ds-cal-sheet ds-msheet max-w-sm overflow-hidden', closing && 'closing')}>
        <h2 className="ds-form-title">Push to calendar</h2>
        <form className="px-6 space-y-4" onSubmit={(e) => { e.preventDefault(); push() }}>
          <p className="truncate" style={{ fontSize: 14, fontWeight: 600, color: 'var(--strong)' }}>{script.title}</p>
          <div>
            <p className="mb-1.5" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--faint)' }}>Date</p>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
          </div>
          <div>
            <p className="mb-1.5" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--faint)' }}>Type</p>
            <select value={type} onChange={(e) => setType(e.target.value as ScriptType)} aria-label="Type">
              {SCRIPT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="ds-form-foot" style={{ margin: '0 -24px' }}>
            <button type="button" className="ds-ghost-btn" onClick={close}>Cancel</button>
            <button type="submit" className="ds-primary" style={{ paddingLeft: 14 }} disabled={!date || actions.push.isPending}>
              <Ms name="event_available" style={{ fontSize: 17, width: 17, color: 'inherit' }} />Push
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/** The footer control: "Push to calendar" when approved, the date once scheduled. */
export function PushToCalendar({ script, actions }: { script: Script; actions: ReturnType<typeof useScriptActions> }) {
  const [open, setOpen] = useState(false)
  if (script.status === 'scheduled') {
    return (
      <span className="inline-flex items-center gap-1.5" style={{ fontSize: 13, fontWeight: 500, color: 'var(--soft-text)' }}>
        <Ms name="event_available" style={{ fontSize: 17, width: 17, color: 'inherit' }} />
        On the calendar{script.calendarDate ? ` · ${format(new Date(`${script.calendarDate}T12:00:00`), 'd MMM')}` : ''}
      </span>
    )
  }
  if (script.status !== 'approved') return null
  return (
    <>
      <button type="button" className="ds-primary" onClick={() => setOpen(true)}>
        <Ms name="calendar_add_on" style={{ fontSize: 17, width: 17, color: 'inherit' }} />Push to calendar
      </button>
      {open && <Sheet script={script} actions={actions} onClose={() => setOpen(false)} />}
    </>
  )
}
