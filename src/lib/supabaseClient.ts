import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Lazily-constructed Supabase browser client.
 *
 * Construction is deferred until the first async-play interaction so that a missing
 * configuration never breaks the vs-AI or PeerJS-live modes, which need no Supabase
 * setup at all. Importing this module has no side effects.
 */

let client: SupabaseClient | null = null

class SupabaseNotConfiguredError extends Error {
  constructor() {
    super(
      'Async play is not available: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY ' +
        'in your .env.local (see .env.example).',
    )
    this.name = 'SupabaseNotConfiguredError'
  }
}

export function isSupabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
}

/**
 * Returns the shared Supabase client, constructing it on first use.
 * Throws {@link SupabaseNotConfiguredError} if the env vars are absent.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client

  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new SupabaseNotConfiguredError()

  client = createClient(url, anonKey)
  return client
}
