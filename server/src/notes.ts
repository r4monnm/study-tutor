import { notesSystemPrompt } from './prompts/notes'
import { appendSandwich, NOTES_SANDWICH } from './sandwich'
import type { ChatTurn } from './store/types'

export function buildNotesContext(inp: {
  topic: string
  modeInstructions: string
  history: ChatTurn[]
}): { system: string[]; messages: ChatTurn[] } {
  const system = [notesSystemPrompt({ topic: inp.topic, modeInstructions: inp.modeInstructions })]
  const raw: ChatTurn[] = inp.history.length ? inp.history : [{ role: 'user', content: 'Begin.' }]
  const ordered: ChatTurn[] =
    raw[0].role === 'assistant' ? [{ role: 'user', content: 'Begin.' }, ...raw] : raw
  const messages = appendSandwich(ordered, NOTES_SANDWICH)
  return { system, messages }
}
