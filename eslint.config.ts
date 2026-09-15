import { readdirSync } from 'node:fs'
import type { Linter } from 'eslint'
import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginVitest from '@vitest/eslint-plugin'
import pluginOxlint from 'eslint-plugin-oxlint'
import pluginVueI18n from '@intlify/eslint-plugin-vue-i18n'
import skipFormatting from 'eslint-config-prettier/flat'

const NOTIFICATIONS_PLUGIN_RESTRICTION = {
  name: '@capacitor/local-notifications',
  message:
    'Import interdit hors de core/notifications/ : utilise notifications.service (cf. CLAUDE.md).',
}

const FEATURES_RESTRICTION = {
  group: ['@/features/**', '**/features/**'],
  message:
    'core/ ne dépend pas des features, sauf core/dev/ (cf. CLAUDE.md et decisions-log du 2026-09-13).',
}

const FEATURES = readdirSync(new URL('./src/features', import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== '__tests__')
  .map((entry) => entry.name)

const COMPOSITE_SCREENS = [
  { feature: 'animals', file: 'src/features/animals/CarnetView.vue' },
  { feature: 'home', file: 'src/features/home/HomeView.vue' },
]

function featureImportsRule(feature: string, allowedElsewhere: string[] = []): Linter.RulesRecord {
  return {
    '@typescript-eslint/no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [
              '@/features/*/**',
              '../**',
              `!@/features/${feature}/**`,
              '!@/features/animals/animals.store',
              '!@/features/animals/animal.schema',
              ...allowedElsewhere.map((pattern) => `!${pattern}`),
            ],
            message:
              'Import interdit depuis une autre feature : passe par shared/ ou core/ (cf. CLAUDE.md, « Règles strictes de structure »).',
          },
          {
            regex: '^@/features/[^/]+/?$',
            message: 'Importe un module précis de la feature, pas son dossier.',
          },
        ],
      },
    ],
  }
}

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores([
    '**/dist/**',
    '**/dist-ssr/**',
    '**/coverage/**',
    '**/android/**',
    '**/ios/**',
    // Les worktrees vivent dans le dépôt : sans ça, chaque outil relit une copie de src/.
    '**/.claude/worktrees/**',
  ]),

  // Vue : recommended (plus strict que essential)
  ...pluginVue.configs['flat/recommended'],

  // TypeScript
  vueTsConfigs.recommended,

  // Vitest (fichiers de tests uniquement)
  {
    ...pluginVitest.configs.recommended,
    files: ['src/**/__tests__/*'],
  },

  // Oxlint
  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),

  {
    name: 'app/vue-i18n-rules',
    files: ['**/*.{vue,ts,mts,tsx}'],
    plugins: { '@intlify/vue-i18n': pluginVueI18n },
    settings: {
      'vue-i18n': {
        localeDir: './src/core/i18n/locales/*.json',
        messageSyntaxVersion: '^11.0.0',
      },
    },
    rules: {
      '@intlify/vue-i18n/no-missing-keys': 'error',
      '@intlify/vue-i18n/no-raw-text': 'warn',
    },
  },

  // Désactive les règles qui conflictent avec Prettier
  skipFormatting,

  // Accès direct à SQLite/Supabase interdit hors de core/ et des repositories.
  // Les tests d'un repository sont exemptés : ils lui injectent un client de base en mémoire.
  {
    name: 'app/repository-only-data-access',
    files: ['src/**/*.{ts,vue}'],
    ignores: [
      'src/core/**',
      '**/*.repository.ts',
      '**/*.repository.spec.ts',
      '**/*.service.spec.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@supabase/supabase-js',
              message: "Import interdit hors de core/supabase/ ou d'un repository (cf. CLAUDE.md).",
            },
            {
              name: '@capacitor-community/sqlite',
              message: "Import interdit hors de core/db/ ou d'un repository (cf. CLAUDE.md).",
            },
            {
              name: '@capacitor/local-notifications',
              message:
                'Import interdit hors de core/notifications/ : utilise notifications.service (cf. CLAUDE.md).',
            },
          ],
          patterns: [
            {
              group: ['**/core/supabase/*', '**/core/db/*', '@/core/supabase/*', '@/core/db/*'],
              message: 'Utilise un repository, pas le client directement (cf. CLAUDE.md).',
            },
          ],
        },
      ],
    },
  },

  // Là où le bloc précédent ne s'applique pas (tout core/ et les repositories), deux
  // interdits restent : le plugin de notifications hors de core/notifications/, et
  // core/ qui dépend des features, hors de core/dev/ (exception consignée le
  // 2026-09-13 dans docs/product/decisions-log.md).
  // Blocs séparés et sans recouvrement, car en flat config deux blocs qui déclarent
  // la même règle sur un même fichier s'écrasent au lieu de se cumuler.
  {
    name: 'app/core-independent-of-features',
    files: ['src/core/**/*.{ts,vue}'],
    ignores: ['src/core/notifications/**', 'src/core/dev/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [NOTIFICATIONS_PLUGIN_RESTRICTION],
          patterns: [FEATURES_RESTRICTION],
        },
      ],
    },
  },
  {
    name: 'app/core-notifications-independent-of-features',
    files: ['src/core/notifications/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [FEATURES_RESTRICTION] }],
    },
  },
  {
    name: 'app/notifications-service-only',
    files: ['src/core/dev/**/*.{ts,vue}', 'src/**/*.repository.ts'],
    ignores: ['src/core/notifications/**'],
    rules: {
      'no-restricted-imports': ['error', { paths: [NOTIFICATIONS_PLUGIN_RESTRICTION] }],
    },
  },

  // Règle distincte de no-restricted-imports pour se cumuler avec les interdits ci-dessus.
  ...FEATURES.map((feature) => ({
    name: `app/feature-imports/${feature}`,
    files: [`src/features/${feature}/**/*.{ts,vue}`],
    ignores: ['**/__tests__/**'],
    rules: featureImportsRule(feature),
  })),
  ...FEATURES.map((feature) => ({
    name: `app/feature-imports/${feature}-services`,
    files: [`src/features/${feature}/**/*.service.ts`],
    rules: featureImportsRule(feature, ['@/features/*/*.repository', '@/features/*/*.schema']),
  })),
  ...COMPOSITE_SCREENS.map(({ feature, file }) => ({
    name: `app/feature-imports/${file}`,
    files: [file],
    rules: featureImportsRule(feature, ['@/features/*/*Section.vue', '@/features/*/*Sheet.vue']),
  })),

  // Règles projet MémoPatte
  {
    name: 'app/memo-patte-rules',
    rules: {
      // Vue
      'vue/multi-word-component-names': 'off',
      'vue/component-api-style': ['error', ['script-setup']],
      'vue/define-macros-order': ['error', { order: ['defineProps', 'defineEmits'] }],
      'vue/block-order': ['error', { order: ['script', 'template', 'style'] }],
      'vue/no-unused-refs': 'error',
      'vue/no-useless-v-bind': 'error',

      // TypeScript
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      // Général
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
)
