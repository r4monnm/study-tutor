import { describe, it, expect } from 'vitest'
import { tutorSystemPrompt } from '../src/prompts/tutor'
import { GRADER_SYSTEM } from '../src/prompts/grader'
import { modeInstructions } from '../src/modes/index'

describe('prompts + modes', () => {
  it('tutor prompt fills topic/mode/instructions and reiterates the rule at the end', () => {
    const p = tutorSystemPrompt({ mode: 'quiz', topic: 'algebra', modeInstructions: 'QUIZ_MODE_TEXT' })
    expect(p).toContain('STUDYING algebra in quiz mode')
    expect(p).toContain('QUIZ_MODE_TEXT')
    expect(p.trimEnd().endsWith('Guide, don\'t solve.')).toBe(true)
  })

  it('grader prompt demands strict JSON and conservatism', () => {
    expect(GRADER_SYSTEM).toContain('understanding_demonstrated')
    expect(GRADER_SYSTEM).toContain('Be conservative')
  })

  it('quiz and notes modes are active', () => {
    expect(modeInstructions('quiz')).toContain('QUIZ mode')
    expect(modeInstructions('notes')).toContain('NOTES mode')
  })
})
