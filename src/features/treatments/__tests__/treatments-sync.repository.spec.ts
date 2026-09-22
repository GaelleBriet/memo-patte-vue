// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import {
  createTreatmentsRepository,
  type TreatmentsRepository,
} from '../repository/treatments.repository'

const T_LOCAL = '2026-01-01T00:05:00.000Z'
const T_NEW = '2026-01-01T00:10:00.000Z'
const ANIMAL_ID = '11111111-1111-4111-8111-111111111111'
const TREATMENT_ID = '33333333-3333-4333-8333-333333333333'

describe('treatmentsRepository — port de synchronisation', () => {
  let db: InMemoryDb
  let repository: TreatmentsRepository

  beforeEach(async () => {
    db = await createInMemoryDb()
    repository = createTreatmentsRepository(db)
    await db.run(
      `INSERT INTO animal (id, name, species, created_at, updated_at) VALUES (?, 'Luna', 'cat', ?, ?)`,
      [ANIMAL_ID, T_LOCAL, T_LOCAL],
    )
    await db.run(
      `INSERT INTO treatment
         (id, animal_id, name, type, frequency_value, frequency_unit, last_dose_date, next_due_date, created_at, updated_at)
       VALUES (?, ?, 'Bravecto', 'antiparasitic', 1, 'month', '2026-01-01', '2026-02-01', ?, ?)`,
      [TREATMENT_ID, ANIMAL_ID, T_LOCAL, T_LOCAL],
    )
  })

  afterEach(() => {
    db.close()
  })

  it('expose son entité', () => {
    expect(repository.entity).toBe('treatment')
  })

  it('getRowForPush renvoie la ligne même supprimée logiquement', async () => {
    await db.run('UPDATE treatment SET deleted_at = ? WHERE id = ?', [T_NEW, TREATMENT_ID])

    const row = await repository.getRowForPush(TREATMENT_ID)

    expect(row).toMatchObject({ id: TREATMENT_ID, deleted_at: T_NEW })
  })

  it("n'écrase pas une ligne locale plus récente qu'une ligne distante", async () => {
    const remote = {
      id: TREATMENT_ID,
      animal_id: ANIMAL_ID,
      name: 'Bravecto (autre appareil)',
      type: 'antiparasitic',
      frequency_value: 3,
      frequency_unit: 'month',
      last_dose_date: '2025-01-01',
      next_due_date: '2025-04-01',
      created_at: T_LOCAL,
      updated_at: '2026-01-01T00:00:00.000Z',
      deleted_at: null,
    }

    await db.runMany([repository.applyRemoteRowStatement(remote)])

    await expect(repository.getById(TREATMENT_ID)).resolves.toMatchObject({ name: 'Bravecto' })
  })

  it('remplace la ligne locale par une version distante plus récente', async () => {
    const remote = {
      id: TREATMENT_ID,
      animal_id: ANIMAL_ID,
      name: 'Bravecto (mis à jour)',
      type: 'deworming',
      frequency_value: 2,
      frequency_unit: 'week',
      last_dose_date: '2026-02-01',
      next_due_date: '2026-02-15',
      created_at: T_LOCAL,
      updated_at: T_NEW,
      deleted_at: null,
    }

    await db.runMany([repository.applyRemoteRowStatement(remote)])

    await expect(repository.getById(TREATMENT_ID)).resolves.toMatchObject({
      name: 'Bravecto (mis à jour)',
      type: 'deworming',
      frequency: { value: 2, unit: 'week' },
    })
  })

  it('une suppression distante plus récente se propage comme une modification normale', async () => {
    const remote = {
      id: TREATMENT_ID,
      animal_id: ANIMAL_ID,
      name: 'Bravecto',
      type: 'antiparasitic',
      frequency_value: 1,
      frequency_unit: 'month',
      last_dose_date: '2026-01-01',
      next_due_date: '2026-02-01',
      created_at: T_LOCAL,
      updated_at: T_NEW,
      deleted_at: T_NEW,
    }

    await db.runMany([repository.applyRemoteRowStatement(remote)])

    await expect(repository.getById(TREATMENT_ID)).resolves.toBeNull()
  })
})
