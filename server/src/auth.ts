import type { RequestHandler } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import { admin } from './supabase'

export interface AuthUser {
  id: string
  email?: string
}

export interface Authenticator {
  /** Resolve a bearer token to a user, or null when it is missing/expired/forged. */
  verify(token: string | undefined): Promise<AuthUser | null>
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

/** Pull the credential out of an `Authorization: Bearer <token>` header. */
export function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined
  const [scheme, ...rest] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer') return undefined
  const token = rest.join(' ').trim()
  return token || undefined
}

/** Verifies Supabase Auth access tokens (email + password sign-in on the client). */
export function supabaseAuth(sb: SupabaseClient = admin()): Authenticator {
  return {
    async verify(token) {
      if (!token) return null
      const { data, error } = await sb.auth.getUser(token)
      if (error || !data.user) return null
      return { id: data.user.id, email: data.user.email ?? undefined }
    },
  }
}

/**
 * Gate for every /api route. The authenticated user id — never a client-supplied
 * learnerId — is what owns sessions and durable progress.
 */
export function requireAuth(auth: Authenticator): RequestHandler {
  return (req, res, next) => {
    auth
      .verify(bearerToken(req.headers.authorization))
      .then((user) => {
        if (!user) {
          res.status(401).json({ error: 'unauthorized' })
          return
        }
        req.user = user
        next()
      })
      .catch(next)
  }
}
