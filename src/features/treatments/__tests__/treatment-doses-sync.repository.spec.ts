// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createFakeSyncServer, type FakeSyncServer } from '@/core/sync/__tests__/fake-sync-server'
import {
  createTreatmentDosesRepository,
  type TreatmentDosesRepository,
} from '../repository/treatment-doses.repository'
import { createTreatmentsRepository } from '../repository/treatments.repository'

const T_OLD = '2026-01-01T00:00:00.000Z'
const T_LOCAL = '2026-01-01T00:05:00.000Z'
const T_NEW = '2026-01-01T00:10:00.000Z'
const PG_LOCAL = '2026-01-01T00:05:00.000+00:00'
const USER_ID = '99999999-9999-4999-8999-999999999999'
const ANIMAL_ID = '11111111-1111-4111-8111-111111111111'
const TREATMENT_ID = '22222222-2222-4222-8222-222222222222'
const LATER_ID = '33333333-3333-4333-8333-333333333333'

function remoteDose(overrides: Record<string, string | number | null> = {}) {
  return {
    id: LATER_ID,
    treatment_id: TREATMENT_ID,
    animal_id: ANIMAL_ID,
    given_on: '2026-02-01',
    next_due_date: '2026-03-01',
    frequency_value: 1,
    frequency_unit: 'month',
    created_at: T_NEW,
    updated_at: T_NEW,
    deleted_at: null,
    ...overrides,
  }
}

describe('treatmentDosesRepository — port de synchronisation', () => {
  let db: InMemoryDb
  let server: FakeSyncServer
  let repository: TreatmentDosesRepository

  beforeEach(async () => {
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    server = createFakeSyncServer()
    repository = createTreatmentDosesRepository(db, {
      loadSupabaseClient: async () => server.client,
    })
    await db.run(
      `INSERT INTO animal (id, name, species, created_at, updated_at) VALUES (?, 'Luna', 'cat', ?, ?)`,
      [ANIMAL_ID, T_LOCAL, T_LOCAL],
    )
    await db.run(
      `INSERT INTO treatment
         (id, animal_id, name, type, frequency_value, frequency_unit, created_at, updated_at)
       VALUES (?, ?, 'Bravecto', 'antiparasitic', 1, 'month', ?, ?)`,
      [TREATMENT_ID, ANIMAL_ID, T_LOCAL, T_LOCAL],
    )
    await db.run(
      `INSERT INTO treatment_dose
         (id, treatment_id, animal_id, given_on, next_due_date, frequency_value, frequency_unit, created_at, updated_at)
       VALUES (?, ?, ?, '2026-01-01', '2026-02-01', 1, 'month', ?, ?)`,
      [TREATMENT_ID, TREATMENT_ID, ANIMAL_ID, T_LOCAL, T_LOCAL],
    )
  })

  afterEach(() => {
    db.close()
  })

  it('expose son entité', () => {
    expect(repository.entity).toBe('treatment_dose')
  })

  it('getRowForPush renvoie la prise, fréquence recopiée, même supprimée logiquement', async () => {
    await db.run('UPDATE treatment_dose SET deleted_at = ? WHERE id = ?', [T_NEW, TREATMENT_ID])

    await expect(repository.getRowForPush(TREATMENT_ID)).resolves.toEqual({
      id: TREATMENT_ID,
      treatment_id: TREATMENT_ID,
      animal_id: ANIMAL_ID,
      given_on: '2026-01-01',
      next_due_date: '2026-02-01',
      frequency_value: 1,
      frequency_unit: 'month',
      created_at: T_LOCAL,
      updated_at: T_LOCAL,
      deleted_at: T_NEW,
    })
  })

  it('getRowForPush renvoie null pour un identifiant inconnu', async () => {
    await expect(repository.getRowForPush('inconnu')).resolves.toBeNull()
  })

  it('crée localement une prise distante inconnue, qui devient la tête de son traitement', async () => {
    await db.runMany([repository.applyRemoteRowStatement(remoteDose())])

    await expect(createTreatmentsRepository(db).getById(TREATMENT_ID)).resolves.toMatchObject({
      lastDoseDate: '2026-02-01',
      nextDueDate: '2026-03-01',
    })
  })

  it("n'écrase pas une prise locale plus récente, ni à égalité d'horodatage", async () => {
    await db.runMany([
      repository.applyRemoteRowStatement(
        remoteDose({ id: TREATMENT_ID, next_due_date: '2026-05-01', updated_at: T_OLD }),
      ),
      repository.applyRemoteRowStatement(
        remoteDose({ id: TREATMENT_ID, next_due_date: '2026-05-01', updated_at: T_LOCAL }),
      ),
    ])

    await expect(repository.getById(TREATMENT_ID)).resolves.toMatchObject({
      nextDueDate: '2026-02-01',
    })
  })

  it('remplace une prise locale par une version distante plus récente, fréquence comprise', async () => {
    await db.runMany([
      repository.applyRemoteRowStatement(
        remoteDose({
          id: TREATMENT_ID,
          given_on: '2026-01-01',
          next_due_date: '2026-01-15',
          frequency_value: 2,
          frequency_unit: 'week',
        }),
      ),
    ])

    await expect(repository.getById(TREATMENT_ID)).resolves.toMatchObject({
      nextDueDate: '2026-01-15',
      frequency: { value: 2, unit: 'week' },
      updatedAt: T_NEW,
    })
  })

  it('pushRow écrit la ligne sous le compte, que pullPage relit depuis son curseur', async () => {
    const treatments = createTreatmentsRepository(db, {
      loadSupabaseClient: async () => server.client,
    })
    await server.client.from('animal').upsert({ user_id: USER_ID, id: ANIMAL_ID })
    await treatments.pushRow(USER_ID, (await treatments.getRowForPush(TREATMENT_ID))!)

    await repository.pushRow(USER_ID, (await repository.getRowForPush(TREATMENT_ID))!)
    const page = await repository.pullPage(USER_ID, T_OLD, 500)

    const [pushed] = server.rows('treatment_dose')
    expect(pushed).toMatchObject({ user_id: USER_ID, id: TREATMENT_ID })
    expect(page).toEqual({
      rows: [
        {
          id: TREATMENT_ID,
          treatment_id: TREATMENT_ID,
          animal_id: ANIMAL_ID,
          given_on: '2026-01-01',
          next_due_date: '2026-02-01',
          frequency_value: 1,
          frequency_unit: 'month',
          created_at: PG_LOCAL,
          updated_at: PG_LOCAL,
          deleted_at: null,
        },
      ],
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

  it('pushRow lève l’erreur Supabase : une prise sans son traitement côté serveur', async () => {
    await expect(
      repository.pushRow(USER_ID, (await repository.getRowForPush(TREATMENT_ID))!),
    ).rejects.toMatchObject({ code: '23503' })
  })
})
