export const NOTIFICATIONS_PLUGIN_RESTRICTION = {
  name: '@capacitor/local-notifications',
  message:
    'Import interdit hors de core/notifications/ : utilise notifications.service (cf. CLAUDE.md).',
}

export const APP_RESTRICTION = {
  group: ['@/app', '@/app/**'],
  message:
    "app/ ne fait que démarrer l'app : une feature n'en importe rien (cf. CLAUDE.md, « Règles strictes de structure »).",
}

export const DATA_ACCESS_RESTRICTIONS = {
  paths: [
    {
      name: '@supabase/supabase-js',
      message: "Import interdit hors de core/supabase/ ou d'un repository (cf. CLAUDE.md).",
    },
    {
      name: '@capacitor-community/sqlite',
      message: "Import interdit hors de core/db/ ou d'un repository (cf. CLAUDE.md).",
    },
    NOTIFICATIONS_PLUGIN_RESTRICTION,
  ],
  patterns: [
    {
      group: ['**/core/supabase/*', '**/core/db/*', '@/core/supabase/*', '@/core/db/*'],
      message: 'Utilise un repository, pas le client directement (cf. CLAUDE.md).',
    },
  ],
}
