import { readdirSync } from 'node:fs'
import type { Linter } from 'eslint'
import { APP_RESTRICTION } from './import-restrictions.ts'
import { restrictFeatureImports } from './restrict-imports.ts'

const FEATURES = readdirSync(new URL('../../src/features', import.meta.url), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory() && entry.name !== '__tests__')
  .map((entry) => entry.name)

const COMPOSITE_SCREENS = [
  { feature: 'animals', file: 'src/features/animals/views/CarnetView.vue' },
  { feature: 'home', file: 'src/features/home/views/HomeView.vue' },
  { feature: 'settings', file: 'src/features/settings/views/SettingsView.vue' },
]

const EXPORT_FILE_SCHEMA = 'src/features/settings/schema/export-file.schema.ts'

// Exception actée le 2026-09-16 (decisions-log) : toute feature lit le store des
// animaux et son schéma, rien de plus — d'où `useAnimalsStore` seul autorisé.
const ANIMALS_STORE_READ_ONLY = {
  group: ['@/features/animals/store/animals.store'],
  allowImportNames: ['useAnimalsStore'],
  message:
    'Des animaux, une autre feature ne lit que useAnimalsStore et animal.schema (cf. CLAUDE.md, « Règles strictes de structure »).',
}

// Exception actée au ticket #81 (decisions-log) : le statut Plus se lit au même
// titre que l'entité animal — d'où `usePurchaseStore` seul autorisé.
const PURCHASE_STORE_READ_ONLY = {
  group: ['@/features/purchase/store/purchase.store'],
  allowImportNames: ['usePurchaseStore'],
  message:
    'Du statut Plus, une autre feature ne lit que usePurchaseStore (cf. CLAUDE.md, « Règles strictes de structure »).',
}

const REPOSITORY_OUT_OF_LOGIC = {
  group: ['**/repository', '**/repository/*', '**/*.repository'],
  message:
    "logic/ n'importe jamais un repository : les types d'écriture partagés vivent dans schema/ (cf. CLAUDE.md, « Règles strictes de structure »).",
}

function featureImportsRule(
  feature: string,
  allowedElsewhere: string[] = [],
  extraPatterns: object[] = [],
): Linter.RulesRecord {
  return restrictFeatureImports({
    patterns: [
      {
        group: [
          '@/features/*/**',
          '../../**',
          `!@/features/${feature}/**`,
          // Dossier intermédiaire excepté en plus du fichier : sémantique gitignore
          // du moteur `ignore` (cf. decisions-log du 2026-09-19).
          '!@/features/animals/store',
          '!@/features/animals/store/animals.store',
          '!@/features/animals/schema',
          '!@/features/animals/schema/animal.schema',
          '!@/features/purchase/store',
          '!@/features/purchase/store/purchase.store',
          ...allowedElsewhere.map((pattern) => `!${pattern}`),
        ],
        message:
          'Import interdit depuis une autre feature : passe par shared/ ou core/ (cf. CLAUDE.md, « Règles strictes de structure »).',
      },
      APP_RESTRICTION,
      ...extraPatterns,
      ...(feature === 'animals' ? [] : [ANIMALS_STORE_READ_ONLY]),
      ...(feature === 'purchase' ? [] : [PURCHASE_STORE_READ_ONLY]),
      {
        regex: '^@/features/[^/]+/?$',
        message: 'Importe un module précis de la feature, pas son dossier.',
      },
    ],
  })
}

// Règle distincte de no-restricted-imports pour se cumuler avec les interdits des couches.
export const featureBoundaryBlocks: Linter.Config[] = [
  ...FEATURES.map((feature) => ({
    name: `app/feature-imports/${feature}`,
    files: [`src/features/${feature}/**/*.{ts,vue}`],
    ignores: ['**/__tests__/**'],
    rules: featureImportsRule(feature),
  })),
  ...FEATURES.map((feature) => ({
    name: `app/feature-imports/${feature}-services`,
    files: [`src/features/${feature}/**/*.service.ts`],
    rules: featureImportsRule(feature, [
      '@/features/*/repository',
      '@/features/*/repository/*.repository',
      '@/features/*/schema',
      '@/features/*/schema/*.schema',
      '@/features/*/service',
      '@/features/*/service/*.service',
    ]),
  })),
  ...FEATURES.map((feature) => ({
    name: `app/feature-imports/${feature}-logic`,
    files: [`src/features/${feature}/logic/**/*.ts`],
    ignores: ['**/__tests__/**'],
    rules: featureImportsRule(feature, [], [REPOSITORY_OUT_OF_LOGIC]),
  })),
  {
    name: 'app/feature-imports/export-file-schema',
    files: [EXPORT_FILE_SCHEMA],
    rules: featureImportsRule('settings', ['@/features/*/schema', '@/features/*/schema/*.schema']),
  },
  ...COMPOSITE_SCREENS.map(({ feature, file }) => ({
    name: `app/feature-imports/${file}`,
    files: [file],
    rules: featureImportsRule(feature, [
      '@/features/*/views',
      '@/features/*/views/*Section.vue',
      '@/features/*/views/*Sheet.vue',
    ]),
  })),
]
