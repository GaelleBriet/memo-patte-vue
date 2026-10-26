import { computed, type Ref } from 'vue'
import { useRouter } from 'vue-router'

import { currentRestoreFlow, type RestoreFlow } from '@/core/sync/service/restore-flow'
import { restoreRoute } from '@/shared/utils/restore-route'
import type { BackupStatus } from '../logic/backup-status'

/**
 * « Restauration en attente » : la sauvegarde cloud attend « Fusionner » ou « Remplacer », après
 * « Plus tard » ou un « Remplacer » refusé parce que le carnet du téléphone a changé. Il remplace alors
 * ce que l'écran dit d'un carnet sans sauvegarde cloud, comme l'attente du réseau d'une restauration.
 */
export function useRestorePending(
  status: Readonly<Ref<BackupStatus | null>>,
  flow: () => RestoreFlow | null = currentRestoreFlow,
) {
  const router = useRouter()

  const isPending = computed(() => flow()?.state.value.step === 'choice')
  const isLocal = computed(() => status.value?.kind === 'local')
  const isWaitingNetwork = computed(
    () => isLocal.value && flow()?.state.value.step === 'waiting-network',
  )
  const showsLocalBackup = computed(
    () => isLocal.value && !isPending.value && !isWaitingNetwork.value,
  )

  function choose(): void {
    void router.push(restoreRoute('settings-backup'))
  }

  return { isPending, isWaitingNetwork, showsLocalBackup, choose }
}
