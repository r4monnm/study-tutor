import { describe, it, expect } from 'vitest'
import { generateProblem } from '../src/problem'
import { FakeLlm } from './helpers/fakeLlm'

describe('generateProblem', () => {
  it('assigns an id, uses the problem model, and passes prior qTypes to avoid', async () => {
    const llm = new FakeLlm()
    llm.jsonResponses.push({
      question: 'What is a variable?', correct_answer: 'a named placeholder',
      correct_approach: 'recall the definition', qType: 'definition',
    })
    const p = await generateProblem(llm, { topic: 'algebra', priorQTypes: ['computation'] })
    expect(p.id).toBeTruthy()
    expect(p.question).toContain('variable')
    expect(llm.lastJsonRequest?.model).toBe('claude-sonnet-5')
    expect(llm.lastJsonRequest?.user).toContain('computation')
  })
})
