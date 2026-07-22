import { describe, it, expect } from 'vitest'
import { generateDeck } from '../src/deck'
import { FakeLlm } from './helpers/fakeLlm'

describe('generateDeck', () => {
  it('assigns ids, uses the problem model, and returns the cards', async () => {
    const llm = new FakeLlm()
    llm.jsonResponses.push({
      cards: [
        { term: 'variable', definition: 'a named value' },
        { term: 'coefficient', definition: 'a multiplier of a variable' },
      ],
    })
    const cards = await generateDeck(llm, 'algebra')
    expect(cards).toHaveLength(2)
    expect(cards[0].id).toBeTruthy()
    expect(cards[0].term).toBe('variable')
    expect(cards[0].definition).toBe('a named value')
    expect(llm.lastJsonRequest?.model).toBe('claude-sonnet-5')
    expect(llm.lastJsonRequest?.user).toContain('algebra')
  })
})
