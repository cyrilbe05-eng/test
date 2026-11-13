/** A "nice" axis top (1, 2, 5 × 10ⁿ) at or above `max`, and its ticks. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1]
  const raw = max / count
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow)
  const stepInt = Math.max(1, Math.round(step))
  const top = Math.ceil(max / stepInt) * stepInt
  const ticks: number[] = []
  for (let v = 0; v <= top; v += stepInt) ticks.push(v)
  return ticks
}
