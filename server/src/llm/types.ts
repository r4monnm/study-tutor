export interface JsonRequest {
  model: string
  system: string
  user: string
  schema: object
  maxTokens?: number
}

export interface StreamRequest {
  model: string
  system: string[]
  messages: { role: 'user' | 'assistant'; content: string }[]
  maxTokens?: number
  adaptiveThinking?: boolean
}

export interface Llm {
  completeJson<T>(req: JsonRequest): Promise<T>
  streamText(req: StreamRequest, onToken: (t: string) => void): Promise<string>
}
