// Copied word for word from the Pingu Finance tool (src/lib/note-category-classifier.ts); only the import path changed.
import { REVISION_NOTE_CATEGORIES, type RevisionNoteCategory } from "./categories.js";

/**
 * First-pass keyword classifier for revision comment text into
 * RevisionNoteCategory — built to answer one question before any repeat-
 * detection UI gets built on top of it: is "the same note keeps coming
 * back" a real pattern in this data, or an assumption? See
 * scripts/backtest-scoreboard.ts.
 *
 * NOT an LLM pass, despite being asked for one: as of the last check, this
 * project had no LLM API key configured (ANTHROPIC_API_KEY / OPENAI_API_KEY
 * both absent from .env) and adding a new SDK dependency without being
 * asked crosses a house rule, so there was nothing to wire a real model call
 * against. What's here instead is a substantially expanded keyword pass,
 * built by pulling ~60 real "other"-bucketed comments from the live CRM and
 * adding rules for what was actually being missed — including a real
 * category gap: "change what the on-screen/spoken text says" (typos, wrong
 * words, dialogue swaps) is common and had nowhere to go but "captions"
 * (a styling category) or "other". It now has its own category,
 * "script_wording", added to REVISION_NOTE_CATEGORIES for this. If an API
 * key gets added, this is the function to replace with a real batch call —
 * the shape (comment text in, one RevisionNoteCategory out) doesn't need to
 * change for that swap.
 *
 * Still a rough pass, not a validated classifier: keyword matching on
 * free-form, typo-heavy admin/client notes misfires on ambiguous text
 * ("text" alone could mean captions or text placement), and a real fraction
 * of real comments are bare fragments referencing a specific video moment
 * ("Weight", "and stand", "first sale") that no text-only method — keyword
 * or LLM — can categorize without the video itself. Rules are ordered
 * most-specific-first so a comment matching multiple categories' keywords
 * lands on the more specific one. Treat category counts from this as
 * directional, not exact — good enough to answer "does silences come back
 * for this editor-client pair," not good enough to drive per-category
 * scoring without a human spot-check.
 */

interface CategoryRule {
  category: RevisionNoteCategory;
  keywords: RegExp[];
}

const RULES: CategoryRule[] = [
  { category: "silences", keywords: [/\bsilen(t|ce)/i, /\bdead ?air\b/i, /\bcut the pause/i] },
  {
    category: "b_roll",
    keywords: [/\bb[\s-]?roll/i, /\bstock footage\b/i],
  },
  {
    category: "aspect_ratio",
    keywords: [/\baspect ratio\b/i, /\b1080\s*x\s*1920\b/i, /\bvertical(ly)? (crop|format|export)/i, /\bcrop it\b/i],
  },
  {
    category: "export_settings",
    keywords: [/\bexport(ed|ing)? (settings|resolution)/i, /\b\d+\s?fps\b/i, /\bframe rate\b/i, /\brender(ed|ing)?\b/i, /\bresolution\b/i],
  },
  {
    category: "audio_levels",
    keywords: [/\baudio level/i, /\bvolume\b/i, /\btoo (loud|quiet)\b/i, /\bmic (level|volume)\b/i, /\bnormalize audio\b/i],
  },
  {
    category: "music",
    keywords: [/\bmusic\b/i, /\bsong\b/i, /\bsoundtrack\b/i, /\b(sfx|sound effect)/i, /\bwoosh\b/i, /\bpop sfx\b/i],
  },
  {
    category: "colour",
    keywords: [/\bcolou?r(ing|s)?\b/i, /\bgrad(e|ing)\b/i, /\bsaturation\b/i, /\bcontrast\b/i, /\bexposure\b/i, /\bwhite balance\b/i],
  },
  {
    category: "hook",
    keywords: [/\bhook\b/i, /\bintro\b/i, /\bopening line\b/i, /\bfirst (3|three) seconds\b/i, /\bstart(s|ing)? (stronger|weak)/i],
  },
  {
    category: "transitions",
    keywords: [/\btransition/i, /\bjump cut\b/i, /\bcut between\b/i],
  },
  {
    category: "text_placement",
    keywords: [
      /\btext (placement|position|animat)/i,
      /\btitle (placement|position)/i,
      /\bbehind her head\b/i,
      /\bbehind his head\b/i,
      /\babove her head\b/i,
      /\bon her face\b/i,
      /\bput the (title|text|word)/i,
      /\bone line\b/i,
      /\bmultiple lines? text\b/i,
      /\bcentered\b/i,
      /\baligned\b/i,
    ],
  },
  {
    // Dialogue/script wording corrections — what the text SAYS, not how it
    // looks. Its own category (added September 2026); checked before
    // "captions" so a comment mentioning both a wording fix and captions
    // generically still lands on the more specific wording rule.
    category: "script_wording",
    keywords: [
      /\bshould say\b/i,
      /\bshould read\b/i,
      /\bspelling mistake\b/i,
      /\bmisspell/i,
      /\bswap with\b/i,
      /\btypo\b/i,
      /\bwrong word\b/i,
      /\bforgot the\b/i,
    ],
  },
  {
    category: "captions",
    keywords: [
      /\bcaption/i,
      /\bsubtitle/i,
      /\bin quotes\b/i,
      /\bput.*in quotes\b/i,
      /\bwhat is this font\b/i,
      /\bfont is different\b/i,
    ],
  },
  {
    category: "cut_selection",
    keywords: [
      /\bwrong clip\b/i,
      /\buse (this|that) clip\b/i,
      /\bcut selection\b/i,
      /\bwhich (take|clip)\b/i,
      /\bdon'?t use this\b/i,
      /\bglitch\b/i,
      /\bdelay here\b/i,
      /\bcut (it |this )?out\b/i,
      /\btake (this |it )?out\b/i,
      /\bcut too (early|soon|short)\b/i,
      /\bcut him\/?her off\b/i,
      /\bcut down time\b/i,
    ],
  },
  {
    category: "branding",
    keywords: [/\blogo\b/i, /\bbrand(ing)?\b/i, /\bwatermark\b/i],
  },
  {
    category: "pacing",
    keywords: [/\bpacing\b/i, /\brhythm\b/i, /\btoo (fast|slow)\b/i, /\bspeed (it )?up\b/i, /\bslow (it )?down\b/i, /\bnot smooth\b/i, /\brush(ed)?\b/i],
  },
];

/** Classifies one comment's free text into the closest matching category,
 *  "other" when nothing matches — never a confident guess dressed up as a
 *  sure thing. */
export function classifyNoteCategory(commentText: string): RevisionNoteCategory {
  const text = commentText ?? "";
  for (const rule of RULES) {
    if (rule.keywords.some((re) => re.test(text))) return rule.category;
  }
  return "other";
}

export { REVISION_NOTE_CATEGORIES };
