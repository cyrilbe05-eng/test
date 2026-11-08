// Free, local text matching for revision notes — two interchangeable engines:
//
//  1. "model": the open-source all-MiniLM-L6-v2 sentence model (models/),
//     run inside the app by @huggingface/transformers. No external service,
//     no API key, remote downloads disabled. Understands meaning
//     ("make the subtitles bigger" ≈ "captions too small").
//  2. "words": word matching with synonyms — used automatically whenever the
//     model can't load (e.g. not packaged on the host). Zero dependencies.
//
// Set CARE_SIMILARITY=words to force the fallback.

import path from 'node:path'
import { CARE_CONFIG, REVISION_CATEGORIES, REVISION_CATEGORY_KEYS, type RevisionCategory } from './config.js'

export type EngineName = 'model' | 'words'

export interface Matcher {
  engine: EngineName
  mergeThreshold: number
  /** Best category for each note. */
  categorize(notes: string[]): Promise<RevisionCategory[]>
  /** Similarity (0–1) of `note` to each candidate text. */
  similarity(note: string, candidates: string[]): Promise<number[]>
}

/** Remove the "[00:12] — " / "[00:12–00:20] — " timestamp prefix the player adds. */
export function cleanNote(text: string): string {
  return text.replace(/^\s*\[[^\]]*\]\s*[—–-]\s*/, '').trim()
}

// ── Words engine ────────────────────────────────────────────────────────────

const STOPWORDS = new Set(('a an the and or but of to in on at for with from by is are was were be been it its this that these those '
  + 'can could would should please we our us you your i me my so too very more less bit just also as if then than there here '
  + 'make made do does did have has had get got need needs want like little lot some any all not no').split(' '))

/** Words that mean the same thing for our purposes → one canonical form. */
const SYNONYMS: Record<string, string> = {
  subtitle: 'caption', subtitles: 'caption', subs: 'caption', captions: 'caption', text: 'caption',
  color: 'colour', colors: 'colour', colours: 'colour',
  song: 'music', track: 'music', soundtrack: 'music', tune: 'music',
  bigger: 'big', larger: 'big', large: 'big', small: 'big', smaller: 'big', size: 'big',
  louder: 'loud', quieter: 'loud', quiet: 'loud', volume: 'loud', lower: 'loud',
  faster: 'speed', slower: 'speed', slow: 'speed', fast: 'speed', quicker: 'speed', quick: 'speed', drags: 'speed', drag: 'speed', tighten: 'speed', snappy: 'speed',
  beginning: 'start', opening: 'start', intro: 'start', starts: 'start', open: 'start',
  footage: 'shot', shots: 'shot', clip: 'shot', clips: 'shot',
  brighter: 'bright', brightness: 'bright', darker: 'bright', dark: 'bright',
}

function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

export function tokens(text: string): string[] {
  const t = cleanNote(text).toLowerCase()
    .replace(/b[\s-]?roll/g, 'broll')
    .replace(/close[\s-]?ups?/g, 'closeup')
    .replace(/end[\s-]?cards?/g, 'endcard')
  const out: string[] = []
  for (const raw of t.split(/[^a-z0-9]+/)) {
    if (raw.length < 2 || STOPWORDS.has(raw)) continue
    out.push(SYNONYMS[raw] ?? SYNONYMS[stem(raw)] ?? stem(raw))
  }
  return out
}

/** Dice similarity of the two notes' word sets (0–1). */
export function wordsSimilarity(a: string, b: string): number {
  const A = new Set(tokens(a)); const B = new Set(tokens(b))
  if (!A.size || !B.size) return 0
  let shared = 0
  for (const w of A) if (B.has(w)) shared++
  return (2 * shared) / (A.size + B.size)
}

const CATEGORY_WORDS = new Map(REVISION_CATEGORY_KEYS.map((k) => [k, new Set(
  (REVISION_CATEGORIES[k].words as readonly string[]).flatMap((w) => [w, stem(w), SYNONYMS[w] ?? w]),
)]))

export function wordsCategory(note: string): RevisionCategory {
  const raw = cleanNote(note).toLowerCase()
    .replace(/b[\s-]?roll/g, 'broll').replace(/close[\s-]?ups?/g, 'closeup').replace(/end[\s-]?cards?/g, 'endcard')
    .split(/[^a-z0-9]+/).filter(Boolean)
  const words = new Set([...raw, ...raw.map(stem)])
  let best: RevisionCategory = 'other'
  let bestScore = 0
  for (const k of REVISION_CATEGORY_KEYS) {
    let score = 0
    for (const w of words) if (CATEGORY_WORDS.get(k)!.has(w)) score++
    if (score > bestScore) { best = k; bestScore = score }
  }
  return best
}

const wordsMatcher: Matcher = {
  engine: 'words',
  mergeThreshold: CARE_CONFIG.sop.wordsMergeThreshold,
  categorize: async (notes) => notes.map(wordsCategory),
  similarity: async (note, candidates) => candidates.map((c) => wordsSimilarity(note, c)),
}

// ── Model engine ────────────────────────────────────────────────────────────

type Embed = (texts: string[]) => Promise<number[][]>
let modelLoad: Promise<Embed | null> | null = null
let modelError: string | null = null

function modelDir(): string {
  return process.env.CARE_MODEL_DIR ?? path.join(process.cwd(), 'models')
}

async function loadModel(): Promise<Embed | null> {
  try {
    // Non-literal specifier: kept out of the API bundle and only loaded when
    // first needed. Any failure here just means "use the words engine".
    const pkg = '@huggingface/transformers'
    const { pipeline, env } = await import(pkg)
    env.allowRemoteModels = false          // never download at runtime
    env.allowLocalModels = true
    env.localModelPath = modelDir()
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { device: 'cpu', dtype: 'q8' })
    return async (texts: string[]) => (await extractor(texts, { pooling: 'mean', normalize: true })).tolist() as number[][]
  } catch (e: any) {
    modelError = e?.message ?? String(e)
    console.warn('[care] local model unavailable — using word matching:', modelError)
    return null
  }
}

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0)

function modelMatcher(embed: Embed): Matcher {
  const cache = new Map<string, number[]>()
  const vectors = async (texts: string[]) => {
    const missing = [...new Set(texts.filter((t) => !cache.has(t)))]
    if (missing.length) (await embed(missing)).forEach((v, i) => cache.set(missing[i], v))
    return texts.map((t) => cache.get(t)!)
  }
  let categoryVectors: number[][] | null = null
  return {
    engine: 'model',
    mergeThreshold: CARE_CONFIG.sop.modelMergeThreshold,
    async categorize(notes) {
      categoryVectors ??= await embed(REVISION_CATEGORY_KEYS.map((k) => REVISION_CATEGORIES[k].description))
      const vs = await vectors(notes.map(cleanNote))
      return vs.map((v) => {
        const scores = categoryVectors!.map((c) => dot(v, c))
        return REVISION_CATEGORY_KEYS[scores.indexOf(Math.max(...scores))]
      })
    },
    async similarity(note, candidates) {
      if (!candidates.length) return []
      const [v, ...cs] = await vectors([cleanNote(note), ...candidates.map(cleanNote)])
      return cs.map((c) => dot(v, c))
    },
  }
}

/** The best available matcher (the model is loaded once per server process). */
export async function getMatcher(): Promise<Matcher> {
  if (process.env.CARE_SIMILARITY === 'words') return wordsMatcher
  modelLoad ??= loadModel()
  const embed = await modelLoad
  return embed ? modelMatcher(embed) : wordsMatcher
}

export function lastModelError(): string | null {
  return modelError
}
