import { computed, type Ref } from 'vue'
import { useRouter } from 'vue-router'

import { currentRestoreFlow, type RestoreFlow } from '@/core/sync/service/restore-flow'
import { restoreRoute } from '@/shared/utils/restore-route'
import type { BackupStatus } from '../logic/backup-status'

/**
 * « Restauration en attente » : la sauvegarde cloud attend « Fusionner » ou « Remplacer », après
 * « Plus tard » ou un « Remplacer » refusé parce que le carnet du téléphone a changé. Il remplace alors
 * ce que l'écran dit d'un carnet sans sauvegarde cloud, comme une restauration choisie qui attend le
 * réseau ou la reconnexion, qui progresse, dont le choix est contrôlé de nouveau ou qui vient de finir.
 */
export function useRestorePending(
  status: Readonly<Ref<BackupStatus | null>>,
  awaitsRestoredStatus: Readonly<Ref<boolean>>,
  flow: () => RestoreFlow | null = currentRestoreFlow,
) {
  const router = useRouter()

  const state = computed(() => flow()?.state.value ?? null)
  const sendQuestion = computed(() =>
    state.value?.step === 'send-confirmation' ? state.value : null,
  )
  const isLocal = computed(() => status.value?.kind === 'local')
  const isPending = computed(() => state.value?.step === 'choice')
  const isWaitingNetwork = computed(
    () => isLocal.value && state.value?.step === 'waiting-network' && state.value.chosen,
  )
  const isWaitingSignIn = computed(
    () => isLocal.value && state.value?.step === 'waiting-sign-in' && state.value.chosen,
  )
  const restoreProgress = computed(() =>
    isLocal.value && state.value?.step === 'restoring' ? state.value.progress : null,
  )
  const isRechecking = computed(() => state.value?.step === 'checking' && state.value.chosen)
  const isFinishing = computed(() => state.value?.step === 'done' && awaitsRestoredStatus.value)
  const showsLocalBackup = computed(
    () =>
      isLocal.value &&
      !isPending.value &&
      sendQuestion.value === null &&
      !isWaitingNetwork.value &&
      !isWaitingSignIn.value &&
      restoreProgress.value === null &&
      !isRechecking.value &&
      !isFinishing.value,
  )

  function choose(): void {
    void router.push(restoreRoute('settings-backup'))
  }

  return {
    isPending,
    sendQuestion,
    isWaitingNetwork,
    isWaitingSignIn,
    restoreProgress,
    showsLocalBackup,
    choose,
  }
}
