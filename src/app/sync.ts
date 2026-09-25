import { watch } from 'vue'

import { onAppResume } from '@/core/app-lifecycle/app-resume'
import { createLocalSyncContext } from '@/core/sync/service/local-sync-context'
import { onNetworkOnline } from '@/core/sync/service/network-status'
import type { SyncCycleOutbox } from '@/core/sync/service/sync-cycle'
import { createSyncScheduler, resumePendingSync } from '@/core/sync/service/sync-scheduler'
import type { SyncableTable } from '@/core/sync/service/syncable-table'
import { getAnimalsRepository } from '@/features/animals/repository/animals.repository'
import { useAuthStore } from '@/features/auth/store/auth.store'
import { usePurchaseStore } from '@/features/purchase/store/purchase.store'
import { getTreatmentDosesRepository } from '@/features/treatments/repository/treatment-doses.repository'
import { getTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import { getVaccinationInjectionsRepository } from '@/features/vaccinations/repository/vaccination-injections.repository'
import { getVaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'
import { getWeightRepository } from '@/features/weight/repository/weight.repository'
import { syncAllReminders } from './reminders-sync'

export interface SyncDependencies {
  outbox: SyncCycleOutbox
  runCycle: () => Promise<void>
  userId: () => string | null
}

/**
 * Branche le cycle sur ses déclencheurs (lancement, retour au premier plan, retour du réseau,
 * connexion réussie) ; le debounce après écriture est déjà câblé côté triggers SQLite.
 */
export async function installSync(deps: SyncDependencies): Promise<() => void> {
  const scheduler = createSyncScheduler({ runCycle: deps.runCycle })

  const stopResume = onAppResume(() => scheduler.notifyChange())
  const stopNetwork = onNetworkOnline(() => scheduler.notifyChange())
  const stopUserWatch = watch(deps.userId, (userId) => {
    if (userId !== null) scheduler.notifyChange()
  })

  await resumePendingSync(deps.outbox, scheduler)
  scheduler.notifyChange()

  return () => {
    stopResume()
    stopNetwork()
    stopUserWatch()
  }
}

/** Composition réelle : les repositories sur la base de l'appareil, le statut Plus des stores. */
export async function createDefaultSyncDependencies(): Promise<SyncDependencies> {
  const tables: SyncableTable[] = [
    await getAnimalsRepository(),
    await getVaccinationsRepository(),
    await getVaccinationInjectionsRepository(),
    await getTreatmentsRepository(),
    await getTreatmentDosesRepository(),
    await getWeightRepository(),
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
