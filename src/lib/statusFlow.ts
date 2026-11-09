// Project stages, in order — shared by the admin board and the API.
// "Backwards" = to an earlier stage outside the normal flow (e.g. Completed
// back to In Progress). Backward moves ask for a confirm on the board and
// never send notifications. Normal-flow steps (incl. sending a video back for
// revision) notify as they always have.

export type Status =
  | 'pending_assignment' | 'in_progress' | 'in_review' | 'admin_approved'
  | 'client_reviewing' | 'revision_requested' | 'client_approved'

const RANK: Record<Status, number> = {
  pending_assignment: 0,
  in_progress: 1,
  revision_requested: 1, // the editor is back at work
  in_review: 2,
  admin_approved: 3,
  client_reviewing: 4,
  client_approved: 5,
}

/** The everyday flow (what the board allowed before). */
const NORMAL: Partial<Record<Status, Status[]>> = {
  pending_assignment: ['in_progress'],
  in_progress: ['in_review', 'admin_approved'],
  in_review: ['admin_approved', 'revision_requested'],
  admin_approved: ['client_reviewing', 'revision_requested'],
  client_reviewing: ['client_approved', 'revision_requested'],
  revision_requested: ['in_progress', 'in_review'],
}

export function isBackward(from: string, to: string): boolean {
  if (from === to) return false
  if (NORMAL[from as Status]?.includes(to as Status)) return false
  const a = RANK[from as Status], b = RANK[to as Status]
  return a !== undefined && b !== undefined && b < a
}
