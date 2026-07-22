import type { SupabaseClient } from '@supabase/supabase-js'
import { admin, unwrap } from './supabase'

export type ChatRole = 'tutor' | 'you' | 'system'

export interface ChatMessage {
  role: ChatRole
  text: string
}

/**
 * The visible thread — exactly what the learner sees on screen, kept per account so a
 * sign-out/sign-in returns them to the same conversation. Distinct from a session's
 * `history`, which is the LLM-facing transcript for one study session.
 */
export interface ChatStore {
  append(userId: string, message: ChatMessage): Promise<void>
  list(userId: string, limit?: number): Promise<ChatMessage[]>
  clear(userId: string): Promise<void>
}

export const CHAT_ROLES: ChatRole[] = ['tutor', 'you', 'system']
export const MAX_MESSAGE_CHARS = 20_000
export const DEFAULT_HISTORY_LIMIT = 200

export class MemoryChatStore implements ChatStore {
  private byUser = new Map<string, ChatMessage[]>()

  async append(userId: string, message: ChatMessage): Promise<void> {
    const list = this.byUser.get(userId) ?? []
    list.push(message)
    this.byUser.set(userId, list)
  }

  async list(userId: string, limit = DEFAULT_HISTORY_LIMIT): Promise<ChatMessage[]> {
    return (this.byUser.get(userId) ?? []).slice(-limit)
  }

  async clear(userId: string): Promise<void> {
    this.byUser.delete(userId)
  }
}

export class SupabaseChatStore implements ChatStore {
  constructor(private sb: SupabaseClient = admin()) {}

  async append(userId: string, message: ChatMessage): Promise<void> {
    unwrap(await this.sb.from('chat_messages').insert({ user_id: userId, role: message.role, text: message.text }))
  }

  async list(userId: string, limit = DEFAULT_HISTORY_LIMIT): Promise<ChatMessage[]> {
    // Take the newest `limit` rows, then flip back into reading order.
    const rows = unwrap(
      await this.sb
        .from('chat_messages').select('role,text')
        .eq('user_id', userId)
        .order('id', { ascending: false })
        .limit(limit),
    ) as { role: ChatRole; text: string }[]
    return rows.reverse()
  }

  async clear(userId: string): Promise<void> {
    unwrap(await this.sb.from('chat_messages').delete().eq('user_id', userId))
  }
}
