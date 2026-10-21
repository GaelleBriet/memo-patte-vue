import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ChoiceCard } from '../views/ChoiceCards.vue'

/** Les deux cartes de l'import, reprises telles quelles par la restauration. */
export function useMergeReplaceChoices() {
  const { t } = useI18n()

  return computed<ChoiceCard<'merge' | 'replace'>[]>(() => [
    {
      value: 'merge',
      icon: 'ms:merge',
      label: t('settings.import.merge.label'),
      description: t('settings.import.merge.description'),
    },
    {
      value: 'replace',
      icon: 'ms:delete_sweep',
      label: t('settings.import.replace.label'),
      description: t('settings.import.replace.description'),
      danger: true,
    },
  ])
}
