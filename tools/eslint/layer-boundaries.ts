import type { Linter } from 'eslint'
import {
  APP_RESTRICTION,
  DATA_ACCESS_RESTRICTIONS,
  NOTIFICATIONS_PLUGIN_RESTRICTION,
} from './import-restriction-patterns.ts'
import { restrictFeatureImports, restrictImports } from './import-restriction-rules.ts'

const FEATURES_RESTRICTION = {
  group: ['@/features/**', '**/features/**'],
  message:
    'core/ ne dépend pas des features, sauf core/dev/ (cf. CLAUDE.md et decisions-log du 2026-09-13).',
}

const FEATURES_OUT_OF_SHARED = {
  group: ['@/features/**', '**/features/**'],
  message: 'shared/ ne dépend pas des features : la dépendance va des features vers shared/.',
}

const PHONE_AND_STATE_OUT_OF_SHARED_DOMAIN = {
  paths: [],
  patterns: [
    {
      group: ['pinia', 'pinia/*'],
      message:
        'Un état vit dans core/ ou dans un store, jamais dans shared/domain/ (cf. CLAUDE.md).',
    },
    {
      group: ['@capacitor/*', '@capawesome-team/*', '@revenuecat/*', 'capacitor-native-settings'],
      message:
        "Ce qui appelle le téléphone ne vit pas dans shared/domain/ : c'est core/ (cf. CLAUDE.md, « Règles strictes de structure »).",
    },
    {
      group: ['vuetify', 'vuetify/*'],
      message: "L'interface vit dans shared/components/, pas dans shared/domain/.",
    },
  ],
}

const CORE_VALUE_OUT_OF_SHARED_DOMAIN = {
  group: ['@/core/**'],
  allowTypeImports: true,
  message:
    "shared/domain/ n'importe de core/ que des types : ce qui garde un état ou appelle le téléphone vit dans core/, et la logique métier le reçoit (cf. CLAUDE.md, « Règles strictes de structure »).",
}

export const layerBoundaryBlocks: Linter.Config[] = [
  {
    name: 'app/production-not-tests',
    files: ['src/**/*.{ts,mts,tsx,vue}'],
    ignores: ['**/__tests__/**', '**/*.spec.*', '**/*.test.*'],
    rules: {
      'app/no-restricted-test-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/__tests__',
                '**/__tests__/**',
                '**/*.spec',
                '**/*.spec.*',
                '**/*.test',
                '**/*.test.*',
              ],
              message:
                "Un fichier de production n'importe ni __tests__/ ni un spec : l'aide partagée vit hors de ces fichiers.",
            },
          ],
        },
      ],
    },
  },

  // Accès direct à SQLite/Supabase interdit hors de core/ et des repositories.
  // Les tests qui montent de vrais repositories sur une base en mémoire sont exemptés,
  // repérés par le suffixe `.integration.spec.ts` en plus des tests de repository et de service,
  // comme ceux qui jouent contre une pile Supabase locale (`.local.spec.ts`).
  {
    name: 'app/repository-only-data-access',
    files: ['src/**/*.{ts,vue}'],
    ignores: [
      'src/core/**',
      '**/*.repository.ts',
      '**/__tests__/**/*.repository.spec.ts',
      '**/__tests__/**/*.service.spec.ts',
      '**/__tests__/**/*.integration.spec.ts',
      '**/__tests__/**/*.local.spec.ts',
    ],
    rules: restrictImports(DATA_ACCESS_RESTRICTIONS),
  },

  {
    name: 'app/shared-not-app',
    files: ['src/shared/**/*.{ts,vue}'],
    ignores: ['**/*.repository.spec.ts', '**/*.service.spec.ts', '**/*.integration.spec.ts'],
    rules: restrictImports({
      ...DATA_ACCESS_RESTRICTIONS,
      patterns: [...DATA_ACCESS_RESTRICTIONS.patterns, APP_RESTRICTION],
    }),
  },
  {
    name: 'app/shared-not-features',
    files: ['src/shared/**/*.{ts,vue}'],
    ignores: [
      '**/__tests__/**',
      '**/*.repository.spec.ts',
      '**/*.service.spec.ts',
      '**/*.integration.spec.ts',
    ],
    rules: restrictImports({
      ...DATA_ACCESS_RESTRICTIONS,
      patterns: [...DATA_ACCESS_RESTRICTIONS.patterns, APP_RESTRICTION, FEATURES_OUT_OF_SHARED],
    }),
  },
  {
    name: 'app/shared-domain-without-phone-or-state',
    files: ['src/shared/domain/**/*.ts'],
    ignores: ['**/__tests__/**'],
    rules: restrictImports({
      paths: [...DATA_ACCESS_RESTRICTIONS.paths, ...PHONE_AND_STATE_OUT_OF_SHARED_DOMAIN.paths],
      patterns: [
        ...DATA_ACCESS_RESTRICTIONS.patterns,
        APP_RESTRICTION,
        FEATURES_OUT_OF_SHARED,
        ...PHONE_AND_STATE_OUT_OF_SHARED_DOMAIN.patterns,
      ],
    }),
  },

  {
    name: 'app/shared-domain-no-core-values',
    files: ['src/shared/domain/**/*.ts'],
    ignores: ['**/__tests__/**'],
    rules: restrictFeatureImports({ patterns: [CORE_VALUE_OUT_OF_SHARED_DOMAIN] }),
  },

  // Là où les blocs précédents ne s'appliquent pas (tout core/ et les repositories), trois
  // interdits restent : le plugin de notifications hors de core/notifications/, core/ qui
  // dépend des features, hors de core/dev/ (exception consignée le 2026-09-13 dans
  // docs/product/decisions-log.md), et core/ qui importe app/.
  // Blocs séparés et sans recouvrement, car en flat config deux blocs qui déclarent
  // la même règle sur un même fichier s'écrasent au lieu de se cumuler.
  {
    name: 'app/core-independent-of-features',
    files: ['src/core/**/*.{ts,vue}'],
    ignores: ['src/core/notifications/**', 'src/core/dev/**'],
    rules: restrictImports({
      paths: [NOTIFICATIONS_PLUGIN_RESTRICTION],
      patterns: [FEATURES_RESTRICTION, APP_RESTRICTION],
    }),
  },
  {
    name: 'app/core-notifications-independent-of-features',
    files: ['src/core/notifications/**/*.{ts,vue}'],
    rules: restrictImports({ patterns: [FEATURES_RESTRICTION, APP_RESTRICTION] }),
  },
  {
    name: 'app/notifications-service-only',
    files: ['src/**/*.repository.ts'],
    ignores: ['src/core/**'],
    rules: restrictImports({ paths: [NOTIFICATIONS_PLUGIN_RESTRICTION] }),
  },
  {
    name: 'app/core-dev-not-app',
    files: ['src/core/dev/**/*.{ts,vue}'],
    rules: restrictImports({
      paths: [NOTIFICATIONS_PLUGIN_RESTRICTION],
      patterns: [APP_RESTRICTION],
    }),
  },
]
