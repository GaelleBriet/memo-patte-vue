import { describe, expect, it, vi } from 'vitest'
import { SYNC_ENTITY_ORDER } from '@/core/sync/repository/sync-entity-order'
import {
  createLocalSyncContext,
  type LocalSyncContext,
} from '@/core/sync/service/local-sync-context'
import {
  providePhotoRestoreStatus,
  usePhotosDownloading,
} from '@/core/sync/service/photo-restore-status'
import type { useAuthStore } from '@/features/auth/store/auth.store'
import type { usePurchaseStore } from '@/features/purchase/store/purchase.store'
import { createDefaultSyncDependencies } from '../sync'

const auth = vi.hoisted(() => ({
  sessionState: 'none' as ReturnType<typeof useAuthStore>['sessionState'],
  hasPlusAccount: false,
}))
const purchase = vi.hoisted(() => ({
  status: { plan: 'none' } as Pick<ReturnType<typeof usePurchaseStore>['status'], 'plan'>,
}))

const photos = vi.hoisted(() => ({ isRunning: { value: false } }))
const photoSweep = vi.hoisted(() => ({ sweep: vi.fn<(userId: string) => Promise<void>>() }))

vi.mock('@/features/auth/store/auth.store', () => ({ useAuthStore: () => auth }))
vi.mock('@/features/purchase/store/purchase.store', () => ({ usePurchaseStore: () => purchase }))

vi.mock('@/core/sync/service/local-sync-context', () => ({
  createLocalSyncContext: vi.fn<typeof createLocalSyncContext>(async () => {
    const { ref } = await import('vue')
    photos.isRunning = ref(false)
    return {
      outbox: {},
      cycle: { runCycle: async () => {} },
      photoRestore: { isRunning: photos.isRunning },
      photoSweep,
    } as unknown as LocalSyncContext
  }),
}))
vi.mock('@/core/device/device.repository', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDeviceRepository: async () => ({ entity: 'device' }),
}))
vi.mock('@/features/animals/repository/animals.repository', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getAnimalsRepository: async () => ({ entity: 'animal' }),
}))
vi.mock('@/features/vaccinations/repository/vaccinations.repository', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getVaccinationsRepository: async () => ({ entity: 'vaccination' }),
}))
vi.mock(
  '@/features/vaccinations/repository/vaccination-injections.repository',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    getVaccinationInjectionsRepository: async () => ({ entity: 'vaccination_injection' }),
  }),
)
vi.mock('@/features/treatments/repository/treatments.repository', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getTreatmentsRepository: async () => ({ entity: 'treatment' }),
}))
vi.mock(
  '@/features/treatments/repository/treatment-periods.repository',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    getTreatmentPeriodsRepository: async () => ({ entity: 'treatment_period' }),
  }),
)
vi.mock('@/features/treatments/repository/treatment-doses.repository', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getTreatmentDosesRepository: async () => ({ entity: 'treatment_dose' }),
}))
vi.mock('@/features/weight/repository/weight.repository', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getWeightRepository: async () => ({ entity: 'weight_entry' }),
}))
vi.mock('@/features/settings/repository/carnet-settings.repository', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getCarnetSettingsRepository: async () => ({ entity: 'carnet_settings' }),
}))

describe('createDefaultSyncDependencies', () => {
  it('tire chaque table après son parent, dans l’ordre où la file pousse', async () => {
    await createDefaultSyncDependencies()

    const [deps] = vi.mocked(createLocalSyncContext).mock.calls[0] ?? []
    expect(deps?.tables.map((table) => table.entity)).toEqual(SYNC_ENTITY_ORDER)
  })

  it('donne au ménage des photos du cloud la table des animaux, et le lance pour le compte', async () => {
    const sync = await createDefaultSyncDependencies()

    const [deps] = vi.mocked(createLocalSyncContext).mock.calls.at(-1) ?? []
    expect(deps?.cloudAnimals).toEqual({ entity: 'animal' })
    await sync.sweepCloudPhotos('user-1')
    expect(photoSweep.sweep).toHaveBeenCalledExactlyOnceWith('user-1')
  })

  it('branche l’état de la restauration des photos pour l’accueil', async () => {
    const downloading = usePhotosDownloading()
    await createDefaultSyncDependencies()

    expect(downloading.value).toBe(false)
    photos.isRunning.value = true
    expect(downloading.value).toBe(true)
    photos.isRunning.value = false
    providePhotoRestoreStatus(null)
  })

  it('donne à la synchro et à ses photos la session du compte, active ou non', async () => {
    const sync = await createDefaultSyncDependencies()

    const [deps] = vi.mocked(createLocalSyncContext).mock.calls.at(-1) ?? []
    auth.sessionState = 'needs-sign-in'
    expect(deps?.sessionActive()).toBe(false)
    expect(sync.sessionActive()).toBe(false)
    auth.sessionState = 'active'
    expect(deps?.sessionActive()).toBe(true)
    expect(sync.sessionActive()).toBe(true)
  })

  it('ne demande la reconnexion à la synchro que pour une session expirée', async () => {
    const sync = await createDefaultSyncDependencies()

    auth.sessionState = 'needs-sign-in'
    expect(sync.signInNeeded()).toBe(true)
    auth.sessionState = 'needs-refresh'
    expect(sync.signInNeeded()).toBe(false)
    auth.sessionState = 'active'
    expect(sync.signInNeeded()).toBe(false)
  })

  it('fait attendre la reconnexion à la restauration quand la session a expiré', async () => {
    const sync = await createDefaultSyncDependencies()

    auth.sessionState = 'needs-sign-in'
    sync.restoreFlow.unreachable()
    expect(sync.restoreFlow.state.value).toEqual({ step: 'waiting-sign-in', chosen: false })
    auth.sessionState = 'needs-refresh'
    sync.restoreFlow.unreachable()
    expect(sync.restoreFlow.state.value).toEqual({ step: 'waiting-network', chosen: false })
  })

  it('donne à la synchro le statut Plus de l’appareil, celui que lit aussi l’éligibilité du cycle', async () => {
    const sync = await createDefaultSyncDependencies()

    const [deps] = vi.mocked(createLocalSyncContext).mock.calls.at(-1) ?? []
    auth.hasPlusAccount = true
    purchase.status = { plan: 'none' }
    expect(sync.plusActive()).toBe(false)
    expect(deps?.isEligible()).toBe(false)
    purchase.status = { plan: 'annual' }
    expect(sync.plusActive()).toBe(true)
    expect(deps?.isEligible()).toBe(true)
    auth.hasPlusAccount = false
    expect(deps?.isEligible()).toBe(false)
  })
})
