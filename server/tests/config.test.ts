import { describe, it, expect } from 'vitest'
import { config } from '../src/config'

describe('config', () => {
  it('defaults to the correct models and hint cap', () => {
    expect(config.tutorModel).toBe('claude-sonnet-5')
    expect(config.graderModel).toBe('claude-haiku-4-5')
    expect(config.problemModel).toBe('claude-sonnet-5')
    expect(config.hintCap).toBe(3)
    expect(config.port).toBe(8787)
  })
})
