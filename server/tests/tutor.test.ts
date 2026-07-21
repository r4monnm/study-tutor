import { describe, it, expect } from 'vitest'
import { buildTutorContext, type TutorContextInput } from '../src/tutor'

const base: TutorContextInput = {
  topic: 'algebra', mode: 'quiz', modeInstructions: 'QUIZ',
  question: 'Solve x + 3 = 7', history: [], hintLevel: 0, hintCap: 3,
  graderHint: '', reveal: null,
}

describe('buildTutorContext', () => {
  it('NEVER contains the answer while the gate is locked', () => {
    const ctx = buildTutorContext({ ...base, graderHint: 'isolate x', hintLevel: 2 })
    const serialized = JSON.stringify(ctx)
    expect(serialized).not.toContain('FOUR')
    expect(serialized).not.toContain('x = 4')
  })

  it('includes the answer ONLY when reveal is set (gate unlocked)', () => {
    const ctx = buildTutorContext({ ...base, reveal: { answer: 'x = 4', approach: 'subtract 3' } })
    expect(JSON.stringify(ctx)).toContain('x = 4')
  })

  it('adds the parallel-example directive at the hint cap', () => {
    const ctx = buildTutorContext({ ...base, graderHint: 'try again', hintLevel: 3 })
    expect(JSON.stringify(ctx)).toContain('PARALLEL example')
  })

  it('kicks off with a Begin turn when there is no history', () => {
    const ctx = buildTutorContext(base)
    expect(ctx.messages).toEqual([{ role: 'user', content: 'Begin.' }])
  })

  it('always yields a messages array beginning with a user turn (API requires it)', () => {
    const assistantLedHistory = [
      { role: 'assistant' as const, content: 'Posed question' },
      { role: 'user' as const, content: 'my attempt' },
    ]
    const ctx = buildTutorContext({ ...base, history: assistantLedHistory, graderHint: 'nudge', hintLevel: 1 })
    expect(ctx.messages[0].role).toBe('user')
    // history is preserved after the synthetic opener
    expect(ctx.messages.some((m) => m.content === 'my attempt')).toBe(true)
  })
})
