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

  it('kicks off with a user turn (carrying the sandwich) when there is no history', () => {
    const ctx = buildTutorContext(base)
    expect(ctx.messages).toHaveLength(1)
    expect(ctx.messages[0].role).toBe('user')
    expect(ctx.messages[0].content).toContain('Begin.')
    expect(ctx.messages[0].content).toContain('<system-reminder>')
  })

  it('always yields a messages array beginning with a user turn (API requires it)', () => {
    const assistantLedHistory = [
      { role: 'assistant' as const, content: 'Posed question' },
      { role: 'user' as const, content: 'my attempt' },
    ]
    const ctx = buildTutorContext({ ...base, history: assistantLedHistory, graderHint: 'nudge', hintLevel: 1 })
    expect(ctx.messages[0].role).toBe('user')
    // history is preserved after the synthetic opener (with sandwich appended)
    expect(ctx.messages.some((m) => m.content.includes('my attempt'))).toBe(true)
  })

  it('appends the no-answer sandwich after the user turn when locked', () => {
    const ctx = buildTutorContext({ ...base, history: [{ role: 'user', content: 'my attempt' }] })
    const last = ctx.messages[ctx.messages.length - 1]
    expect(last.role).toBe('user')
    expect(last.content).toContain('my attempt')
    expect(last.content.indexOf('my attempt')).toBeLessThan(last.content.indexOf('<system-reminder>'))
  })

  it('does NOT append the sandwich on a reveal turn', () => {
    const ctx = buildTutorContext({ ...base, reveal: { answer: 'x = 4', approach: 'subtract 3' } })
    expect(JSON.stringify(ctx.messages)).not.toContain('<system-reminder>')
  })
})
