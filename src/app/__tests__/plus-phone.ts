import { createDeviceRepository } from '@/core/device/device.repository'
import type { FakeSyncServer } from '@/core/sync/__tests__/fake-sync-server'
import { keptChoiceSnapshot } from '@/core/sync/__tests__/kept-choice-snapshot'
import { createSyncPushRepository } from '@/core/sync/repository/sync-push.repository'
import { createAccountRestore } from '@/core/sync/service/account-restore'
import { createLocalSyncOutbox } from '@/core/sync/service/local-sync-outbox'
import { installSync } from '@/core/sync/service/account-sync'
import { createRestoreFlow } from '@/core/sync/service/restore-flow'
import { createSyncCycle } from '@/core/sync/service/sync-cycle'
import { useAuthStore } from '@/features/auth/store/auth.store'
import { createCheckout } from '@/features/purchase/service/checkout.service'
import { installPlusAccountLink } from '@/features/purchase/service/plus-account-link.service'
import { usePurchaseStore } from '@/features/purchase/store/purchase.store'
import { createAnimalsRepository } from '@/features/animals/repository/animals.repository'
import { createCarnetSettingsRepository } from '@/features/settings/repository/carnet-settings.repository'
import { createAccountBackupService } from '@/features/settings/service/account-backup.service'
import { createTreatmentDosesRepository } from '@/features/treatments/repository/treatment-doses.repository'
import { createTreatmentPeriodsRepository } from '@/features/treatments/repository/treatment-periods.repository'
import { createTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import { createVaccinationInjectionsRepository } from '@/features/vaccinations/repository/vaccination-injections.repository'
import { createVaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'
import { createWeightRepository } from '@/features/weight/repository/weight.repository'

type Db = Parameters<typeof createAnimalsRepository>[0]

export type PlusPhoneAccess = {
  userId: () => string | null
  /** Ce que `app/sync.ts` compose : compte Plus sur l'appareil et statut Plus du store. */
  isEligible: () => boolean
}

/** Un téléphone sur base réelle et serveur factice, sa synchro gatée comme dans l'app. */
export async function createPlusPhone<D extends Db>(
  db: D,
  server: FakeSyncServer,
  deviceId: string,
  access: PlusPhoneAccess,
) {
  await db.execute('PRAGMA foreign_keys = ON')
  const deps = { loadSupabaseClient: async () => server.client }
  const animals = createAnimalsRepository(db, deps)
  const weight = createWeightRepository(db, deps)
  const device = createDeviceRepository(db, deps)
  const tables = [
    device,
    animals,
    createVaccinationsRepository(db, deps),
    createVaccinationInjectionsRepository(db, deps),
    createTreatmentsRepository(db, deps),
    createTreatmentPeriodsRepository(db, deps),
    createTreatmentDosesRepository(db, deps),
    weight,
    createCarnetSettingsRepository(db, deps),
  ]
  const outbox = createLocalSyncOutbox(db)
  const cycle = createSyncCycle({
    db,
    outbox,
    pushes: createSyncPushRepository(deps.loadSupabaseClient),
    tables,
    userId: access.userId,
    isEligible: access.isEligible,
  })
  const restore = createAccountRestore({
    db,
    outbox,
    tables,
    userId: access.userId,
    onRemindersOutdated: async () => {},
    choiceSnapshot: keptChoiceSnapshot(),
  })
  const backup = createAccountBackupService({
    outbox: () => outbox,
    tables: () => tables,
    animals: () => animals,
    restore,
    userId: access.userId,
  })
  await device.register({ id: deviceId, installedAt: '2026-09-29T07:00:00.000Z' }, 'Pixel 8')
  return { animals, weight, outbox, restore, backup, runCycle: () => cycle.runCycle() }
}

export type PlusPhone = Awaited<ReturnType<typeof createPlusPhone>>

/** Ce que `main.ts` branche pour Plus : l'achat suit le compte, la synchro et la restauration suivent la session. */
export async function launchPlusApp(phone: PlusPhone) {
  const auth = useAuthStore()
  const signInNeeded = () => auth.sessionState === 'needs-sign-in'
  const flow = createRestoreFlow(phone.restore, signInNeeded, () => auth.signOut())
  const unlink = installPlusAccountLink(() => auth.userId)
  const stopSync = await installSync({
    outbox: phone.outbox,
    runCycle: phone.runCycle,
    userId: () => auth.userId,
    sessionActive: () => auth.sessionState === 'active',
    signInNeeded,
    plusActive: isPlusActive,
    checkAccountBackup: () => phone.backup.check(),
    confirmCarnetSend: () => phone.backup.confirmSend(),
    restoreFlow: flow,
    restoreMissingPhotos: async () => {},
    sweepCloudPhotos: async () => {},
  })
  return {
    flow,
    stop() {
      unlink()
      stopSync()
    },
  }
}

export function phoneCheckout() {
  const auth = useAuthStore()
  return createCheckout(
    {
      accountId: () => auth.userId,
      hasSession: () => auth.sessionState === 'active',
      refreshSession: () => auth.refresh(),
      sessionRefused: () => auth.sessionState === 'needs-sign-in',
    },
    () => usePurchaseStore(),
  )
}

function isPlusActive(): boolean {
  return usePurchaseStore().status.plan !== 'none'
}

export function isPlusEligible(): boolean {
  return useAuthStore().hasPlusAccount && isPlusActive()
}
