import type { Linter } from 'eslint'

export const useCaseBoundaryBlocks: Linter.Config[] = [
  {
    name: 'app/treatment-engine-facade',
    files: ['src/**/*.{ts,vue}'],
    ignores: ['src/shared/domain/dose-calendar/**', '**/__tests__/**'],
    rules: {
      'app/no-restricted-engine-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/domain/dose-calendar/**', './dose-calendar/**', '../dose-calendar/**'],
              message:
                "Le moteur des doses s'importe par sa façade, `@/shared/domain/dose-calendar`.",
            },
          ],
        },
      ],
    },
  },

  {
    name: 'app/services-without-interface',
    files: ['src/**/*.service.ts'],
    rules: {
      'app/no-restricted-interface-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/shared/utils/toast',
                '@/shared/composables/*',
                'vuetify',
                'vuetify/*',
                'vue-i18n',
                '**/*.vue',
              ],
              message:
                'Un service de cas d’usage ne connaît pas l’interface : il rend un résultat que l’appelant affiche.',
            },
          ],
        },
      ],
    },
  },
]
