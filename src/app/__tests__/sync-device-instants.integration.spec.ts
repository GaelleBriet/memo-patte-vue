// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createDeviceRepository } from '@/core/device/device.repository'
import { createFakeSyncServer, type FakeSyncServer } from '@/core/sync/__tests__/fake-sync-server'
import { createSyncOutboxRepository } from '@/core/sync/repository/sync-outbox.repository'
import { createSyncPushRepository } from '@/core/sync/repository/sync-push.repository'
import { createSyncCycle } from '@/core/sync/service/sync-cycle'
import { createAnimalsRepository } from '@/features/animals/repository/animals.repository'
import { toJsonExport } from '@/features/settings/logic/export-format'
import { parseExportFile } from '@/features/settings/logic/parse-export-file'
import { createCarnetSettingsRepository } from '@/features/settings/repository/carnet-settings.repository'
import { createDataExportService } from '@/features/settings/service/data-export.service'
import { createTreatmentDosesRepository } from '@/features/treatments/repository/treatment-doses.repository'
import { createTreatmentPeriodsRepository } from '@/features/treatments/repository/treatment-periods.repository'
import { createTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import { createVaccinationInjectionsRepository } from '@/features/vaccinations/repository/vaccination-injections.repository'
import { createVaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'
import { createWeightRepository } from '@/features/weight/repository/weight.repository'

const USER_ID = '99999999-9999-4999-8999-999999999999'
const NOW = new Date('2026-10-19T07:00:00.000Z')
const INSTALLED_AT = '2026-10-01T07:00:00.000Z'

async function createPhone(client: SupabaseClient) {
  const db = await createInMemoryDb()
  await db.run('UPDATE sync_state SET enabled = 1 WHERE id = 1')
  const loadSupabaseClient = async () => client
  const devices = createDeviceRepository(db, { loadSupabaseClient })
  const cycle = createSyncCycle({
    db,
    outbox: createSyncOutboxRepository(db),
    pushes: createSyncPushRepository(loadSupabaseClient),
    tables: [devices],
    userId: () => USER_ID,
    isEligible: () => true,
  })
  return { db, devices, sync: () => cycle.runCycle() }
}

function exportOf(db: InMemoryDb) {
  return createDataExportService({
    carnetSettings: () => createCarnetSettingsRepository(db),
    animals: () => createAnimalsRepository(db),
    vaccinations: () => createVaccinationsRepository(db),
    vaccinationInjections: () => createVaccinationInjectionsRepository(db),
    treatments: () => createTreatmentsRepository(db),
    treatmentPeriods: () => createTreatmentPeriodsRepository(db),
    treatmentDoses: () => createTreatmentDosesRepository(db),
    weight: () => createWeightRepository(db),
    devices: () => createDeviceRepository(db),
    deliver: async () => 'shared',
    now: () => NOW,
    appVersion: 'test',
    weightUnit: () => 'kg',
    locale: () => 'fr',
  }).collect()
}

describe('date d’installation d’un appareil, rendue en +00:00 par PostgREST', () => {
  let server: FakeSyncServer
  let a: Awaited<ReturnType<typeof createPhone>>
  let b: Awaited<ReturnType<typeof createPhone>>

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW })
    server = createFakeSyncServer()
    a = await createPhone(server.client)
    b = await createPhone(server.client)
    await a.devices.register(
      { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', installedAt: INSTALLED_AT },
      'Pixel 8',
    )
    await a.sync()
    await b.sync()
  })

  afterEach(() => {
    vi.useRealTimers()
    a.db.close()
    b.db.close()
  })

  it('le serveur la rend en +00:00 ; reprise et pull la gardent en Z', async () => {
    expect(server.rows('device').map(({ installed_at }) => installed_at)).toEqual([
      '2026-10-01T07:00:00+00:00',
    ])
    for (const phone of [a, b]) {
      await expect(phone.devices.listRecords()).resolves.toEqual([
        expect.objectContaining({ installedAt: INSTALLED_AT }),
      ])
    }
  })

  it('l’export du téléphone qui a poussé se réimporte', async () => {
    const data = await exportOf(a.db)

    expect(parseExportFile(toJsonExport(data, { exportedAt: NOW, appVersion: 'test' }))).toEqual({
      ok: true,
      file: { schemaVersion: expect.any(Number), data },
    })
  })
})
