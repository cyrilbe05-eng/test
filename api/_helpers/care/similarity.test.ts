// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { cleanNote, tokens, wordsSimilarity, wordsCategory, getMatcher } from './similarity'
import { chooseRule } from './sop'
import { CARE_CONFIG } from './config'

const NOTES: [string, string][] = [
  ['Captions are too small on mobile', 'captions'], ['Typo in the subtitle at the end', 'captions'],
  ['The first 3 seconds need a stronger hook', 'hook'],
  ['Music is too loud over the voice', 'music'], ['Can we use a more upbeat track?', 'music'],
  ['Colours look washed out', 'colour'], ['Skin tones are too orange', 'colour'],
  ['Add more shots of the shop', 'b-roll'], ['Use the drone footage we sent', 'b-roll'],
  ['Logo should be in the corner the whole time', 'branding'], ['Wrong brand colour on the end card', 'branding'],
  ['The middle drags a bit, can we tighten it?', 'pacing'], ['Cuts feel too slow at the start', 'pacing'],
  ['Can you remove the part with the dog?', 'other'],
]

describe('cleanNote', () => {
  it('strips the player timestamp prefix', () => {
    expect(cleanNote('[00:12] — Music too loud')).toBe('Music too loud')
    expect(cleanNote('[00:12–00:20] — Speed it up')).toBe('Speed it up')
    expect(cleanNote('No prefix here')).toBe('No prefix here')
  })
})

describe('word-matching fallback', () => {
  it('normalises synonyms', () => {
    expect(tokens('Make the subtitles bigger')).toEqual(['caption', 'big'])
    expect(tokens('Captions are too small')).toEqual(['caption', 'big'])
  })

  it('merges reworded notes and keeps different requests apart', () => {
    const t = CARE_CONFIG.sop.wordsMergeThreshold
    expect(wordsSimilarity('Captions are too small on mobile', 'Please make the subtitles bigger on mobile')).toBeGreaterThanOrEqual(t)
    expect(wordsSimilarity('Music is too loud over the voice', 'Lower the music under the voice')).toBeGreaterThanOrEqual(t)
    expect(wordsSimilarity('Captions are too small', 'Music is too loud')).toBeLessThan(t)
    expect(wordsSimilarity('Colours look washed out', 'Add more shots of the shop')).toBe(0)
  })

  it('picks a sensible category for most notes', () => {
    const right = NOTES.filter(([n, c]) => wordsCategory(n) === c).length
    expect(right).toBeGreaterThanOrEqual(12)
    expect(wordsCategory('Something completely unrelated happened')).toBe('other')
  })
})

describe('chooseRule', () => {
  it('merges into the most similar rule above the threshold, else creates a new one', () => {
    expect(chooseRule([0.2, 0.7, 0.5], 0.45)).toBe(1)
    expect(chooseRule([0.2, 0.3], 0.45)).toBeNull()
    expect(chooseRule([], 0.45)).toBeNull()
  })
})

describe('local model (all-MiniLM-L6-v2)', async () => {
  const matcher = await getMatcher()

  it('loads from models/ without any network access', () => {
    expect(matcher.engine).toBe('model')
  })

  it('categorises realistic revision notes', async () => {
    const picked = await matcher.categorize(NOTES.map(([n]) => `[00:05] — ${n}`))
    const right = picked.filter((c, i) => c === NOTES[i][1]).length
    expect(right).toBeGreaterThanOrEqual(13)
  }, 30_000)

  it('merges same-meaning notes and never merges different requests', async () => {
    const t = matcher.mergeThreshold
    const [same1] = await matcher.similarity('Captions are too small on mobile', ['Please make the subtitles bigger'])
    const [same2] = await matcher.similarity('Logo should be in the corner the whole time', ['Keep our logo visible throughout'])
    const [diff1] = await matcher.similarity('Make the captions bigger', ['Typo in the subtitle at the end'])
    const [diff2] = await matcher.similarity('Captions are too small on mobile', ['Music is too loud over the voice'])
    expect(same1).toBeGreaterThanOrEqual(t)
    expect(same2).toBeGreaterThanOrEqual(t)
    expect(diff1).toBeLessThan(t)
    expect(diff2).toBeLessThan(t)
  }, 30_000)
})
