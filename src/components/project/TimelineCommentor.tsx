import { useEffect, useRef, useState } from 'react'
import Plyr from 'plyr'
import 'plyr/dist/plyr.css'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { useApiFetch } from '@/lib/api'
import { getSignedUrlById } from '@/lib/storage'
import { formatTimestamp } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { TimelineComment, CommentAuthorRole } from '@/types'

const commentSchema = z.object({
  comment_text: z.string().min(1, 'Comment is required'),
})
type CommentForm = z.infer<typeof commentSchema>

interface Props {
  fileId: string
  storageKey: string
  projectId: string
  comments: (TimelineComment & { profiles: { full_name: string; avatar_url: string | null } })[]
  currentUserId: string
  currentUserRole: CommentAuthorRole
  canComment: boolean
  revisionRound: number
  onCommentAdded: () => void
  theater?: boolean
  onTheaterToggle?: () => void
}

export function TimelineCommentor({ fileId, projectId, comments, currentUserRole, canComment, revisionRound, onCommentAdded, theater = false, onTheaterToggle }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<Plyr | null>(null)
  const playerContainerRef = useRef<HTMLDivElement>(null)
  const [currentTs, setCurrentTs] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showAddComment, setShowAddComment] = useState(false)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [collapsedRounds, setCollapsedRounds] = useState<Set<number>>(new Set())
  const apiFetch = useApiFetch()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CommentForm>({ resolver: zodResolver(commentSchema) })

  useEffect(() => {
    setSignedUrl(null)
    setUrlError(null)
    getSignedUrlById(apiFetch, fileId)
      .then(setSignedUrl)
      .catch((e: any) => { setUrlError(e?.message ?? 'Failed to load video'); toast.error('Failed to load video') })
  }, [fileId])

  useEffect(() => {
    if (!videoRef.current || !signedUrl) return
    playerRef.current = new Plyr(videoRef.current, { controls: ['play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'fullscreen'] })
    const player = playerRef.current
    player.on('pause', () => { setCurrentTs(player.currentTime); setShowAddComment(canComment) })
    player.on('play', () => setShowAddComment(false))
    player.on('ready', () => { if (player.duration) setDuration(player.duration) })
    player.on('loadedmetadata', () => { if (player.duration) setDuration(player.duration) })
    let errorRefreshed = false
    player.on('error', () => { if (!errorRefreshed) { errorRefreshed = true; getSignedUrlById(apiFetch, fileId).then(setSignedUrl).catch(() => {}) } })
    return () => { player.destroy(); playerRef.current = null }
  }, [signedUrl, fileId, canComment])

  // Inject comment marker dots into the Plyr progress bar
  useEffect(() => {
    if (!duration || !playerContainerRef.current) return
    const bar = playerContainerRef.current.querySelector('.plyr__progress')
    if (!bar) return
    // Remove old markers
    bar.querySelectorAll('.comment-marker').forEach((el) => el.remove())
    // Add new markers (filter admin comments for clients)
    const markerComments = currentUserRole === 'client' ? comments.filter((c) => c.author_role !== 'admin') : comments
    const seen = new Set<number>()
    markerComments.filter((c) => c.timestamp_sec != null).forEach((c) => {
      const pct = Math.min(100, Math.max(0, ((c.timestamp_sec ?? 0) / duration) * 100))
      const key = Math.round(pct * 10)
      if (seen.has(key)) return
      seen.add(key)
      const dot = document.createElement('span')
      dot.className = 'comment-marker'
      dot.style.cssText = `position:absolute;top:50%;left:${pct}%;transform:translate(-50%,-50%);width:10px;height:10px;border-radius:50%;background:hsl(var(--primary));border:2px solid white;cursor:pointer;z-index:10;pointer-events:none;`
      ;(bar as HTMLElement).style.position = 'relative'
      bar.appendChild(dot)
    })
  }, [comments, currentUserRole, duration])

  const seekTo = (sec: number) => { if (playerRef.current) playerRef.current.currentTime = sec }

  const onSubmit = async (data: CommentForm) => {
    try {
      await apiFetch('/api/timeline-comments/create', {
        method: 'POST',
        body: JSON.stringify({ project_id: projectId, author_role: currentUserRole, timestamp_sec: currentTs, comment_text: '[' + formatTimestamp(currentTs) + '] — ' + data.comment_text, revision_round: revisionRound }),
      })
      reset(); setShowAddComment(false); onCommentAdded(); toast.success('Comment added')
    } catch (e: any) { toast.error(e.message) }
  }

  // Clients only see their own comments and team comments (not internal admin notes)
  const visibleComments = currentUserRole === 'client'
    ? comments.filter((c) => c.author_role !== 'admin')
    : comments

  const rounds = Array.from(new Set(visibleComments.map((c) => c.revision_round))).sort((a, b) => b - a)

  return (
    <div className="space-y-4">
      {/* Video */}
      <div ref={playerContainerRef} className="rounded-xl overflow-hidden bg-zinc-950 border border-border">
        {signedUrl
          ? <video ref={videoRef} src={signedUrl} className="w-full max-h-[80vh] object-contain" />
          : urlError
            ? <div className="aspect-video flex flex-col items-center justify-center gap-2 text-red-400 text-sm px-4 text-center">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                <p>Could not load video</p>
                <p className="text-xs text-red-300/70">{urlError}</p>
              </div>
            : <div className="aspect-video flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
        }
      </div>

      {/* Theater toggle row */}
      {onTheaterToggle && (
        <div className="flex justify-end">
          <button
            onClick={onTheaterToggle}
            title={theater ? 'Default size' : 'Theater mode'}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            {theater ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" /></svg>
                Default size
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                Theater mode
              </>
            )}
          </button>
        </div>
      )}

      {/* Comment input (shown after pause) */}
      {showAddComment && canComment && (
        <form onSubmit={handleSubmit(onSubmit)} className="clay-card p-4 space-y-3 border-primary/30">
          <p className="text-sm text-muted-foreground font-medium">
            Add comment at <span className="text-primary font-semibold font-mono">[{formatTimestamp(currentTs)}]</span>
          </p>
          <textarea
            {...register('comment_text')}
            rows={2}
            placeholder="Describe the change needed..."
            className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
          {errors.comment_text && <p className="text-destructive text-xs">{errors.comment_text.message}</p>}
          <div className="flex gap-2">
            <button type="submit" className="btn-gradient">Add comment</button>
            <button type="button" onClick={() => setShowAddComment(false)} className="px-4 py-1.5 bg-muted rounded-xl text-muted-foreground text-sm hover:bg-muted/80 transition-colors">Cancel</button>
          </div>
        </form>
      )}

      {/* Comments */}
      <div className={cn('clay-card overflow-hidden', theater && 'w-80 flex-shrink-0')}>
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
          <h3 className="font-heading font-semibold text-sm">Comments</h3>
          <span className="ml-auto text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{visibleComments.length}</span>
        </div>

        <div className={cn('overflow-y-auto', theater ? 'max-h-80' : 'max-h-64')}>
          {rounds.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">No comments yet. Pause the video to add one.</p>
          ) : rounds.map((round) => {
            const roundComments = visibleComments.filter((c) => c.revision_round === round)
            const isCurrentRound = round === revisionRound
            const isCollapsed = collapsedRounds.has(round)
            return (
              <div key={round}>
                <button
                  onClick={() => setCollapsedRounds((s) => { const next = new Set(s); next.has(round) ? next.delete(round) : next.add(round); return next })}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted transition-colors"
                >
                  <span>Round {round} {isCurrentRound && <span className="ml-1 text-primary normal-case font-normal">Current</span>}</span>
                  <span>{isCollapsed ? '▸' : '▾'} {roundComments.length}</span>
                </button>
                {!isCollapsed && (
                  <div className="divide-y divide-border/40">
                    {roundComments.map((comment) => (
                      <div key={comment.id} className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-semibold">{comment.profiles.full_name}</span>
                          <span className="text-[10px] text-muted-foreground capitalize">{comment.author_role}</span>
                          {comment.timestamp_sec !== null && (
                            <button onClick={() => seekTo(comment.timestamp_sec!)} className="text-[10px] font-mono bg-primary/15 text-primary px-1.5 py-0.5 rounded hover:bg-primary/25 transition-colors">
                              {formatTimestamp(comment.timestamp_sec)}
                            </button>
                          )}
                          <span className="text-[10px] text-muted-foreground ml-auto">{formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}</span>
                        </div>
                        <p className="text-xs text-foreground/80 leading-relaxed">{comment.comment_text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
