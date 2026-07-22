import type { Store } from './store/types'
import type { LearnerStore } from './learnerStore'
import type { Authenticator } from './auth'
import type { ChatStore } from './chatStore'
import { SupabaseStore } from './store/supabase'
import { SupabaseLearnerStore } from './supabaseLearnerStore'
import { SupabaseChatStore } from './chatStore'
import { supabaseAuth } from './auth'
import { admin } from './supabase'

/**
 * The one place that decides what backs the app. Supabase is required: accounts, the
 * gate state, and durable progress all live in Postgres, and serverless functions are
 * stateless so there is no in-process fallback that would still be correct. Failing
 * loudly here beats silently running without authentication.
 */
export function buildStores(): { store: Store; learnerStore: LearnerStore; chatStore: ChatStore; auth: Authenticator } {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see server/.env.example). ' +
        'Accounts and the answer gate both depend on them.',
    )
  }
  const sb = admin()
  return {
    store: new SupabaseStore(sb),
    learnerStore: new SupabaseLearnerStore(sb),
    chatStore: new SupabaseChatStore(sb),
    auth: supabaseAuth(sb),
  }
}
