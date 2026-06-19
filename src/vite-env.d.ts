/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. Required only for async play. */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase anon/public key. Required only for async play. Safe to ship in the bundle. */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
