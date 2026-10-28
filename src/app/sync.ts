import { getDeviceRepository } from '@/core/device/device.repository'
import type { SyncDependencies } from '@/core/sync/service/account-sync'
import { createBackupFactsReader, provideBackupFacts } from '@/core/sync/service/backup-facts'
import { createLocalSyncContext } from '@/core/sync/service/local-sync-context'
import { isNetworkConnected } from '@/core/sync/service/network-status'
import type { RestorableTable } from '@/core/sync/service/account-restore'
import { providePhotoRestoreStatus } from '@/core/sync/service/photo-restore-status'
import { createRestoreFlow, provideRestoreFlow } from '@/core/sync/service/restore-flow'
import { getAnimalsRepository } from '@/features/animals/repository/animals.repository'
import { useAuthStore } from '@/features/auth/store/auth.store'
import { usePurchaseStore } from '@/features/purchase/store/purchase.store'
import { getCarnetSettingsRepository } from '@/features/settings/repository/carnet-settings.repository'
import { createAccountBackupService } from '@/features/settings/service/account-backup.service'
import { getTreatmentDosesRepository } from '@/features/treatments/repository/treatment-doses.repository'
import { getTreatmentPeriodsRepository } from '@/features/treatments/repository/treatment-periods.repository'
import { getTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import { getVaccinationInjectionsRepository } from '@/features/vaccinations/repository/vaccination-injections.repository'
import { getVaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'
import { getWeightRepository } from '@/features/weight/repository/weight.repository'
import { syncAllReminders } from '@/features/treatments/service/reminders-sync.service'

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
  const sessionActive = () => useAuthStore().sessionState === 'active'
  const signInNeeded = () => useAuthStore().sessionState === 'needs-sign-in'
  const isEligible = () =>
    useAuthStore().hasPlusAccount && usePurchaseStore().status.plan !== 'none'
  const { outbox, cycle, restore, photoRestore } = await createLocalSyncContext({
    tables,
    userId,
    sessionActive,
    isEligible,
    onRemindersOutdated: syncAllReminders,
  })
  providePhotoRestoreStatus(photoRestore.isRunning)
  provideBackupFacts(
    createBackupFactsReader({
      outbox,
      isEligible,
      signInNeeded,
      isOnline: isNetworkConnected,
    }),
  )
  const restoreFlow = createRestoreFlow(restore, signInNeeded)
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
    sessionActive,
    checkAccountBackup: () => accountBackup.check(),
    restoreFlow,
    restoreMissingPhotos: (account, options) => photoRestore.restoreMissing(account, options),
  }
}
