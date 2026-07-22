import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (see client/.env.example)')
}

/**
 * Browser Supabase client. It holds only the publishable key, and every table has RLS
 * enabled with zero policies — so this client can sign in and out, but cannot read a
 * single application row. All data flows through the API, which is what keeps
 * `problems.correct_answer` out of reach.
 */
export const supabase = createClient(url, anonKey)

/** The current access token, or undefined when signed out. */
export async function accessToken(): Promise<string | undefined> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token
}
