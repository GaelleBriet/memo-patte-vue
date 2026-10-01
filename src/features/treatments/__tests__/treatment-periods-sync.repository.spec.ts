// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createFakeSyncServer, type FakeSyncServer } from '@/core/sync/__tests__/fake-sync-server'
import {
  createTreatmentPeriodsRepository,
  type TreatmentPeriodsRepository,
} from '../repository/treatment-periods.repository'
import { createTreatmentsRepository } from '../repository/treatments.repository'

const T_OLD = '2026-01-01T00:00:00.000Z'
const T_LOCAL = '2026-01-01T00:05:00.000Z'
const T_NEW = '2026-01-01T00:10:00.000Z'
const PG_LOCAL = '2026-01-01T00:05:00.000+00:00'
const USER_ID = '99999999-9999-4999-8999-999999999999'
const ANIMAL_ID = '11111111-1111-4111-8111-111111111111'
const TREATMENT_ID = '22222222-2222-4222-8222-222222222222'
const LATER_ID = '33333333-3333-4333-8333-333333333333'

const LOCAL_ROW = {
  id: TREATMENT_ID,
  treatment_id: TREATMENT_ID,
  animal_id: ANIMAL_ID,
  starts_on: '2026-01-01',
  first_due_on: '2026-01-02',
  ends_on: '2026-01-31',
  stopped_on: null,
  frequency_value: 1,
  frequency_unit: 'day',
  times: '08:00,20:00',
  dose_quantity: 0.5,
  dose_unit: 'tablet',
  reminder_offset_minutes: 15,
  reminder_time: null,
  created_at: T_LOCAL,
  updated_at: T_LOCAL,
  deleted_at: null,
}

function remotePeriod(overrides: Record<string, string | number | null> = {}) {
  return { ...LOCAL_ROW, id: LATER_ID, created_at: T_NEW, updated_at: T_NEW, ...overrides }
}

describe('treatmentPeriodsRepository — port de synchronisation', () => {
  let db: InMemoryDb
  let server: FakeSyncServer
  let repository: TreatmentPeriodsRepository

  function localRow(id: string) {
    return db.query('SELECT * FROM treatment_period WHERE id = ?', [id])
  }

  beforeEach(async () => {
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    server = createFakeSyncServer()
    repository = createTreatmentPeriodsRepository(db, {
      loadSupabaseClient: async () => server.client,
    })
    await db.run(
      `INSERT INTO animal (id, name, species, created_at, updated_at) VALUES (?, 'Luna', 'cat', ?, ?)`,
      [ANIMAL_ID, T_LOCAL, T_LOCAL],
    )
    await db.run(
      `INSERT INTO treatment (id, animal_id, name, type, created_at, updated_at)
       VALUES (?, ?, 'Amoxicilline', 'medication', ?, ?)`,
      [TREATMENT_ID, ANIMAL_ID, T_LOCAL, T_LOCAL],
    )
    await db.run(
      `INSERT INTO treatment_period
         (id, treatment_id, animal_id, starts_on, first_due_on, ends_on, frequency_value,
          frequency_unit, times, dose_quantity, dose_unit, reminder_offset_minutes, created_at,
          updated_at)
       VALUES (?, ?, ?, '2026-01-01', '2026-01-02', '2026-01-31', 1, 'day', '08:00,20:00', 0.5,
               'tablet', 15, ?, ?)`,
      [TREATMENT_ID, TREATMENT_ID, ANIMAL_ID, T_LOCAL, T_LOCAL],
    )
  })

  afterEach(() => {
    db.close()
  })

  it('expose son entité', () => {
    expect(repository.entity).toBe('treatment_period')
  })

  it('getRowForPush renvoie toutes les colonnes de la période, même supprimée logiquement', async () => {
    await db.run('UPDATE treatment_period SET deleted_at = ? WHERE id = ?', [T_NEW, TREATMENT_ID])

    await expect(repository.getRowForPush(TREATMENT_ID)).resolves.toEqual({
      ...LOCAL_ROW,
      deleted_at: T_NEW,
    })
  })

  it('getRowForPush renvoie null pour un identifiant inconnu', async () => {
    await expect(repository.getRowForPush('inconnu')).resolves.toBeNull()
  })

  it('crée localement une période distante inconnue, réglages compris', async () => {
    await db.runMany([
      repository.applyRemoteRowStatement(
        remotePeriod({ times: null, reminder_offset_minutes: null, reminder_time: '18:30' }),
      ),
    ])

    await expect(localRow(LATER_ID)).resolves.toEqual([
      remotePeriod({ times: null, reminder_offset_minutes: null, reminder_time: '18:30' }),
    ])
  })

  it("n'écrase pas une période locale plus récente, ni à égalité d'horodatage", async () => {
    await db.runMany([
      repository.applyRemoteRowStatement(
        remotePeriod({ id: TREATMENT_ID, frequency_value: 7, updated_at: T_OLD }),
      ),
      repository.applyRemoteRowStatement(
        remotePeriod({ id: TREATMENT_ID, frequency_value: 7, updated_at: T_LOCAL }),
      ),
    ])

    await expect(localRow(TREATMENT_ID)).resolves.toEqual([LOCAL_ROW])
  })

  it('remplace une période locale par une version distante plus récente, arrêt et suppression compris', async () => {
    const remote = remotePeriod({
      id: TREATMENT_ID,
      created_at: T_LOCAL,
      stopped_on: '2026-01-10',
      frequency_value: 2,
      frequency_unit: 'week',
      dose_quantity: 2,
      dose_unit: 'ml',
      deleted_at: T_NEW,
    })

    await db.runMany([repository.applyRemoteRowStatement(remote)])

    await expect(localRow(TREATMENT_ID)).resolves.toEqual([remote])
  })

  it('pushRow écrit la ligne sous le compte, que pullPage relit depuis son curseur', async () => {
    const treatments = createTreatmentsRepository(db, {
      loadSupabaseClient: async () => server.client,
    })
    await server.client.from('animal').upsert({ user_id: USER_ID, id: ANIMAL_ID })
    await treatments.pushRow(USER_ID, (await treatments.getRowForPush(TREATMENT_ID))!)

    await repository.pushRow(USER_ID, (await repository.getRowForPush(TREATMENT_ID))!)
    const page = await repository.pullPage(USER_ID, T_OLD, 500)

    const [pushed] = server.rows('treatment_period')
    expect(pushed).toMatchObject({ user_id: USER_ID, id: TREATMENT_ID })
    expect(page).toEqual({
      rows: [{ ...LOCAL_ROW, created_at: PG_LOCAL, updated_at: PG_LOCAL }],
      cursor: pushed?.server_updated_at,
    })
    await expect(repository.pullPage('autre-compte', T_OLD, 500)).resolves.toEqual({
      rows: [],
      cursor: null,
    })
    await expect(repository.pullPage(USER_ID, '2030-01-01T00:00:00.000Z', 500)).resolves.toEqual({
      rows: [],
      cursor: null,
    })
  })

  it('pushRow lève l’erreur Supabase : une période sans son traitement côté serveur', async () => {
    await expect(
      repository.pushRow(USER_ID, (await repository.getRowForPush(TREATMENT_ID))!),
    ).rejects.toMatchObject({ code: '23503' })
  })
})
