// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createFakeSyncServer, type FakeSyncServer } from '@/core/sync/__tests__/fake-sync-server'
import {
  createVaccinationInjectionsRepository,
  type VaccinationInjectionsRepository,
} from '../repository/vaccination-injections.repository'
import { createVaccinationsRepository } from '../repository/vaccinations.repository'

const T_OLD = '2026-01-01T00:00:00.000Z'
const T_LOCAL = '2026-01-01T00:05:00.000Z'
const T_NEW = '2026-01-01T00:10:00.000Z'
const PG_LOCAL = '2026-01-01T00:05:00.000+00:00'
const USER_ID = '99999999-9999-4999-8999-999999999999'
const ANIMAL_ID = '11111111-1111-4111-8111-111111111111'
const VACCINATION_ID = '22222222-2222-4222-8222-222222222222'
const LATER_ID = '33333333-3333-4333-8333-333333333333'

function remoteInjection(overrides: Record<string, string | null> = {}) {
  return {
    id: LATER_ID,
    vaccination_id: VACCINATION_ID,
    animal_id: ANIMAL_ID,
    injected_on: '2026-06-01',
    next_due_date: '2027-06-01',
    created_at: T_NEW,
    updated_at: T_NEW,
    deleted_at: null,
    ...overrides,
  }
}

describe('vaccinationInjectionsRepository — port de synchronisation', () => {
  let db: InMemoryDb
  let server: FakeSyncServer
  let repository: VaccinationInjectionsRepository

  beforeEach(async () => {
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    server = createFakeSyncServer()
    repository = createVaccinationInjectionsRepository(db, {
      loadSupabaseClient: async () => server.client,
    })
    await db.run(
      `INSERT INTO animal (id, name, species, created_at, updated_at) VALUES (?, 'Milo', 'dog', ?, ?)`,
      [ANIMAL_ID, T_LOCAL, T_LOCAL],
    )
    await db.run(
      `INSERT INTO vaccination (id, animal_id, name, created_at, updated_at)
       VALUES (?, ?, 'Rage', ?, ?)`,
      [VACCINATION_ID, ANIMAL_ID, T_LOCAL, T_LOCAL],
    )
    await db.run(
      `INSERT INTO vaccination_injection (id, vaccination_id, animal_id, injected_on, next_due_date, created_at, updated_at)
       VALUES (?, ?, ?, '2026-01-01', '2027-01-01', ?, ?)`,
      [VACCINATION_ID, VACCINATION_ID, ANIMAL_ID, T_LOCAL, T_LOCAL],
    )
  })

  afterEach(() => {
    db.close()
  })

  it('expose son entité', () => {
    expect(repository.entity).toBe('vaccination_injection')
  })

  it('getRowForPush renvoie l’injection, même supprimée logiquement', async () => {
    await db.run('UPDATE vaccination_injection SET deleted_at = ? WHERE id = ?', [
      T_NEW,
      VACCINATION_ID,
    ])

    await expect(repository.getRowForPush(VACCINATION_ID)).resolves.toEqual({
      id: VACCINATION_ID,
      vaccination_id: VACCINATION_ID,
      animal_id: ANIMAL_ID,
      injected_on: '2026-01-01',
      next_due_date: '2027-01-01',
      created_at: T_LOCAL,
      updated_at: T_LOCAL,
      deleted_at: T_NEW,
    })
  })

  it('getRowForPush renvoie null pour un identifiant inconnu', async () => {
    await expect(repository.getRowForPush('inconnu')).resolves.toBeNull()
  })

  it('crée localement une injection distante inconnue, qui devient la tête de son vaccin', async () => {
    await db.runMany([repository.applyRemoteRowStatement(remoteInjection())])

    await expect(createVaccinationsRepository(db).getById(VACCINATION_ID)).resolves.toMatchObject({
      lastInjectionDate: '2026-06-01',
      dueDate: '2027-06-01',
    })
  })

  it("n'écrase pas une injection locale plus récente, ni à égalité d'horodatage", async () => {
    await db.runMany([
      repository.applyRemoteRowStatement(
        remoteInjection({ id: VACCINATION_ID, next_due_date: null, updated_at: T_OLD }),
      ),
      repository.applyRemoteRowStatement(
        remoteInjection({ id: VACCINATION_ID, next_due_date: null, updated_at: T_LOCAL }),
      ),
    ])

    await expect(repository.getById(VACCINATION_ID)).resolves.toMatchObject({
      nextDueDate: '2027-01-01',
    })
  })

  it('remplace une injection locale par une version distante plus récente, suppression comprise', async () => {
    await db.runMany([
      repository.applyRemoteRowStatement(
        remoteInjection({ id: VACCINATION_ID, next_due_date: null, deleted_at: T_NEW }),
      ),
    ])

    await expect(repository.getRowForPush(VACCINATION_ID)).resolves.toMatchObject({
      next_due_date: null,
      updated_at: T_NEW,
      deleted_at: T_NEW,
    })
  })

  it('pushRow écrit la ligne sous le compte, que pullPage relit depuis son curseur', async () => {
    const vaccinations = createVaccinationsRepository(db, {
      loadSupabaseClient: async () => server.client,
    })
    await server.client.from('animal').upsert({ user_id: USER_ID, id: ANIMAL_ID })
    await vaccinations.pushRow(USER_ID, (await vaccinations.getRowForPush(VACCINATION_ID))!)

    await repository.pushRow(USER_ID, (await repository.getRowForPush(VACCINATION_ID))!)
    const page = await repository.pullPage(USER_ID, T_OLD, 500)

    const [pushed] = server.rows('vaccination_injection')
    expect(pushed).toMatchObject({ user_id: USER_ID, id: VACCINATION_ID })
    expect(page).toEqual({
      rows: [
        {
          id: VACCINATION_ID,
          vaccination_id: VACCINATION_ID,
          animal_id: ANIMAL_ID,
          injected_on: '2026-01-01',
          next_due_date: '2027-01-01',
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

  it('pushRow lève l’erreur Supabase : une injection sans son vaccin côté serveur', async () => {
    await expect(
      repository.pushRow(USER_ID, (await repository.getRowForPush(VACCINATION_ID))!),
    ).rejects.toMatchObject({ code: '23503' })
  })
})
