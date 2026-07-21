// Loads server/.env (the service's working directory when run via `npm`).
// Note: tsx also auto-injects server/.env; this keeps env loading working under
// plain `node` on a compiled build too. Keep the env file in server/, not the repo root.
import 'dotenv/config'
import { createApp } from './app'
import { MemoryStore } from './store/memory'
import { AnthropicLlm } from './llm/anthropic'
import { config } from './config'

const app = createApp({ store: new MemoryStore(), llm: new AnthropicLlm() })
app.listen(config.port, () => {
  console.log(`study-tutor api listening on http://localhost:${config.port}`)
})
