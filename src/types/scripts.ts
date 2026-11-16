// Shapes returned by /api/scripts (api/_helpers/scripts/routes.ts).

export type ScriptType = 'Reel' | 'Carousel' | 'Story' | 'Post'
export type ScriptStatus = 'draft' | 'in_review' | 'needs_changes' | 'approved' | 'scheduled'
export type ScriptField = 'script' | 'caption' | 'client_notes' | 'notes'

export interface Script {
  id: string
  groupId: string
  clientId: string
  title: string
  type: ScriptType
  bodyHtml: string
  /** Carousel only: slide HTML, in order. */
  slides: string[] | null
  captionHtml: string
  /** Client notes: the calendar entry's "Notes" (the client sees them). */
  clientNotesHtml: string
  /** Editor notes: never shown to clients. */
  notesHtml: string
  links: string[]
  status: ScriptStatus
  sortOrder: number
  bodyVersion: number
  captionVersion: number
  clientNotesVersion: number
  notesVersion: number
  inReviewAt: string | null
  calendarEventId: string | null
  updatedAt: string
  updatedBy: { id: string; name: string | null } | null
}

export interface ScriptGroup { id: string; name: string; scripts: Script[] }

export interface ScriptComment {
  id: string
  scriptId: string
  field: ScriptField
  parentId: string | null
  quote: string | null
  body: string
  author: { id: string | null; name: string; role: string | null }
  resolvedAt: string | null
  createdAt: string
}

export interface ScriptPage {
  client: { id: string; name: string }
  groups: ScriptGroup[]
  comments: ScriptComment[]
}

export interface ScriptPageSummary {
  clientId: string
  clientName: string
  total: number
  inReview: number
  needsChanges: number
  approved: number
  oldestInReviewAt: string | null
  lastEditAt: string | null
}

export interface ScriptsOverview {
  pages: ScriptPageSummary[]
  /** Clients a page can still be made for. */
  available: { id: string; name: string }[]
  /** Admins: scripts waiting for review, oldest first. */
  waiting: { id: string; title: string; type: ScriptType; clientId: string; clientName: string; inReviewAt: string }[]
}
