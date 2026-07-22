import { notesSystemPrompt } from './prompts/notes'
import type { ChatTurn } from './store/types'

export function buildNotesContext(inp: {
  topic: string
  modeInstructions: string
  history: ChatTurn[]
}): { system: string[]; messages: ChatTurn[] } {
  const system = [notesSystemPrompt({ topic: inp.topic, modeInstructions: inp.modeInstructions })]
  const raw: ChatTurn[] = inp.history.length ? inp.history : [{ role: 'user', content: 'Begin.' }]
  // Same Anthropic API requirement as the tutor: messages must start with a user turn.
  const messages: ChatTurn[] =
    raw[0].role === 'assistant' ? [{ role: 'user', content: 'Begin.' }, ...raw] : raw
  return { system, messages }
}
