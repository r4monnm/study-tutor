import { describe, it, expect } from 'vitest'
import { FakeLlm } from './helpers/fakeLlm'

describe('FakeLlm', () => {
  it('returns queued json and records the request', async () => {
    const llm = new FakeLlm()
    llm.jsonResponses.push({ ok: true })
    const out = await llm.completeJson<{ ok: boolean }>({ model: 'm', system: 's', user: 'u', schema: {} })
    expect(out.ok).toBe(true)
    expect(llm.lastJsonRequest?.user).toBe('u')
  })

  it('streams tokens and returns the full reply', async () => {
    const llm = new FakeLlm()
    llm.streamReply = 'hello world'
    const tokens: string[] = []
    const full = await llm.streamText({ model: 'm', system: [], messages: [] }, (t) => tokens.push(t))
    expect(full).toBe('hello world')
    expect(tokens.join('')).toBe('hello world')
  })
})
