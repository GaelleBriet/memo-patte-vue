import { computed } from 'vue'
import { useRouter } from 'vue-router'

import { currentRestoreFlow, type RestoreFlow } from '@/core/sync/service/restore-flow'
import { restoreRoute } from '@/shared/utils/restore-route'

/**
 * « Restauration en attente » : la sauvegarde cloud attend « Fusionner » ou « Remplacer », après
 * « Plus tard » ou un « Remplacer » refusé parce que le carnet du téléphone a changé.
 */
export function useRestorePending(flow: () => RestoreFlow | null = currentRestoreFlow) {
  const router = useRouter()

  const isPending = computed(() => flow()?.state.value.step === 'choice')

  function choose(): void {
    void router.push(restoreRoute('settings-backup'))
  }

  return { isPending, choose }
}
