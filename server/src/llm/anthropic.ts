import Anthropic from '@anthropic-ai/sdk'
import type { Llm, JsonRequest, StreamRequest } from './types'

export class AnthropicLlm implements Llm {
  private client = new Anthropic() // reads ANTHROPIC_API_KEY / ant profile

  async completeJson<T>(req: JsonRequest): Promise<T> {
    const params = {
      model: req.model,
      max_tokens: req.maxTokens ?? 1024,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
      output_config: { format: { type: 'json_schema', schema: req.schema } },
    }
    const res = (await this.client.messages.create(params as any)) as Anthropic.Message
    const block = res.content.find((b) => b.type === 'text')
    const text = block && block.type === 'text' ? block.text : ''
    return JSON.parse(text) as T
  }

  async streamText(req: StreamRequest, onToken: (t: string) => void): Promise<string> {
    const params = {
      model: req.model,
      max_tokens: req.maxTokens ?? 2048,
      system: req.system.map((text) => ({ type: 'text', text })),
      messages: req.messages,
      ...(req.adaptiveThinking ? { thinking: { type: 'adaptive' } } : {}),
    }
    const stream = this.client.messages.stream(params as any)
    let full = ''
    stream.on('text', (delta: string) => {
      full += delta
      onToken(delta)
    })
    await stream.finalMessage()
    return full
  }
}
