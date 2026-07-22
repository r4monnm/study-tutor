import { describe, it, expect } from 'vitest'
import { MemoryStore } from '../src/store/memory'
import type { Deck } from '../src/store/types'

const deck: Deck = { topic: 'algebra', cards: [{ id: 'c1', term: 'variable', definition: 'a named value' }] }

describe('MemoryStore stage 2', () => {
  it('initializes a new session with no deck', async () => {
    const s = await new MemoryStore().createSession()
    expect(s.deck).toBeUndefined()
  })

  it('stores and reads a deck', async () => {
    const store = new MemoryStore(); const s = await store.createSession()
    await store.putDeck(s.id, deck)
    expect((await store.getDeck(s.id))?.cards[0].term).toBe('variable')
  })
})
