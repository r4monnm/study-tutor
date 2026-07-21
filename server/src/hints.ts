export function nextHintLevel(current: number, cap: number): number {
  return Math.min(current + 1, cap)
}

export function atCap(level: number, cap: number): boolean {
  return level >= cap
}
