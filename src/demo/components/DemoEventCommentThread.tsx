import { useState, useRef, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import {
  getCommentsForEvent,
  addEventComment,
  deleteEventComment,
  type CalendarEventCommentMock,
} from '../mockData'

const ROLE_STYLES: Record<string, string> = {
  admin:  'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  team:   'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  client: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
}

function CommentBubble({
  comment,
  currentUserId,
  isAdmin,
  onDelete,
}: {
  comment: CalendarEventCommentMock
  currentUserId: string
  isAdmin: boolean
  onDelete: (id: string) => void
}) {
  const isOwn = comment.author_id === currentUserId
  const initial = comment.author_name.charAt(0).toUpperCase()

  return (
    <div className="flex gap-2.5 group">
      <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
        {comment.author_avatar
          ? <img src={comment.author_avatar} alt={comment.author_name} className="w-7 h-7 rounded-full object-cover" />
          : initial
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-xs font-semibold text-foreground">{comment.author_name}</span>
          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize', ROLE_STYLES[comment.author_role] ?? '')}>
            {comment.author_role}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {format(parseISO(comment.created_at), 'd MMM, HH:mm')}
          </span>
          {(isOwn || isAdmin) && (
            <button
              onClick={() => onDelete(comment.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-muted-foreground hover:text-destructive ml-auto flex-shrink-0"
            >
              ×
            </button>
          )}
        </div>
        <div className={cn(
          'text-sm rounded-xl px-3 py-2 leading-relaxed',
          isOwn ? 'bg-primary text-white rounded-tl-sm' : 'bg-muted text-foreground rounded-tl-sm'
        )}>
          {comment.text}
        </div>
      </div>
    </div>
  )
}

export function DemoEventCommentThread({
  eventId,
  currentUserId,
  isAdmin,
}: {
  eventId: string
  currentUserId: string
  isAdmin: boolean
}) {
  const [text, setText] = useState('')
  const [comments, setComments] = useState<CalendarEventCommentMock[]>(() => getCommentsForEvent(eventId))
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments.length])

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    addEventComment(eventId, currentUserId, trimmed)
    setComments(getCommentsForEvent(eventId))
    setText('')
  }

  const handleDelete = (commentId: string) => {
    deleteEventComment(commentId)
    setComments(getCommentsForEvent(eventId))
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto space-y-4 px-4 py-3 min-h-0">
        {comments.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">No comments yet. Be the first!</p>
        )}
        {comments.map((c) => (
          <CommentBubble
            key={c.id}
            comment={c}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            onDelete={handleDelete}
          />
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-border px-4 py-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder="Add a comment…"
          className="flex-1 bg-muted rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className="px-3 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-40"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  )
}
