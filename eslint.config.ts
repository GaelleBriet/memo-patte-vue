import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginVitest from '@vitest/eslint-plugin'
import pluginOxlint from 'eslint-plugin-oxlint'
import skipFormatting from 'eslint-config-prettier/flat'

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**', '**/android/**', '**/ios/**']),

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

  // Désactive les règles qui conflictent avec Prettier
  skipFormatting,

  // Accès direct à SQLite/Supabase interdit hors de core/ et des repositories
  {
    name: 'app/repository-only-data-access',
    files: ['src/**/*.{ts,vue}'],
    ignores: ['src/core/**', '**/*.repository.ts'],
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
