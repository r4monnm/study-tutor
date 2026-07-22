import { randomUUID } from 'node:crypto'
import { config } from './config'
import type { Llm } from './llm/types'
import type { Card } from './store/types'

export const DECK_SYSTEM = `You generate a study deck of term/definition cards for a topic, for a flashcard and matching game.
- Produce 8 to 10 cards.
- "term": a concise term, concept, or prompt.
- "definition": its correct definition or answer, one or two sentences.
Keep terms distinct and definitions self-contained.`

export const DECK_SCHEMA = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          term: { type: 'string' },
          definition: { type: 'string' },
        },
        required: ['term', 'definition'],
        additionalProperties: false,
      },
    },
  },
  required: ['cards'],
  additionalProperties: false,
} as const

export async function generateDeck(llm: Llm, topic: string): Promise<Card[]> {
  const raw = await llm.completeJson<{ cards: { term: string; definition: string }[] }>({
    model: config.problemModel,
    system: DECK_SYSTEM,
    user: `Topic: ${topic}\nGenerate the deck now.`,
    schema: DECK_SCHEMA,
    maxTokens: 2048,
  })
  return raw.cards.map((c) => ({ id: randomUUID(), ...c }))
}
