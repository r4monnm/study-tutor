import { describe, it, expect } from 'vitest'
import { appendSandwich, TUTOR_SANDWICH, NOTES_SANDWICH } from '../src/sandwich'

describe('appendSandwich', () => {
  it('appends the reminder to the last user turn', () => {
    const out = appendSandwich([{ role: 'assistant', content: 'q' }, { role: 'user', content: 'a' }], TUTOR_SANDWICH)
    expect(out).toHaveLength(2)
    expect(out[1].content).toBe(`a\n\n${TUTOR_SANDWICH}`)
  })

  it('adds a trailing user turn when the last turn is an assistant', () => {
    const out = appendSandwich([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }], NOTES_SANDWICH)
    expect(out).toHaveLength(3)
    expect(out[2]).toEqual({ role: 'user', content: NOTES_SANDWICH })
  })

  it('handles an empty message list', () => {
    expect(appendSandwich([], TUTOR_SANDWICH)).toEqual([{ role: 'user', content: TUTOR_SANDWICH }])
  })

  it('the tutor reminder reiterates the no-answer rule', () => {
    expect(TUTOR_SANDWICH).toContain('Never reveal the final answer')
    expect(TUTOR_SANDWICH).toContain('<system-reminder>')
  })
})
