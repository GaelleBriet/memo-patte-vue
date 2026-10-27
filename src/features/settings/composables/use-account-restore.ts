import { computed, onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { backupSummaryText } from '../logic/backup-summary-text'
import { onBackButton } from '@/core/app-lifecycle/back-button'
import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import { promptNotificationsIfReminders } from '@/core/notifications/reminders-priming'
import type { RestoreMode } from '@/core/sync/repository/sync-state.repository'
import {
  currentRestoreFlow,
  type RestoreFlow,
  type RestoreFlowState,
} from '@/core/sync/service/restore-flow'
import { restoreReturnRoute } from '@/shared/utils/restore-route'
import { returnTo } from '@/shared/utils/return-to'
import { signInRoute } from '@/shared/utils/sign-in-route'

const IDLE: RestoreFlowState = { step: 'idle' }

/**
 * « Restaurer mon carnet » : « Fusionner » part tout de suite, « Remplacer » après confirmation ;
 * l'écran reste affiché pendant la restauration, puis ouvre l'accueil, ou « Ton carnet est prêt »
 * si l'autorisation des notifications n'a jamais été demandée. Session expirée : la connexion
 * ramène ici.
 */
export function useAccountRestore(flow: () => RestoreFlow | null = currentRestoreFlow) {
  const { t } = useI18n()
  const router = useRouter()
  const route = useRoute()

  const origin = restoreReturnRoute(route.query.from)
  const selected = ref<RestoreMode | null>(null)
  const isConfirmOpen = ref(false)
  let releaseBack: (() => void) | null = null

  const state = computed(() => flow()?.state.value ?? IDLE)
  const isRestoring = computed(() => state.value.step === 'restoring')
  const summaryText = computed(() =>
    state.value.step === 'choice'
      ? backupSummaryText(t, state.value.summary, todayIsoDate())
      : null,
  )

  watch(
    () => state.value.step,
    (step) => {
      holdBackWhile(step === 'restoring')
      if (step === 'idle' || step === 'no-answer') leave()
      else if (step === 'done') void openReadyCarnet()
    },
    { immediate: true },
  )

  function holdBackWhile(restoring: boolean): void {
    if (restoring) releaseBack ??= onBackButton(() => {})
    else {
      releaseBack?.()
      releaseBack = null
    }
  }

  function leave(): void {
    returnTo(router, origin)
  }

  async function openReadyCarnet(): Promise<void> {
    await router.replace({ name: 'home' })
    await promptNotificationsIfReminders(router, 'home', { ready: true })
  }

  function signIn(): void {
    void router.push(signInRoute(origin.name, { restore: true }))
  }

  function later(): void {
    void router.replace({ name: 'home' })
  }

  function submit(): void {
    if (selected.value === 'replace') isConfirmOpen.value = true
    else if (selected.value === 'merge') void flow()?.choose('merge')
  }

  function confirmReplace(): void {
    isConfirmOpen.value = false
    void flow()?.choose('replace')
  }

  onScopeDispose(() => holdBackWhile(false))

  return {
    state,
    isRestoring,
    summaryText,
    selected,
    isConfirmOpen,
    submit,
    confirmReplace,
    leave,
    signIn,
    later,
  }
}
