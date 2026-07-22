import { describe, it, expect } from 'vitest'
import { buildNotesContext } from '../src/notes'
import { modeInstructions } from '../src/modes/index'

describe('notes engine', () => {
  it('builds a notes context with the topic and teaching rules, no problem/reveal', () => {
    const ctx = buildNotesContext({ topic: 'photosynthesis', modeInstructions: modeInstructions('notes'), history: [] })
    const text = JSON.stringify(ctx)
    expect(text).toContain('photosynthesis')
    expect(text).toContain('check question')
    expect(text).not.toContain('understanding check passed') // no answer-gate language
  })

  it('kicks off with a user turn when history is empty', () => {
    const ctx = buildNotesContext({ topic: 'x', modeInstructions: 'M', history: [] })
    expect(ctx.messages).toEqual([{ role: 'user', content: 'Begin.' }])
  })

  it('prepends a user turn when replayed history begins with an assistant message', () => {
    const ctx = buildNotesContext({
      topic: 'x', modeInstructions: 'M',
      history: [{ role: 'assistant', content: 'chunk 1...' }, { role: 'user', content: 'ready' }],
    })
    expect(ctx.messages[0].role).toBe('user')
  })

  it('notes mode instructions describe chunked delivery + a check question', () => {
    expect(modeInstructions('notes')).toContain('chunk')
    expect(modeInstructions('notes')).toContain('check question')
  })
})
