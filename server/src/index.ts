// Loads server/.env (the service's working directory when run via `npm`).
// Note: tsx also auto-injects server/.env; this keeps env loading working under
// plain `node` on a compiled build too. Keep the env file in server/, not the repo root.
import 'dotenv/config'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createApp } from './app'
import { MemoryStore } from './store/memory'
import { AnthropicLlm } from './llm/anthropic'
import { SqliteLearnerStore } from './learnerStore'
import { config } from './config'

if (config.dbPath !== ':memory:') mkdirSync(dirname(config.dbPath), { recursive: true })
const learnerStore = new SqliteLearnerStore(config.dbPath)
const app = createApp({ store: new MemoryStore(), llm: new AnthropicLlm(), learnerStore })
app.listen(config.port, () => {
  console.log(`study-tutor api listening on http://localhost:${config.port}`)
})
