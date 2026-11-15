import { isToday } from 'date-fns'
import { toast } from 'sonner'
import { useMarkContacted, useUndoContact } from '@/hooks/useCare'
import { Icon } from '@/components/ds'
import type { CareOverview } from '@/types/care'

/** "Contacted" for a client in Text today (Client Care and the admin Home).
 *  Once ticked today it shows "Contacted" quietly; the toast offers Undo. */
export function QuickContacted({ item }: { item: CareOverview['text_today'][number] }) {
  const mark = useMarkContacted()
  const undo = useUndoContact()
  const done = !!item.last_contact_at && isToday(new Date(item.last_contact_at))
  const tick = () => mark.mutate(item.client_id, {
    onSuccess: (detail) => toast.success(item.name, { action: { label: 'Undo', onClick: () => undo.mutate(detail.contacts[0].id) } }),
    onError: (e) => toast.error((e as Error).message),
  })
  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5 flex-shrink-0 px-2 whitespace-nowrap" style={{ fontSize: 13, color: 'var(--faint)' }}>
        <Icon name="check" size={16} />Contacted
      </span>
    )
  }
  return (
    <button onClick={tick} disabled={mark.isPending} className="ds-ghost-btn ds-tap flex-shrink-0 whitespace-nowrap disabled:opacity-60">
      Contacted
    </button>
  )
}
