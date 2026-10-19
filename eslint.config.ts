import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginVitest from '@vitest/eslint-plugin'
import pluginOxlint from 'eslint-plugin-oxlint'
import skipFormatting from 'eslint-config-prettier/flat'
import dynamicImports from './tools/eslint/dynamic-imports.ts'
import vueScriptOrder from './tools/eslint/vue-script-order.ts'
import { featureBoundaryBlocks } from './tools/eslint/feature-boundaries.ts'
import { layerBoundaryBlocks } from './tools/eslint/layer-boundaries.ts'
import { useCaseBoundaryBlocks } from './tools/eslint/use-case-boundaries.ts'
import { vueI18nLocalesBlock, vueI18nRulesBlock } from './tools/eslint/vue-i18n.ts'

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
    plugins: { app: { rules: { ...dynamicImports.rules, 'vue-script-order': vueScriptOrder } } },
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

  vueI18nRulesBlock,

  // Désactive les règles qui conflictent avec Prettier
  skipFormatting,

  ...layerBoundaryBlocks,

  ...useCaseBoundaryBlocks,

  ...featureBoundaryBlocks,

  {
    name: 'app/vue-script-order',
    files: ['**/*.vue'],
    rules: { 'app/vue-script-order': 'error' },
  },

  // Règles projet MémoPatte
  {
    name: 'app/memo-patte-rules',
    rules: {
      // Vue
      'vue/multi-word-component-names': 'off',
      'vue/component-api-style': ['error', ['script-setup']],
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

  vueI18nLocalesBlock,
)
