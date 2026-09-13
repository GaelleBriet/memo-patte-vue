/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  /** Posée par `pnpm dev:data` (`maquettes-<horodatage>`), absente sinon. Voir `src/core/dev/fixtures.ts`. */
  readonly VITE_FIXTURES?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
