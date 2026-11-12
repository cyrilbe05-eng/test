// Colours of the design system: client marks, editor avatars, status halos.

export const hexA = (h: string, a: number) => {
  const n = parseInt(h.slice(1), 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`
}
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) }

// Client marks: [dark, light] — light is deeper so the letter stays readable.
const CLIENT_KNOWN: Record<string, [string, string]> = {
  'Atlas Fitness': ['#8D9BFF', '#4F5FD6'],
  'Peak Coffee Co.': ['#F2B35B', '#A8690F'],
  'Nova Skincare': ['#F29BC4', '#BE4682'],
  'Bloom Bakery': ['#6FD3A2', '#1F8A57'],
  'Harbor Real Estate': ['#66C3E8', '#1B7DA4'],
}
const CLIENT_PALETTE: [string, string][] = [
  ['#8D9BFF', '#4F5FD6'], ['#F2B35B', '#A8690F'], ['#F29BC4', '#BE4682'], ['#6FD3A2', '#1F8A57'],
  ['#66C3E8', '#1B7DA4'], ['#C9A2FF', '#7A4FD6'], ['#FF9F80', '#B4532F'], ['#B8D46A', '#5E7A12'],
]
export function clientTint(name: string, dark: boolean) {
  const pair = CLIENT_KNOWN[name] ?? CLIENT_PALETTE[hash(name) % CLIENT_PALETTE.length]
  const c = dark ? pair[0] : pair[1]
  return { color: c, background: hexA(c, dark ? 0.14 : 0.12) }
}

const EDITOR_KNOWN: Record<string, string> = { 'Nora Cut': '#F5B07A', 'Elias Editor': '#9FAEFF', 'Sami Frames': '#79D9B6' }
const EDITOR_PASTELS = ['#F5B07A', '#9FAEFF', '#79D9B6', '#F2A7C3', '#E8D27A', '#A7D8F5', '#CDB4F5', '#B5E48C']
export const editorColor = (name: string) => EDITOR_KNOWN[name] ?? EDITOR_PASTELS[hash(name) % EDITOR_PASTELS.length]
export const initials = (name: string) => name.split(/\s+/).map((p) => p.charAt(0)).join('').slice(0, 2).toUpperCase()

