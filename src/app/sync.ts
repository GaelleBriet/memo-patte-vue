import { watch } from 'vue'

import { onAppResume } from '@/core/app-lifecycle/app-resume'
import { getDeviceRepository } from '@/core/device/device.repository'
import { createLocalSyncContext } from '@/core/sync/service/local-sync-context'
import { onNetworkOnline } from '@/core/sync/service/network-status'
import type { SyncOutboxRepository } from '@/core/sync/repository/sync-outbox.repository'
import type { RestorableTable } from '@/core/sync/service/account-restore'
import {
  createRestoreFlow,
  provideRestoreFlow,
  type RestoreFlow,
} from '@/core/sync/service/restore-flow'
import type { SyncCycleOutbox } from '@/core/sync/service/sync-cycle'
import { createSyncScheduler, resumePendingSync } from '@/core/sync/service/sync-scheduler'
import { getAnimalsRepository } from '@/features/animals/repository/animals.repository'
import { useAuthStore } from '@/features/auth/store/auth.store'
import { usePurchaseStore } from '@/features/purchase/store/purchase.store'
import { getCarnetSettingsRepository } from '@/features/settings/repository/carnet-settings.repository'
import {
  createAccountBackupService,
  type AccountBackupCheck,
} from '@/features/settings/service/account-backup.service'
import { getTreatmentDosesRepository } from '@/features/treatments/repository/treatment-doses.repository'
import { getTreatmentPeriodsRepository } from '@/features/treatments/repository/treatment-periods.repository'
import { getTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import { getVaccinationInjectionsRepository } from '@/features/vaccinations/repository/vaccination-injections.repository'
import { getVaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'
import { getWeightRepository } from '@/features/weight/repository/weight.repository'
import { syncAllReminders } from '@/features/treatments/service/reminders-sync.service'

export interface SyncDependencies {
  outbox: SyncCycleOutbox & Pick<SyncOutboxRepository, 'forgetAccount'>
  runCycle: () => Promise<void>
  userId: () => string | null
  sessionActive: () => boolean
  checkAccountBackup: () => Promise<AccountBackupCheck>
  restoreFlow: Pick<RestoreFlow, 'offer' | 'unreachable' | 'reset' | 'resume' | 'onRestored'>
}

/**
 * Branche le cycle sur ses déclencheurs (lancement, retour au premier plan, retour du réseau,
 * connexion réussie) ; le debounce après écriture est déjà câblé côté triggers SQLite. Le compte
 * ne disparaît qu'à la déconnexion explicite : la synchro oublie alors sa file et ses curseurs.
 * Un compte qui en remplace un autre repart, comme une première connexion, du contrôle de sa
 * sauvegarde, fait une fois par lancement et par compte dès que sa session est active. Une
 * restauration choisie reprend seule au lancement, au retour au premier plan et du réseau, comme un
 * contrôle que le serveur n'a pas pu faire.
 */
export async function installSync(deps: SyncDependencies): Promise<() => void> {
  const scheduler = createSyncScheduler({ runCycle: deps.runCycle })
  let accountWork: Promise<void> = Promise.resolve()
  let checkedFor: string | null = null

  const enqueue = (task: () => Promise<void>) => {
    accountWork = accountWork.then(task)
  }

  async function runRestore(): Promise<void> {
    await deps.restoreFlow.resume()
  }

  async function checkBackup(): Promise<void> {
    try {
      const outcome = await deps.checkAccountBackup()
      if (outcome.kind === 'backup-found') deps.restoreFlow.offer(outcome.summary)
      else if (outcome.kind === 'restore-pending') await runRestore()
      else if (outcome.kind === 'unreachable') {
        checkedFor = null
        deps.restoreFlow.unreachable()
      } else {
        deps.restoreFlow.reset()
        if (outcome.kind === 'seeded') scheduler.notifyChange()
      }
    } catch (cause) {
      checkedFor = null
      deps.restoreFlow.unreachable()
      console.warn('Sauvegarde du compte non contrôlée :', cause)
    }
  }

  function checkOnce(): void {
    const userId = deps.userId()
    if (!deps.sessionActive() || userId === null || checkedFor === userId) return
    checkedFor = userId
    enqueue(checkBackup)
  }

  function onComeback(): void {
    enqueue(runRestore)
    checkOnce()
    scheduler.notifyChange()
  }

  const stopRestored = deps.restoreFlow.onRestored(() => scheduler.notifyChange())
  const stopResume = onAppResume(onComeback)
  const stopNetwork = onNetworkOnline(onComeback)
  const stopAccountWatch = watch(
    () => ({ userId: deps.userId(), active: deps.sessionActive() }),
    ({ userId, active }, before) => {
      const previous = before ? before.userId : userId
      if (userId !== previous) {
        checkedFor = null
        deps.restoreFlow.reset()
        if (previous !== null) {
          const forgotten = forgetPreviousAccount(deps.outbox)
          enqueue(() => forgotten)
        } else scheduler.notifyChange()
      }
      if (active) checkOnce()
    },
    { flush: 'sync', immediate: true },
  )

  await resumePendingSync(deps.outbox, scheduler)
  scheduler.notifyChange()

  return () => {
    stopRestored()
    stopResume()
    stopNetwork()
    stopAccountWatch()
  }
}

async function forgetPreviousAccount(outbox: SyncDependencies['outbox']): Promise<void> {
  try {
    await outbox.forgetAccount()
  } catch (cause) {
    console.warn('File de synchro non oubliée au départ du compte :', cause)
  }
}

/** Composition réelle : les repositories sur la base de l'appareil, le statut Plus des stores. */
export async function createDefaultSyncDependencies(): Promise<SyncDependencies> {
  const tables: RestorableTable[] = [
    await getDeviceRepository(),
    await getAnimalsRepository(),
    await getVaccinationsRepository(),
    await getVaccinationInjectionsRepository(),
    await getTreatmentsRepository(),
    await getTreatmentPeriodsRepository(),
    await getTreatmentDosesRepository(),
    await getWeightRepository(),
    await getCarnetSettingsRepository(),
  ]
  const userId = () => useAuthStore().userId
  const { outbox, cycle, restore } = await createLocalSyncContext({
    tables,
    userId,
    isEligible: () => useAuthStore().hasPlusAccount && usePurchaseStore().status.plan !== 'none',
    onRemindersOutdated: syncAllReminders,
  })
  const restoreFlow = createRestoreFlow(restore)
  provideRestoreFlow(restoreFlow)
  const accountBackup = createAccountBackupService({
    outbox: () => outbox,
    tables: () => tables,
    animals: getAnimalsRepository,
    restore,
    userId,
  })

  return {
    outbox,
    runCycle: () => cycle.runCycle(),
    userId,
    sessionActive: () => useAuthStore().sessionState === 'active',
    checkAccountBackup: () => accountBackup.check(),
    restoreFlow,
  }
}
