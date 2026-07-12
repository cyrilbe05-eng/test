import { useCallback, useEffect, useRef, useState } from 'react'
import Plyr from 'plyr'
import 'plyr/dist/plyr.css'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { useApiFetch } from '@/lib/api'
import { getSignedUrlById } from '@/lib/storage'
import { createRecoveryGate } from '@/lib/playbackRecovery'
import { formatTimestamp } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { TimelineComment, CommentAuthorRole } from '@/types'

// Diagnostic breadcrumbs for playback incidents — greppable prefix so a user
// screenshot/console dump tells us exactly which recovery path fired.
function logPlayback(msg: string, extra?: unknown) {
  console.warn(`[playback] ${msg}`, extra ?? '')
}

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

export function TimelineCommentor({ fileId, projectId, comments, currentUserId, currentUserRole, canComment, revisionRound, onCommentAdded, theater = false, onTheaterToggle }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<Plyr | null>(null)
  const playerContainerRef = useRef<HTMLDivElement>(null)
  const [duration, setDuration] = useState(0)
  const [showAddComment, setShowAddComment] = useState(false)
  const [loadingSource, setLoadingSource] = useState(true)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [collapsedRounds, setCollapsedRounds] = useState<Set<number>>(new Set())
  // B2: selectable range for the comment being composed. Start defaults to the
  // pause position; both ends can be re-pinned from the live playhead.
  const [rangeStartTs, setRangeStartTs] = useState(0)
  const [rangeEndTs, setRangeEndTs] = useState<number | null>(null)
  // B1: inline edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const apiFetch = useApiFetch()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CommentForm>({ resolver: zodResolver(commentSchema) })

  // The player reads canComment inside event handlers. Keeping it in a ref
  // means a status/revision refetch flipping canComment does NOT tear down and
  // rebuild the player mid-playback (that rebuild was the root cause of the
  // "controls vanish / dead player until refresh" bug).
  const canCommentRef = useRef(canComment)
  useEffect(() => { canCommentRef.current = canComment }, [canComment])

  // Rate-limits signed-URL recovery after media errors (see playbackRecovery.ts).
  const gateRef = useRef(createRecoveryGate())
  const loadSeq = useRef(0)

  /** Swap the video source in place, optionally restoring position + play state.
   *  The <video> element and Plyr instance are never torn down — Plyr's control
   *  DOM stays attached to the element React rendered. */
  const applySource = useCallback((url: string, resume: boolean) => {
    const video = videoRef.current
    if (!video) return
    const pos = resume ? video.currentTime : 0
    const wasPlaying = resume && !video.paused && !video.ended
    video.src = url
    video.load()
    if (pos > 0 || wasPlaying) {
      const onMeta = () => {
        video.removeEventListener('loadedmetadata', onMeta)
        if (pos > 0) video.currentTime = pos
        if (wasPlaying) video.play().catch(() => {})
      }
      video.addEventListener('loadedmetadata', onMeta)
    }
  }, [])

  /** Fetch a fresh signed URL (3 attempts, linear backoff) and apply it. */
  const loadSource = useCallback(async (opts: { resume?: boolean } = {}) => {
    const seq = ++loadSeq.current
    setUrlError(null)
    if (!opts.resume) setLoadingSource(true)
    let lastErr: any
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const url = await getSignedUrlById(apiFetch, fileId)
        if (seq !== loadSeq.current) return // superseded by a newer load (fileId change)
        applySource(url, opts.resume ?? false)
        setLoadingSource(false)
        return
      } catch (e: any) {
        lastErr = e
        logPlayback(`signed URL fetch failed (attempt ${attempt}/3)`, e?.message)
        if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1000))
      }
    }
    if (seq !== loadSeq.current) return
    setLoadingSource(false)
    setUrlError(lastErr?.message ?? 'Failed to load video')
    toast.error('Failed to load video')
    // apiFetch is recreated per render but behaviourally constant (reads the
    // token at call time) — keying on it would churn this callback every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, applySource])

  // The mount-once player effect below must always call the CURRENT loadSource
  // (it closes over fileId) — route it through a ref to avoid a stale closure
  // re-signing an old deliverable after the file switches.
  const loadSourceRef = useRef(loadSource)
  useEffect(() => { loadSourceRef.current = loadSource }, [loadSource])

  // (Re)load the source when the deliverable changes.
  useEffect(() => {
    gateRef.current.reset()
    setDuration(0)
    loadSource({ resume: false })
  }, [fileId, loadSource])

  // Create the Plyr instance ONCE per mount. Source changes are applied in
  // place via applySource — never by unmounting the <video> or destroying the
  // player, so React and Plyr no longer fight over the same DOM node.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const player = new Plyr(video, { controls: ['play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'fullscreen'] })
    playerRef.current = player
    player.on('pause', () => { setRangeStartTs(player.currentTime); setShowAddComment(canCommentRef.current) })
    player.on('play', () => { setShowAddComment(false); setRangeEndTs(null) })
    player.on('ready', () => { if (player.duration) setDuration(player.duration) })
    player.on('loadedmetadata', () => { if (player.duration) setDuration(player.duration) })
    player.on('playing', () => gateRef.current.reset())
    player.on('error', () => {
      // Expired signed URL (R2 default TTL 1 h) and transient network faults
      // both land here. Recover by re-signing — gated so a broken file can't
      // loop us forever, with resume so the viewer doesn't lose their spot.
      const now = Date.now()
      if (!gateRef.current.canAttempt(now)) {
        if (gateRef.current.attempts() > 0) {
          logPlayback('media error — recovery budget exhausted, showing retry UI')
          setUrlError('Playback failed repeatedly. Check your connection and retry.')
        }
        return
      }
      gateRef.current.recordAttempt(now)
      logPlayback(`media error — refreshing signed URL (attempt ${gateRef.current.attempts()})`)
      loadSourceRef.current({ resume: true })
    })
    return () => { player.destroy(); playerRef.current = null }
  }, [])

  // Inject comment marker dots into the Plyr progress bar
  useEffect(() => {
    if (!duration || !playerContainerRef.current) return
    const bar = playerContainerRef.current.querySelector('.plyr__progress')
    if (!bar) return
    // Remove old markers
    bar.querySelectorAll('.comment-marker, .comment-range, .compose-range').forEach((el) => el.remove())
    ;(bar as HTMLElement).style.position = 'relative'
    // Live preview of the range being composed (brighter, dashed outline)
    if (showAddComment && rangeEndTs != null && rangeEndTs > rangeStartTs) {
      const s = Math.min(100, Math.max(0, (rangeStartTs / duration) * 100))
      const e = Math.min(100, Math.max(0, (rangeEndTs / duration) * 100))
      const preview = document.createElement('span')
      preview.className = 'compose-range'
      preview.style.cssText = `position:absolute;top:-2px;bottom:-2px;left:${s}%;width:${e - s}%;background:hsl(var(--primary)/0.45);border:1px dashed hsl(var(--primary));border-radius:3px;z-index:11;pointer-events:none;`
      bar.appendChild(preview)
    }
    // Add new markers (filter admin comments for clients)
    const markerComments = currentUserRole === 'client' ? comments.filter((c) => c.author_role !== 'admin') : comments
    const pctOf = (sec: number) => Math.min(100, Math.max(0, (sec / duration) * 100))
    // Range bands first so point dots render above them
    markerComments.filter((c) => c.timestamp_sec != null && c.timestamp_end_sec != null).forEach((c) => {
      const startPct = pctOf(c.timestamp_sec ?? 0)
      const endPct = pctOf(c.timestamp_end_sec ?? 0)
      if (endPct <= startPct) return
      const band = document.createElement('span')
      band.className = 'comment-range'
      band.style.cssText = `position:absolute;top:0;bottom:0;left:${startPct}%;width:${endPct - startPct}%;background:hsl(var(--primary)/0.35);border-radius:3px;z-index:9;pointer-events:none;`
      bar.appendChild(band)
    })
    const seen = new Set<number>()
    markerComments.filter((c) => c.timestamp_sec != null).forEach((c) => {
      const pct = pctOf(c.timestamp_sec ?? 0)
      const key = Math.round(pct * 10)
      if (seen.has(key)) return
      seen.add(key)
      const dot = document.createElement('span')
      dot.className = 'comment-marker'
      dot.style.cssText = `position:absolute;top:50%;left:${pct}%;transform:translate(-50%,-50%);width:10px;height:10px;border-radius:50%;background:hsl(var(--primary));border:2px solid white;cursor:pointer;z-index:10;pointer-events:none;`
      bar.appendChild(dot)
    })
  }, [comments, currentUserRole, duration, showAddComment, rangeStartTs, rangeEndTs])

  const seekTo = (sec: number) => { if (playerRef.current) playerRef.current.currentTime = sec }

  const onSubmit = async (data: CommentForm) => {
    const isRange = rangeEndTs != null && rangeEndTs > rangeStartTs
    const label = isRange
      ? `[${formatTimestamp(rangeStartTs)}–${formatTimestamp(rangeEndTs)}]`
      : `[${formatTimestamp(rangeStartTs)}]`
    try {
      await apiFetch('/api/timeline-comments/create', {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          author_role: currentUserRole,
          timestamp_sec: rangeStartTs,
          ...(isRange ? { timestamp_end_sec: rangeEndTs } : {}),
          comment_text: label + ' — ' + data.comment_text,
          revision_round: revisionRound,
        }),
      })
      reset(); setShowAddComment(false); setRangeEndTs(null); onCommentAdded(); toast.success('Comment added')
    } catch (e: any) { toast.error(e.message) }
  }

  const markRangeStart = () => {
    const t = playerRef.current?.currentTime ?? 0
    if (rangeEndTs != null && t >= rangeEndTs) {
      setRangeEndTs(null)
      toast.info('Start moved past the end point — end cleared, set it again')
    }
    setRangeStartTs(t)
  }

  const markRangeEnd = () => {
    const t = playerRef.current?.currentTime ?? 0
    if (t <= rangeStartTs) { toast.error('Scrub past the start point first, then set the range end'); return }
    setRangeEndTs(t)
  }

  const saveEdit = async (commentId: string) => {
    if (!editText.trim()) { toast.error('Comment cannot be empty'); return }
    try {
      await apiFetch(`/api/timeline-comments/${commentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ comment_text: editText.trim() }),
      })
      setEditingId(null); onCommentAdded(); toast.success('Comment updated')
    } catch (e: any) { toast.error(e.message) }
  }

  const deleteComment = async (commentId: string) => {
    if (!confirm('Delete this comment? This cannot be undone.')) return
    try {
      await apiFetch(`/api/timeline-comments/${commentId}`, { method: 'DELETE' })
      onCommentAdded(); toast.success('Comment deleted')
    } catch (e: any) { toast.error(e.message) }
  }

  const toggleResolved = async (comment: TimelineComment) => {
    try {
      await apiFetch(`/api/timeline-comments/${comment.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ resolved: !comment.resolved }),
      })
      onCommentAdded()
    } catch (e: any) { toast.error(e.message) }
  }

  // Clients only see their own comments and team comments (not internal admin notes)
  const visibleComments = currentUserRole === 'client'
    ? comments.filter((c) => c.author_role !== 'admin')
    : comments

  const rounds = Array.from(new Set(visibleComments.map((c) => c.revision_round))).sort((a, b) => b - a)

  return (
    <div className="space-y-4">
      {/* Video — the <video> element is always mounted; Plyr owns it for the
          component's whole lifetime. Loading/error states render as overlays
          instead of swapping the element out from under the player. */}
      <div ref={playerContainerRef} className={cn('rounded-xl overflow-hidden bg-zinc-950 border border-border relative', duration === 0 && 'aspect-video')}>
        {/* Dedicated host div: Plyr re-parents the <video> into its own wrapper
            inside this div. React must never reconcile other children in here,
            or insertBefore/removeChild would hit a moved node and throw. */}
        <div>
          <video ref={videoRef} playsInline className="w-full max-h-[80vh] object-contain" />
        </div>
        {(loadingSource || urlError) && (
          <div className="absolute inset-0 z-20 bg-zinc-950/90 flex flex-col items-center justify-center gap-2 px-4 text-center">
            {urlError ? (
              <>
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                <p className="text-red-400 text-sm">Could not load video</p>
                <p className="text-xs text-red-300/70">{urlError}</p>
                <button
                  onClick={() => { gateRef.current.reset(); loadSource({ resume: false }) }}
                  className="mt-2 px-4 py-1.5 bg-muted rounded-xl text-foreground text-sm hover:bg-muted/80 transition-colors"
                >
                  Retry
                </button>
              </>
            ) : (
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            )}
          </div>
        )}
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
          <p className="text-sm text-foreground font-medium">
            {rangeEndTs != null ? 'New comment on a section' : 'New comment'}
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Start point */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Start point</span>
              <button
                type="button"
                onClick={() => seekTo(rangeStartTs)}
                title="Jump the video to the start point"
                className="text-xs font-mono bg-primary/15 text-primary px-2 py-1 rounded-lg hover:bg-primary/25 transition-colors"
              >
                {formatTimestamp(rangeStartTs)}
              </button>
              <button
                type="button"
                onClick={markRangeStart}
                title="Pin the start to where the video currently is"
                className="text-[10px] text-muted-foreground hover:text-primary underline decoration-dotted transition-colors"
              >
                use playhead
              </button>
            </div>
            <span className="text-muted-foreground text-xs">→</span>
            {/* End point (optional) */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">End point</span>
              {rangeEndTs != null ? (
                <>
                  <button
                    type="button"
                    onClick={() => seekTo(rangeEndTs)}
                    title="Jump the video to the end point"
                    className="text-xs font-mono bg-primary/15 text-primary px-2 py-1 rounded-lg hover:bg-primary/25 transition-colors"
                  >
                    {formatTimestamp(rangeEndTs)}
                  </button>
                  <button
                    type="button"
                    onClick={markRangeEnd}
                    title="Pin the end to where the video currently is"
                    className="text-[10px] text-muted-foreground hover:text-primary underline decoration-dotted transition-colors"
                  >
                    use playhead
                  </button>
                  <button
                    type="button"
                    onClick={() => setRangeEndTs(null)}
                    title="Remove the end point (comment on a single moment)"
                    className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                  >
                    ✕
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={markRangeEnd}
                  title="Scrub the video to the end of the section, then click"
                  className="text-xs border border-dashed border-muted-foreground/40 text-muted-foreground px-2 py-1 rounded-lg hover:border-primary hover:text-primary transition-colors"
                >
                  + set at playhead
                </button>
              )}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Scrub the video to a moment, then pin it with “use playhead”. Leave the end empty to comment on a single moment — the selected section is highlighted on the timeline.
          </p>
          <textarea
            {...register('comment_text')}
            rows={2}
            placeholder="Describe the change needed..."
            className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
          {errors.comment_text && <p className="text-destructive text-xs">{errors.comment_text.message}</p>}
          <div className="flex gap-2">
            <button type="submit" className="btn-gradient">
              {rangeEndTs != null ? `Comment on ${formatTimestamp(rangeStartTs)}–${formatTimestamp(rangeEndTs)}` : 'Add comment'}
            </button>
            <button type="button" onClick={() => { setShowAddComment(false); setRangeEndTs(null) }} className="px-4 py-1.5 bg-muted rounded-xl text-muted-foreground text-sm hover:bg-muted/80 transition-colors">Cancel</button>
          </div>
        </form>
      )}

      {/* Comments */}
      <div className={cn('clay-card overflow-hidden', theater && 'w-80 flex-shrink-0')}>
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
          <h3 className="font-heading font-semibold text-sm">Comments</h3>
          <div className="ml-auto flex items-center gap-1.5">
            {currentUserRole !== 'client' && visibleComments.length > 0 && (
              <span className={cn(
                'text-xs px-2 py-0.5 rounded-full',
                visibleComments.some((c) => !c.resolved)
                  ? 'bg-amber-500/15 text-amber-600'
                  : 'bg-green-500/15 text-green-600',
              )}>
                {visibleComments.filter((c) => !c.resolved).length} open
              </span>
            )}
            <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{visibleComments.length}</span>
          </div>
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
                  onClick={() => setCollapsedRounds((s) => { const next = new Set(s); if (next.has(round)) { next.delete(round) } else { next.add(round) } return next })}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted transition-colors"
                >
                  <span>Round {round} {isCurrentRound && <span className="ml-1 text-primary normal-case font-normal">Current</span>}</span>
                  <span>{isCollapsed ? '▸' : '▾'} {roundComments.length}</span>
                </button>
                {!isCollapsed && (
                  <div className="divide-y divide-border/40">
                    {roundComments.map((comment) => (
                      <div key={comment.id} className={cn('px-4 py-3', comment.resolved ? 'opacity-60' : '')}>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {/* B3: revision checklist — team/admin check items off as addressed */}
                          {currentUserRole !== 'client' && (
                            <button
                              onClick={() => toggleResolved(comment)}
                              title={comment.resolved ? 'Mark as outstanding' : 'Mark as addressed'}
                              className={cn(
                                'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
                                comment.resolved ? 'bg-green-500 border-green-500 text-white' : 'border-muted-foreground/50 hover:border-green-500',
                              )}
                            >
                              {comment.resolved ? (
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                              ) : null}
                            </button>
                          )}
                          <span className="text-xs font-semibold">{comment.profiles.full_name}</span>
                          <span className="text-[10px] text-muted-foreground capitalize">{comment.author_role}</span>
                          {comment.timestamp_sec !== null && (
                            <button onClick={() => seekTo(comment.timestamp_sec!)} className="text-[10px] font-mono bg-primary/15 text-primary px-1.5 py-0.5 rounded hover:bg-primary/25 transition-colors">
                              {formatTimestamp(comment.timestamp_sec)}
                              {comment.timestamp_end_sec != null && `–${formatTimestamp(comment.timestamp_end_sec)}`}
                            </button>
                          )}
                          {comment.edited_at && <span className="text-[10px] text-muted-foreground italic">(edited)</span>}
                          <span className="text-[10px] text-muted-foreground ml-auto">{formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}</span>
                          {/* B1: author can edit; author or admin can delete */}
                          {comment.author_id === currentUserId && editingId !== comment.id && (
                            <button
                              onClick={() => { setEditingId(comment.id); setEditText(comment.comment_text) }}
                              title="Edit comment"
                              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                            >✎</button>
                          )}
                          {(comment.author_id === currentUserId || currentUserRole === 'admin') && (
                            <button
                              onClick={() => deleteComment(comment.id)}
                              title="Delete comment"
                              className="text-[10px] text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                            >🗑</button>
                          )}
                        </div>
                        {editingId === comment.id ? (
                          <div className="space-y-1.5">
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              rows={2}
                              className="w-full px-2 py-1.5 bg-input border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                            />
                            <div className="flex gap-2">
                              <button onClick={() => saveEdit(comment.id)} className="text-[10px] font-semibold text-primary hover:underline">Save</button>
                              <button onClick={() => setEditingId(null)} className="text-[10px] text-muted-foreground hover:text-foreground">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <p className={cn('text-xs text-foreground/80 leading-relaxed', comment.resolved ? 'line-through' : '')}>{comment.comment_text}</p>
                        )}
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
