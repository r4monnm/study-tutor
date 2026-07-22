import type { Authenticator } from '../../src/auth'

/**
 * Test authenticator.
 *  - `fakeAuth()` accepts anything (including no token) as user 'L1', so route tests that
 *    do not care about identity need no Authorization header.
 *  - `fakeAuth({ tokens: { tokA: 'userA' } })` is strict: only listed tokens authenticate.
 */
export function fakeAuth(opts: { defaultUser?: string; tokens?: Record<string, string> } = {}): Authenticator {
  const { defaultUser = 'L1', tokens } = opts
  return {
    async verify(token) {
      if (tokens) return token && tokens[token] ? { id: tokens[token] } : null
      return { id: defaultUser }
    },
  }
}
