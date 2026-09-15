/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  /** Clé projet PostHog ; absente, les statistiques d'usage ne font rien. */
  readonly VITE_POSTHOG_KEY?: string
  /** Hôte PostHog, `https://eu.i.posthog.com` par défaut. */
  readonly VITE_POSTHOG_HOST?: string
  /** Version de `package.json`, injectée par `vite.config.ts`. */
  readonly VITE_APP_VERSION: string
  /** Posée par `pnpm dev:data` (`maquettes-<horodatage>`), absente sinon. Voir `src/core/dev/fixtures.ts`. */
  readonly VITE_FIXTURES?: string
  /** `ask` : montre l'écran de consentement dans l'aperçu navigateur de `pnpm dev`, qui l'écarte sinon. */
  readonly VITE_ANALYTICS_CONSENT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
