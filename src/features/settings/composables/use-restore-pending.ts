import { computed, type Ref } from 'vue'
import { useRouter } from 'vue-router'

import { currentRestoreFlow, type RestoreFlow } from '@/core/sync/service/restore-flow'
import { restoreRoute } from '@/shared/utils/restore-route'
import type { BackupStatus } from '../logic/backup-status'

/**
 * « Restauration en attente » : la sauvegarde cloud attend « Fusionner » ou « Remplacer », après
 * « Plus tard » ou un « Remplacer » refusé parce que le carnet du téléphone a changé. Il remplace alors
 * ce que l'écran dit d'un carnet sans sauvegarde cloud, comme une restauration choisie qui attend le
 * réseau, qui progresse ou dont le choix est contrôlé de nouveau.
 */
export function useRestorePending(
  status: Readonly<Ref<BackupStatus | null>>,
  flow: () => RestoreFlow | null = currentRestoreFlow,
) {
  const router = useRouter()

  const state = computed(() => flow()?.state.value ?? null)
  const isLocal = computed(() => status.value?.kind === 'local')
  const isPending = computed(() => state.value?.step === 'choice')
  const isWaitingNetwork = computed(
    () => isLocal.value && state.value?.step === 'waiting-network' && state.value.chosen,
  )
  const restoreProgress = computed(() =>
    isLocal.value && state.value?.step === 'restoring' ? state.value.progress : null,
  )
  const isRechecking = computed(() => state.value?.step === 'checking' && state.value.chosen)
  const showsLocalBackup = computed(
    () =>
      isLocal.value &&
      !isPending.value &&
      !isWaitingNetwork.value &&
      restoreProgress.value === null &&
      !isRechecking.value,
  )

  function choose(): void {
    void router.push(restoreRoute('settings-backup'))
  }

  return { isPending, isWaitingNetwork, restoreProgress, showsLocalBackup, choose }
}
