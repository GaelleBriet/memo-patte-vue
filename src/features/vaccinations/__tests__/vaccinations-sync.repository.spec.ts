// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import {
  createVaccinationsRepository,
  type VaccinationsRepository,
} from '../repository/vaccinations.repository'

const T_LOCAL = '2026-01-01T00:05:00.000Z'
const T_NEW = '2026-01-01T00:10:00.000Z'
const ANIMAL_ID = '11111111-1111-4111-8111-111111111111'
const VACCINATION_ID = '22222222-2222-4222-8222-222222222222'

describe('vaccinationsRepository — port de synchronisation', () => {
  let db: InMemoryDb
  let repository: VaccinationsRepository

  beforeEach(async () => {
    db = await createInMemoryDb()
    repository = createVaccinationsRepository(db)
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
    expect(repository.entity).toBe('vaccination')
  })

  it('getRowForPush renvoie la ligne du vaccin seule, même supprimée logiquement', async () => {
    await db.run('UPDATE vaccination SET deleted_at = ? WHERE id = ?', [T_NEW, VACCINATION_ID])

    const row = await repository.getRowForPush(VACCINATION_ID)

    expect(row).toEqual({
      id: VACCINATION_ID,
      animal_id: ANIMAL_ID,
      name: 'Rage',
      created_at: T_LOCAL,
      updated_at: T_LOCAL,
      deleted_at: T_NEW,
    })
  })

  it("n'écrase pas une ligne locale plus récente qu'une ligne distante", async () => {
    const remote = {
      id: VACCINATION_ID,
      animal_id: ANIMAL_ID,
      name: 'Rage (autre appareil)',
      created_at: T_LOCAL,
      updated_at: '2026-01-01T00:00:00.000Z',
      deleted_at: null,
    }

    await db.runMany([repository.applyRemoteRowStatement(remote)])

    await expect(repository.getById(VACCINATION_ID)).resolves.toMatchObject({ name: 'Rage' })
  })

  it('remplace la ligne locale par une version distante plus récente, sans toucher ses injections', async () => {
    const remote = {
      id: VACCINATION_ID,
      animal_id: ANIMAL_ID,
      name: 'Rage (mise à jour)',
      created_at: T_LOCAL,
      updated_at: T_NEW,
      deleted_at: null,
    }

    await db.runMany([repository.applyRemoteRowStatement(remote)])

    await expect(repository.getById(VACCINATION_ID)).resolves.toMatchObject({
      name: 'Rage (mise à jour)',
      lastInjectionDate: '2026-01-01',
      dueDate: '2027-01-01',
      updatedAt: T_NEW,
    })
  })

  it('une suppression distante plus récente se propage comme une modification normale', async () => {
    const remote = {
      id: VACCINATION_ID,
      animal_id: ANIMAL_ID,
      name: 'Rage',
      created_at: T_LOCAL,
      updated_at: T_NEW,
      deleted_at: T_NEW,
    }

    await db.runMany([repository.applyRemoteRowStatement(remote)])

    await expect(repository.getById(VACCINATION_ID)).resolves.toBeNull()
  })
})
