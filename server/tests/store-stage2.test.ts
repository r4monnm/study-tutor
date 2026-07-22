import { describe, it, expect } from 'vitest'
import { MemoryStore } from '../src/store/memory'
import type { Deck } from '../src/store/types'

const deck: Deck = { topic: 'algebra', cards: [{ id: 'c1', term: 'variable', definition: 'a named value' }] }

describe('MemoryStore stage 2', () => {
  it('initializes empty mastery + personalBests on a new session', () => {
    const s = new MemoryStore().createSession()
    expect(s.personalBests).toEqual({})
    expect(s.deck).toBeUndefined()
  })

  it('stores and reads a deck', () => {
    const store = new MemoryStore(); const s = store.createSession()
    store.putDeck(s.id, deck)
    expect(store.getDeck(s.id)?.cards[0].term).toBe('variable')
  })

  it('stores and reads a per-topic personal best', () => {
    const store = new MemoryStore(); const s = store.createSession()
    expect(store.getPersonalBest(s.id, 'algebra')).toBeUndefined()
    store.setPersonalBest(s.id, 'algebra', 42)
    expect(store.getPersonalBest(s.id, 'algebra')).toBe(42)
  })
})
