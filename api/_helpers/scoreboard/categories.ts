// Revision note categories — copied from the Pingu Finance tool (src/lib/types.ts).

export const REVISION_NOTE_CATEGORIES = [
  "silences",
  "pacing",
  "captions",
  "colour",
  "music",
  "hook",
  "b_roll",
  "transitions",
  "text_placement",
  "aspect_ratio",
  "audio_levels",
  "cut_selection",
  "branding",
  "export_settings",
  // Added September 2026: "change what the on-screen/spoken text says" is a
  // real, common feedback type (typos, wrong words, dialogue swaps) that has
  // nothing to do with how captions look — it was previously being forced
  // into "captions" for lack of anywhere else to put it.
  "script_wording",
  "other",
] as const;
export type RevisionNoteCategory = (typeof REVISION_NOTE_CATEGORIES)[number];
