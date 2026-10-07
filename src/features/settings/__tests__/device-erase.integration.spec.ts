// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { migrationTableNames } from '@/core/db/clear-all-tables'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { applyFixtures } from '@/core/dev/fixtures'
import { createDeviceRepository } from '@/core/device/device.repository'
import { createSyncOutboxRepository } from '@/core/sync/repository/sync-outbox.repository'
import { createAnimalsRepository } from '@/features/animals/repository/animals.repository'
import { createCarnetSettingsRepository } from '@/features/settings/repository/carnet-settings.repository'
import { createTreatmentDosesRepository } from '@/features/treatments/repository/treatment-doses.repository'
import { createTreatmentPeriodsRepository } from '@/features/treatments/repository/treatment-periods.repository'
import { createTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import { createVaccinationInjectionsRepository } from '@/features/vaccinations/repository/vaccination-injections.repository'
import { createVaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'
import { createWeightRepository } from '@/features/weight/repository/weight.repository'
import { createDeviceEraseService } from '../service/device-erase.service'

const DEVICE = {
  id: '0b8a3a52-3f1e-4d4a-9a59-6f7e3c2b1a10',
  installedAt: '2026-09-01T08:00:00.000Z',
}

describe('effacement des données dans une vraie base', () => {
  let db: InMemoryDb

  function service() {
    return createDeviceEraseService({
      animals: () => createAnimalsRepository(db),
      tables: [
        () => createVaccinationInjectionsRepository(db),
        () => createVaccinationsRepository(db),
        () => createTreatmentDosesRepository(db),
        () => createTreatmentPeriodsRepository(db),
        () => createTreatmentsRepository(db),
        () => createWeightRepository(db),
        () => createCarnetSettingsRepository(db),
        () => createDeviceRepository(db),
      ],
      syncOutbox: () => createSyncOutboxRepository(db),
      account: { isSignedIn: () => true, signOut: async () => {} },
      notifications: { cancelAll: async () => {}, rebuild: async () => {} },
      photos: { deleteAll: async () => {} },
      analytics: { optOut: async () => {} },
      preferences: { clearAll: () => {} },
      restart: vi.fn<() => void>(),
    })
  }

  async function rowCount(table: string): Promise<number> {
    const [row] = await db.query<{ total: number }>(`SELECT COUNT(*) AS total FROM ${table}`)
    return row?.total ?? 0
  }

  beforeEach(async () => {
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    await applyFixtures({
      token: 'maquettes-1',
      storage: { getItem: () => null, setItem: () => undefined },
      db,
      repositories: {
        animals: createAnimalsRepository(db),
        vaccinations: createVaccinationsRepository(db),
        vaccinationInjections: createVaccinationInjectionsRepository(db),
        treatments: createTreatmentsRepository(db),
        treatmentPeriods: createTreatmentPeriodsRepository(db),
        treatmentDoses: createTreatmentDosesRepository(db),
        weight: createWeightRepository(db),
      },
    })
    // Les fixtures vident aussi `sync_state` : la ligne d'un abonné en cours de synchro est reposée.
    await db.run(
      `INSERT OR REPLACE INTO sync_state (id, enabled, restoring, last_synced_at)
       VALUES (1, 1, 1, '2026-09-30T10:00:00.000Z')`,
    )
    await createSyncOutboxRepository(db).setLastPulledAt('animal', '2026-09-30T10:00:00.000Z')
    await createDeviceRepository(db).register(DEVICE, 'Pixel 8')
    await createCarnetSettingsRepository(db).update({ vaccineReminderTime: '08:30' })
  })

  afterEach(() => {
    db.close()
  })

  it('vide chaque table créée par les migrations, et remet la synchro à son état de départ', async () => {
    expect(await rowCount('animal')).toBeGreaterThan(0)
    expect(await rowCount('sync_outbox')).toBeGreaterThan(0)

    await service().erase()

    const tables = migrationTableNames().filter((table) => table !== 'sync_state')
    for (const table of tables)
      expect({ table, rows: await rowCount(table) }).toEqual({ table, rows: 0 })
    expect(await db.query('SELECT id, enabled, restoring, last_synced_at FROM sync_state')).toEqual(
      [{ id: 1, enabled: 0, restoring: 0, last_synced_at: null }],
    )
  })

  it('signale des changements pas encore envoyés à la sauvegarde cloud', async () => {
    expect(await service().situation()).toEqual({ signedIn: true, hasUnsyncedChanges: true })

    await createSyncOutboxRepository(db).clear()

    expect(await service().situation()).toEqual({ signedIn: true, hasUnsyncedChanges: false })
  })
})
