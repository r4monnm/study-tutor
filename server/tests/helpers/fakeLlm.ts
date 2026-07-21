import type { Llm, JsonRequest, StreamRequest } from '../../src/llm/types'

export class FakeLlm implements Llm {
  jsonResponses: unknown[] = []
  streamReply = 'Here is a question for you.'
  echoContext = false
  lastJsonRequest?: JsonRequest
  lastStreamRequest?: StreamRequest

  async completeJson<T>(req: JsonRequest): Promise<T> {
    this.lastJsonRequest = req
    if (this.jsonResponses.length === 0) throw new Error('FakeLlm: no queued json response')
    return this.jsonResponses.shift() as T
  }

  async streamText(req: StreamRequest, onToken: (t: string) => void): Promise<string> {
    this.lastStreamRequest = req
    // echoContext lets a leak test see everything the tutor was given.
    const reply = this.echoContext ? JSON.stringify({ system: req.system, messages: req.messages }) : this.streamReply
    for (const chunk of reply.match(/.{1,20}/g) ?? [reply]) onToken(chunk)
    return reply
  }
}
