import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

/**
 * Wraps the app in an email + password gate. Nothing renders — and no session is
 * created — until Supabase Auth returns a session, so the API never sees an
 * unauthenticated caller.
 */
export default function AuthGate({ children }: { children: (session: Session) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!ready) return <Shell><p className="dim text-sm">Loading…</p></Shell>
  if (!session) return <SignIn />
  return <>{children(session)}</>
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="aurora-bg relative flex h-[100dvh] flex-col items-center justify-center px-4">
      <div className="aurora-veil" />
      <div className="glass w-full max-w-sm p-6">{children}</div>
    </div>
  )
}

function SignIn() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(''); setNotice('')
    const fn = mode === 'in' ? supabase.auth.signInWithPassword : supabase.auth.signUp
    const { data, error } = await fn.call(supabase.auth, { email: email.trim(), password })
    setBusy(false)
    if (error) { setError(error.message); return }
    // With email confirmation on, sign-up returns a user but no session yet.
    if (mode === 'up' && !data.session) setNotice('Check your email to confirm your account, then sign in.')
  }

  return (
    <Shell>
      <h1 className="brand mb-1 text-2xl font-black tracking-tight">Study Tutor</h1>
      <p className="dim mb-5 text-sm">
        {mode === 'in' ? 'Sign in to pick up where you left off.' : 'Create an account to save your progress.'}
      </p>

      <form className="flex flex-col gap-3" onSubmit={submit}>
        <input className="field" type="email" autoComplete="email" placeholder="you@example.com" required
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="field" type="password" required minLength={8}
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          placeholder={mode === 'in' ? 'Password' : 'Password (8+ characters)'}
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn" type="submit" disabled={busy || !email.trim() || !password}>
          {busy ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
      {notice && <p className="mt-3 text-sm text-emerald-300">{notice}</p>}

      <button className="btn-ghost mt-4 w-full text-sm"
        onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(''); setNotice('') }}>
        {mode === 'in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
      </button>
    </Shell>
  )
}
