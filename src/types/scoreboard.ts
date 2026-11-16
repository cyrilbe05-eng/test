// Shapes returned by GET /api/scoreboard (api/_helpers/scoreboard/data.ts).

export type ScoreCategory =
  | 'base' | 'revisionPenalty' | 'revisionRecovery' | 'slowRevision' | 'inProgressTime'
  | 'warningHalving' | 'inProgressBypass' | 'floor' | 'manualAdjustment'

export interface ScoreLine { category: ScoreCategory; amount: number; detail: string }

export interface BoardRow {
  editorId: string
  name: string
  rank: number
  totalPoints: number
  videoCount: number
  videoAverage: number | null
  finalScore: number | null
  eligible: boolean
  isWinner: boolean
  provisional: boolean
  firstTryRate: number | null
  flaggedCount: number
  breakdown: { baseEarned: number; revisionLosses: number; timeLosses: number; manualAdjustment: number }
}

export interface ScoredVideo {
  projectId: string
  title: string
  clientId: string
  clientName: string
  editorId: string
  deliveredAt: string
  score: number
  coefficient: number
  points: number
  isFirstVideo: boolean
  flagged: boolean
  revisionCount: number
  breakdown: ScoreLine[]
  adjustment: { amount: number; reason: string | null } | null
}

export interface ClientScoreSetting { clientId: string; name: string; videoCount: number; coefficient: number; timeTargetHours: number; isDefault: boolean }

export interface Scoreboard {
  month: string
  months: string[]
  rules: { minFinalScore: number; minVideos: number; minVideosForRanking: number }
  bonus: { amount: number; currency: string } | null
  winnerEditorId: string | null
  board: BoardRow[]
  notStarted: { editorId: string; name: string }[]
  videos: ScoredVideo[]
  clients: ClientScoreSetting[]
  /** The editor viewing (editor page); null for admins. */
  me: string | null
}
