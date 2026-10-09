import { syncAllReminders } from '@/features/treatments/service/reminders-sync.service'
import { optOut } from '@/core/analytics'
import { restartApp } from '@/core/app-lifecycle/restart-app'
import { getDeviceRepository } from '@/core/device/device.repository'
import { cancelAllNotifications } from '@/core/notifications'
import { deleteAllPhotos } from '@/core/photos/photo-storage'
import {
  getSyncOutboxRepository,
  type SyncOutboxRepository,
} from '@/core/sync/repository/sync-outbox.repository'
import {
  getAnimalsRepository,
  type AnimalsRepository,
} from '@/features/animals/repository/animals.repository'
import {
  isSignedInOnDevice,
  signOutDevice,
} from '@/features/auth/service/device-account-state.service'
import { getTreatmentDosesRepository } from '@/features/treatments/repository/treatment-doses.repository'
import { getTreatmentPeriodsRepository } from '@/features/treatments/repository/treatment-periods.repository'
import { getTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import { getVaccinationInjectionsRepository } from '@/features/vaccinations/repository/vaccination-injections.repository'
import { getVaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'
import { getWeightRepository } from '@/features/weight/repository/weight.repository'
import { cancelAllDueReminders } from '@/core/notifications/due-reminders-schedule'
import { clearAppStorage } from '@/shared/utils/app-storage'
import { errorSummary } from '@/shared/utils/error-summary'
import { getCarnetSettingsRepository } from '../repository/carnet-settings.repository'

type Provider<T> = () => T | Promise<T>

type SqlStatement = ReturnType<AnimalsRepository['eraseAllStatement']>

export type DeviceEraseSituation = { signedIn: boolean; hasUnsyncedChanges: boolean }

export type DeviceEraseDependencies = {
  animals: Provider<Pick<AnimalsRepository, 'eraseAll'>>
  /** Toute table qui référence un animal, et les autres tables de l'appareil. */
  tables: Provider<{ eraseAllStatement(): SqlStatement }>[]
  syncOutbox: Provider<Pick<SyncOutboxRepository, 'listPending' | 'eraseAllStatements'>>
  account: { isSignedIn(): boolean; signOut(): Promise<void> }
  notifications: { cancelAll(): Promise<void>; rebuild(): Promise<void> }
  photos: { deleteAll(): Promise<void> }
  analytics: { optOut(): Promise<void> }
  preferences: { clearAll(): void }
  restart: () => void
}

export function createDeviceEraseService({
  animals,
  tables,
  syncOutbox,
  account,
  notifications,
  photos,
  analytics,
  preferences,
  restart,
}: DeviceEraseDependencies) {
  async function eraseDatabase(): Promise<void> {
    const [animalsRepository, outbox, ...repositories] = await Promise.all([
      animals(),
      syncOutbox(),
      ...tables.map((table) => table()),
    ])
    await animalsRepository.eraseAll([
      ...outbox.eraseAllStatements(),
      ...repositories.map((repository) => repository.eraseAllStatement()),
    ])
  }

  async function attempt(step: string, run: () => Promise<void>): Promise<void> {
    try {
      await run()
    } catch (cause) {
      console.warn(`Effacement, ${step} :`, errorSummary(cause))
    }
  }

  return {
    async situation(): Promise<DeviceEraseSituation> {
      const signedIn = account.isSignedIn()
      if (!signedIn) return { signedIn, hasUnsyncedChanges: false }
      try {
        const pending = await (await syncOutbox()).listPending()
        return { signedIn, hasUnsyncedChanges: pending.length > 0 }
      } catch (cause) {
        console.warn('File de synchro illisible :', errorSummary(cause))
        return { signedIn, hasUnsyncedChanges: true }
      }
    },

    /**
     * Lève si l'annulation des notifications ou l'effacement de la base échoue : la déconnexion a
     * déjà eu lieu, le carnet reste intact. Une fois la base effacée, va jusqu'au redémarrage.
     */
    async erase(): Promise<void> {
      if (account.isSignedIn()) await account.signOut()
      await notifications.cancelAll()
      try {
        await eraseDatabase()
      } catch (cause) {
        await attempt('rappels', notifications.rebuild)
        throw cause
      }
      await attempt('photos', photos.deleteAll)
      await attempt('statistiques', analytics.optOut)
      await attempt('réglages', async () => preferences.clearAll())
      restart()
    },
  }
}

export type DeviceEraseService = ReturnType<typeof createDeviceEraseService>

export const deviceEraseService = createDeviceEraseService({
  animals: getAnimalsRepository,
  tables: [
    getVaccinationInjectionsRepository,
    getVaccinationsRepository,
    getTreatmentDosesRepository,
    getTreatmentPeriodsRepository,
    getTreatmentsRepository,
    getWeightRepository,
    getCarnetSettingsRepository,
    getDeviceRepository,
  ],
  syncOutbox: getSyncOutboxRepository,
  account: { isSignedIn: isSignedInOnDevice, signOut: signOutDevice },
  notifications: {
    cancelAll: () => cancelAllDueReminders({ cancelAllNotifications }),
    rebuild: syncAllReminders,
  },
  photos: { deleteAll: deleteAllPhotos },
  analytics: { optOut },
  preferences: { clearAll: clearAppStorage },
  restart: restartApp,
})
