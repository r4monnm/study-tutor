import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * The service-role client. It BYPASSES row-level security, so it must never be
 * constructed outside the server — every table in the schema has RLS enabled with
 * zero policies, which is what keeps `problems.correct_answer` unreachable from a
 * browser holding only the publishable key.
 */
export function createAdminClient(url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY): SupabaseClient {
  if (!url) throw new Error('SUPABASE_URL is not set')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

let cached: SupabaseClient | undefined

/** Lazy singleton so a serverless function reuses one client across warm invocations. */
export function admin(): SupabaseClient {
  cached ??= createAdminClient()
  return cached
}

/** PostgREST returns `{ data, error }`; every call site wants a throw on error. */
export function unwrap<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`supabase: ${res.error.message}`)
  return res.data
}
