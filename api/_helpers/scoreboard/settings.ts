// Per-client scoreboard tuning (admin-editable). Same shape and defaults as
// the Pingu Finance tool's scoreboard-client-settings.ts; here the rows live
// in scoreboard_client_settings (migration 022) and are loaded in data.ts.

export interface ClientScoringSettings {
  /** Multiplies this client's videos toward an editor's ranking total only —
   *  never the per-video score, the average or the video count. */
  coefficient: number;
  /** Hours of In Progress time before the time-penalty ladder starts. */
  timeTargetHours: number;
}

export const DEFAULT_CLIENT_SCORING_SETTINGS: ClientScoringSettings = {
  coefficient: 1.0,
  timeTargetHours: 3,
}
