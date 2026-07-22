import { describe, it, expect } from 'vitest'
import { buildBoard, updatePersonalBest, type Tile } from '../src/game'
import type { Card } from '../src/store/types'

const cards: Card[] = Array.from({ length: 6 }, (_, i) => ({
  id: `c${i}`, term: `T${i}`, definition: `D${i}`,
}))

describe('game logic', () => {
  it('builds a board of 2 tiles per card (term + def), all from the input', () => {
    const board = buildBoard(cards, () => 0) // deterministic rng
    expect(board).toHaveLength(12)
    expect(board.filter((t) => t.kind === 'term')).toHaveLength(6)
    expect(board.filter((t) => t.kind === 'def')).toHaveLength(6)
    const ids = new Set(board.map((t) => t.cardId))
    expect(ids).toEqual(new Set(cards.map((c) => c.id)))
  })

  it('shuffles deterministically given an injected rng', () => {
    const a = buildBoard(cards, () => 0).map((t) => `${t.cardId}:${t.kind}`)
    const b = buildBoard(cards, () => 0).map((t) => `${t.cardId}:${t.kind}`)
    expect(a).toEqual(b) // same rng -> same order
  })

  it('records the first result as a new best', () => {
    expect(updatePersonalBest(undefined, 30)).toEqual({ personalBest: 30, isNewBest: true })
  })

  it('reports an improvement and ignores a worse time', () => {
    expect(updatePersonalBest(30, 25)).toEqual({ personalBest: 25, isNewBest: true })
    expect(updatePersonalBest(30, 40)).toEqual({ personalBest: 30, isNewBest: false })
  })
})
