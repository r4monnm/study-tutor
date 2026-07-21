import { describe, it, expect } from 'vitest'
import { grade } from '../src/grader'
import { FakeLlm } from './helpers/fakeLlm'

describe('grade', () => {
  it('uses the grader model and passes the attempt + approach to the grader', async () => {
    const llm = new FakeLlm()
    llm.jsonResponses.push({ understanding_demonstrated: false, reason: 'vague', next_hint: 'consider the units' })
    const verdict = await grade(llm, {
      question: 'q', correct_approach: 'divide', correct_answer: 'SECRET42', attempt: 'idk',
    })
    expect(verdict.understanding_demonstrated).toBe(false)
    expect(verdict.next_hint).toBe('consider the units')
    expect(llm.lastJsonRequest?.model).toBe('claude-haiku-4-5')
    expect(llm.lastJsonRequest?.user).toContain('divide')
    expect(llm.lastJsonRequest?.user).toContain('idk')
  })
})
