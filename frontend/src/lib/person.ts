// Deterministic per-person color: the same flatmate wears the same color
// everywhere in the app. Muted tones that hold up on white.

const palette = [
  'bg-emerald-600',
  'bg-sky-600',
  'bg-violet-600',
  'bg-rose-600',
  'bg-amber-600',
  'bg-teal-600',
  'bg-indigo-600',
  'bg-orange-600',
]

export function personColor(name: string) {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 997
  return palette[h % palette.length]
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
