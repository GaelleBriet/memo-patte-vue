// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { applyFixtures } from '@/core/dev/fixtures'
import { createDeviceRepository } from '@/core/device/device.repository'
import { createSyncOutboxRepository } from '@/core/sync/repository/sync-outbox.repository'
import { createSyncCycle } from '@/core/sync/service/sync-cycle'
import type { SyncRow, SyncableTable } from '@/core/sync/service/syncable-table'
import { createAnimalsRepository } from '@/features/animals/repository/animals.repository'
import { createCarnetSettingsRepository } from '@/features/settings/repository/carnet-settings.repository'
import { createTreatmentDosesRepository } from '@/features/treatments/repository/treatment-doses.repository'
import { createTreatmentPeriodsRepository } from '@/features/treatments/repository/treatment-periods.repository'
import { createTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import { createVaccinationInjectionsRepository } from '@/features/vaccinations/repository/vaccination-injections.repository'
import { createVaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'
import { createWeightRepository } from '@/features/weight/repository/weight.repository'

const SERVER_DATE = '2026-10-16T07:00:00.000Z'

function tables(db: InMemoryDb): SyncableTable[] {
  return [
    createDeviceRepository(db),
    createAnimalsRepository(db),
    createVaccinationsRepository(db),
    createVaccinationInjectionsRepository(db),
    createTreatmentsRepository(db),
    createTreatmentPeriodsRepository(db),
    createTreatmentDosesRepository(db),
    createWeightRepository(db),
    createCarnetSettingsRepository(db),
  ]
}

const TABLE_OF: Record<string, string> = {
  device: 'device',
  animal: 'animal',
  vaccination: 'vaccination',
  vaccination_injection: 'vaccination_injection',
  treatment: 'treatment',
  treatment_period: 'treatment_period',
  treatment_dose: 'treatment_dose',
  weight_entry: 'weight_entry',
  carnet_settings: 'carnet_settings',
}

describe.each(Object.keys(TABLE_OF))('%s : la ligne gardée par le serveur', (entity) => {
  let db: InMemoryDb
  let table: SyncableTable
  let sent: SyncRow

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
    await createDeviceRepository(db).register(
      { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', installedAt: '2026-10-01T07:00:00.000Z' },
      'Pixel 8',
    )
    await createCarnetSettingsRepository(db).update({ vaccineReminderTime: '18:30' })
    table = tables(db).find((candidate) => candidate.entity === entity)!
    const [{ id }] = (await db.query<{ id: string }>(
      `SELECT id FROM ${TABLE_OF[entity]} LIMIT 1`,
    )) as [{ id: string }]
    sent = (await table.getRowForPush(id))!
    await db.run('INSERT OR REPLACE INTO sync_state (id, enabled) VALUES (1, 1)')
    await db.run('DELETE FROM sync_outbox')
    await db.run('INSERT INTO sync_outbox (entity, entity_id, queued_at) VALUES (?, ?, ?)', [
      entity,
      id,
      sent.updated_at,
    ])
  })

  afterEach(() => {
    db.close()
  })

  async function pushKeeping(kept: SyncRow, beforeReply: () => Promise<void> = async () => {}) {
    const outbox = createSyncOutboxRepository(db)
    await createSyncCycle({
      db,
      outbox,
      pushes: { open: async (_userId, sentAt) => ({ id: 'envoi', sentAt }) },
      tables: [
        {
          ...table,
          entity,
          pushRow: async () => {
            await beforeReply()
            return kept
          },
          pullPage: async () => ({ rows: [], stamps: [], cursor: null }),
        },
      ],
      userId: () => 'utilisateur',
      isEligible: () => true,
    }).runCycle()
    return outbox.listPending()
  }

  it('remplace la ligne envoyée, sans nouvelle entrée en file', async () => {
    const kept = { ...sent, created_at: SERVER_DATE, updated_at: SERVER_DATE }

    await expect(pushKeeping(kept)).resolves.toEqual([])
    await expect(table.getRowForPush(sent.id)).resolves.toEqual(kept)
  })

  it('garde la ligne locale modifiée depuis l’envoi', async () => {
    const touched = '2026-10-22T08:07:00.000Z'

    await pushKeeping({ ...sent, created_at: SERVER_DATE, updated_at: SERVER_DATE }, async () => {
      await db.run(`UPDATE ${TABLE_OF[entity]} SET updated_at = ? WHERE id = ?`, [touched, sent.id])
    })

    await expect(table.getRowForPush(sent.id)).resolves.toEqual({ ...sent, updated_at: touched })
  })
})
