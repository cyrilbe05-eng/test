// Colours of the design system: client marks, editor avatars, status halos.

export const hexA = (h: string, a: number) => {
  const n = parseInt(h.slice(1), 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`
}
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) }

// Client marks: [dark, light] — light is deeper so the letter stays readable.
const CLIENT_KNOWN: Record<string, [string, string]> = {
  'Atlas Fitness': ['#C9A2FF', '#7A4FD6'],
  'Peak Coffee Co.': ['#F2B35B', '#A8690F'],
  'Nova Skincare': ['#F29BC4', '#BE4682'],
  'Bloom Bakery': ['#6FD3A2', '#1F8A57'],
  'Harbor Real Estate': ['#66C3E8', '#1B7DA4'],
}
const CLIENT_PALETTE: [string, string][] = [
  ['#C9A2FF', '#7A4FD6'], ['#F2B35B', '#A8690F'], ['#F29BC4', '#BE4682'], ['#6FD3A2', '#1F8A57'],
  ['#66C3E8', '#1B7DA4'], ['#E89AC0', '#B04A7C'], ['#FF9F80', '#B4532F'], ['#B8D46A', '#5E7A12'],
]
/** Both themes' colours, so the page can switch theme without re-rendering. */
export function clientTintBoth(name: string) {
  const pair = CLIENT_KNOWN[name] ?? CLIENT_PALETTE[hash(name) % CLIENT_PALETTE.length]
  return { dark: pair[0], darkBg: hexA(pair[0], 0.14), light: pair[1], lightBg: hexA(pair[1], 0.12) }
}

const EDITOR_KNOWN: Record<string, string> = { 'Nora Cut': '#F5B07A', 'Elias Editor': '#C9B6F2', 'Sami Frames': '#79D9B6' }
const EDITOR_PASTELS = ['#F5B07A', '#C9B6F2', '#79D9B6', '#F2A7C3', '#E8D27A', '#F2C9A0', '#B5E48C', '#E6B8E0']
export const editorColor = (name: string) => EDITOR_KNOWN[name] ?? EDITOR_PASTELS[hash(name) % EDITOR_PASTELS.length]
export const initials = (name: string) => name.split(/\s+/).map((p) => p.charAt(0)).join('').slice(0, 2).toUpperCase()

