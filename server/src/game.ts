import type { Card } from './store/types'

export interface Tile {
  cardId: string
  kind: 'term' | 'def'
  text: string
}

// Two tiles per card (its term and its definition), shuffled with an injected rng.
export function buildBoard(cards: Card[], rng: () => number = Math.random): Tile[] {
  const tiles: Tile[] = cards.flatMap((c) => [
    { cardId: c.id, kind: 'term' as const, text: c.term },
    { cardId: c.id, kind: 'def' as const, text: c.definition },
  ])
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[tiles[i], tiles[j]] = [tiles[j], tiles[i]]
  }
  return tiles
}

export function updatePersonalBest(
  current: number | undefined,
  seconds: number,
): { personalBest: number; isNewBest: boolean } {
  if (current === undefined || seconds < current) return { personalBest: seconds, isNewBest: true }
  return { personalBest: current, isNewBest: false }
}
