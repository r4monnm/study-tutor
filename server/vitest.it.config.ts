import { defineConfig } from 'vitest/config'

// Integration suite: hits the real Supabase project, so it is kept out of the default
// `npm test` run (which must stay offline and deterministic).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.it.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
