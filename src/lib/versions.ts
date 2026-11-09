import type { ProjectFile, TimelineComment } from '@/types'

type F = Pick<ProjectFile, 'id' | 'file_type' | 'created_at' | 'review_round'>

/** The versions a reviewer can switch between: the deliverables of the
 *  latest review cycle, oldest first (V1, V2…). Deliverables from before
 *  migration 020 have no cycle: then all of them count while the client
 *  hasn't asked for a revision yet, otherwise only the newest (as before). */
export function currentVersions<T extends F>(files: T[] | undefined, clientRevisions: number): T[] {
  const del = (files ?? []).filter((f) => f.file_type === 'deliverable').sort((a, b) => a.created_at.localeCompare(b.created_at))
  const rounds = del.map((f) => f.review_round).filter((r): r is number => r != null)
  if (rounds.length) {
    const latest = Math.max(...rounds)
    return del.filter((f) => f.review_round === latest)
  }
  if (!del.length) return []
  return clientRevisions === 0 ? del : [del[del.length - 1]]
}

/** Comments to show on one version: those made on it, plus older ones that
 *  aren't tied to another current version (earlier rounds, pre-020). */
export function commentsForVersion<C extends Pick<TimelineComment, 'file_id'>>(comments: C[], versionId: string, versionIds: string[]): C[] {
  return comments.filter((c) => !c.file_id || c.file_id === versionId || !versionIds.includes(c.file_id))
}
