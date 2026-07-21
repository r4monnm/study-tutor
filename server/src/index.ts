import 'dotenv/config'
import { createApp } from './app'
import { MemoryStore } from './store/memory'
import { AnthropicLlm } from './llm/anthropic'
import { config } from './config'

const app = createApp({ store: new MemoryStore(), llm: new AnthropicLlm() })
app.listen(config.port, () => {
  console.log(`study-tutor api listening on http://localhost:${config.port}`)
})
