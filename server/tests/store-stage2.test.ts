import { describe, it, expect } from 'vitest'
import { MemoryStore } from '../src/store/memory'
import type { Deck, MasteryState } from '../src/store/types'

const deck: Deck = { topic: 'algebra', cards: [{ id: 'c1', term: 'variable', definition: 'a named value' }] }
const state: MasteryState = { box: 2, attempts: 3, correct: 2, history: [true, false, true], lastSeenAt: 100 }

describe('MemoryStore stage 2', () => {
  it('initializes empty mastery + personalBests on a new session', () => {
    const s = new MemoryStore().createSession()
    expect(s.mastery).toEqual({})
    expect(s.personalBests).toEqual({})
    expect(s.deck).toBeUndefined()
  })

  it('stores and reads a deck', () => {
    const store = new MemoryStore(); const s = store.createSession()
    store.putDeck(s.id, deck)
    expect(store.getDeck(s.id)?.cards[0].term).toBe('variable')
  })

  it('stores and reads mastery per card', () => {
    const store = new MemoryStore(); const s = store.createSession()
    expect(store.getMastery(s.id, 'c1')).toBeUndefined()
    store.setMastery(s.id, 'c1', state)
    expect(store.getMastery(s.id, 'c1')?.box).toBe(2)
    expect(store.getAllMastery(s.id)).toEqual({ c1: state })
  })

  it('stores and reads a per-topic personal best', () => {
    const store = new MemoryStore(); const s = store.createSession()
    expect(store.getPersonalBest(s.id, 'algebra')).toBeUndefined()
    store.setPersonalBest(s.id, 'algebra', 42)
    expect(store.getPersonalBest(s.id, 'algebra')).toBe(42)
  })
})
