import { watch } from 'vue'

import { onAppResume } from '@/core/app-lifecycle/app-resume'
import { getDeviceRepository } from '@/core/device/device.repository'
import { createLocalSyncContext } from '@/core/sync/service/local-sync-context'
import { onNetworkOnline } from '@/core/sync/service/network-status'
import type { SyncOutboxRepository } from '@/core/sync/repository/sync-outbox.repository'
import type { SyncCycleOutbox } from '@/core/sync/service/sync-cycle'
import { createSyncScheduler, resumePendingSync } from '@/core/sync/service/sync-scheduler'
import type { SyncableTable } from '@/core/sync/service/syncable-table'
import { getAnimalsRepository } from '@/features/animals/repository/animals.repository'
import { useAuthStore } from '@/features/auth/store/auth.store'
import { usePurchaseStore } from '@/features/purchase/store/purchase.store'
import { getCarnetSettingsRepository } from '@/features/settings/repository/carnet-settings.repository'
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
}

/**
 * Branche le cycle sur ses déclencheurs (lancement, retour au premier plan, retour du réseau,
 * connexion réussie) ; le debounce après écriture est déjà câblé côté triggers SQLite. Le compte
 * ne disparaît qu'à la déconnexion explicite : la synchro oublie alors sa file et ses curseurs.
 */
export async function installSync(deps: SyncDependencies): Promise<() => void> {
  const scheduler = createSyncScheduler({ runCycle: deps.runCycle })

  const stopResume = onAppResume(() => scheduler.notifyChange())
  const stopNetwork = onNetworkOnline(() => scheduler.notifyChange())
  const stopUserWatch = watch(
    deps.userId,
    (userId, previous) => {
      if (userId !== null) scheduler.notifyChange()
      else if (previous !== null) void forgetSignedOutAccount(deps.outbox)
    },
    { flush: 'sync' },
  )

  await resumePendingSync(deps.outbox, scheduler)
  scheduler.notifyChange()

  return () => {
    stopResume()
    stopNetwork()
    stopUserWatch()
  }
}

async function forgetSignedOutAccount(outbox: SyncDependencies['outbox']): Promise<void> {
  try {
    await outbox.forgetAccount()
  } catch (cause) {
    console.warn('File de synchro non oubliée à la déconnexion :', cause)
  }
}

/** Composition réelle : les repositories sur la base de l'appareil, le statut Plus des stores. */
export async function createDefaultSyncDependencies(): Promise<SyncDependencies> {
  const tables: SyncableTable[] = [
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
  const { outbox, cycle } = await createLocalSyncContext({
    tables,
    userId,
    isEligible: () => useAuthStore().hasPlusAccount && usePurchaseStore().status.plan !== 'none',
    onRemindersOutdated: syncAllReminders,
  })

  return { outbox, runCycle: () => cycle.runCycle(), userId }
}
