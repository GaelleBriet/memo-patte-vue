import { describe, expect, it, vi } from 'vitest'
import { SYNC_ENTITY_ORDER } from '@/core/sync/repository/sync-outbox.repository'
import {
  createLocalSyncContext,
  type LocalSyncContext,
} from '@/core/sync/service/local-sync-context'
import { createDefaultSyncDependencies } from '../sync'

vi.mock('@/core/sync/service/local-sync-context', () => ({
  createLocalSyncContext: vi.fn<typeof createLocalSyncContext>(
    async () => ({ outbox: {}, cycle: { runCycle: async () => {} } }) as LocalSyncContext,
  ),
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
vi.mock('@/features/treatments/repository/treatment-doses.repository', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getTreatmentDosesRepository: async () => ({ entity: 'treatment_dose' }),
}))
vi.mock('@/features/weight/repository/weight.repository', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getWeightRepository: async () => ({ entity: 'weight_entry' }),
}))

describe('createDefaultSyncDependencies', () => {
  it('tire chaque table après son parent, dans l’ordre où la file pousse', async () => {
    await createDefaultSyncDependencies()

    const [deps] = vi.mocked(createLocalSyncContext).mock.calls[0] ?? []
    expect(deps?.tables.map((table) => table.entity)).toEqual(SYNC_ENTITY_ORDER)
  })
})
