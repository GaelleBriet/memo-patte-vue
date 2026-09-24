// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbClient } from '@/core/db/db-client'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { getDb } from '@/core/db/sqlite'
import {
  createVaccinationInjectionsRepository,
  getVaccinationInjectionsRepository,
  type VaccinationInjectionsRepository,
} from '../repository/vaccination-injections.repository'
import { createVaccinationsRepository } from '../repository/vaccinations.repository'

vi.mock('@/core/db/sqlite', () => ({ getDb: vi.fn<() => Promise<DbClient>>() }))

const MIETTE = '11111111-1111-4111-8111-111111111111'
const VASCO = '22222222-2222-4222-8222-222222222222'
const T0 = '2026-01-01T00:00:00.000Z'
const EARLIER = '2026-02-01T00:00:00.000Z'
const NOW = '2026-03-01T10:00:00.000Z'

interface Tombstone {
  vaccination_id: string
  deleted_at: string | null
}

describe('vaccinationInjectionsRepository', () => {
  let db: InMemoryDb
  let injections: VaccinationInjectionsRepository
  let rage: string
  let typhus: string
  let chppi: string

  function tombstones(): Promise<Tombstone[]> {
    return db.query<Tombstone>('SELECT vaccination_id, deleted_at FROM vaccination_injection')
  }

  beforeEach(async () => {
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    await db.run(
      `INSERT INTO animal (id, name, species, created_at, updated_at)
       VALUES (?, 'Miette', 'cat', ?, ?), (?, 'Vasco', 'dog', ?, ?)`,
      [MIETTE, T0, T0, VASCO, T0, T0],
    )
    injections = createVaccinationInjectionsRepository(db)
    const vaccinations = createVaccinationsRepository(db)
    const create = async (animalId: string, name: string) =>
      (await vaccinations.create({ animalId, name, lastInjectionDate: '2025-01-01' })).id
    rage = await create(MIETTE, 'Rage')
    typhus = await create(MIETTE, 'Typhus')
    chppi = await create(VASCO, 'CHPPi')
    await db.run(
      'UPDATE vaccination_injection SET deleted_at = ?, updated_at = ? WHERE vaccination_id = ?',
      [EARLIER, EARLIER, typhus],
    )
  })

  afterEach(() => {
    db.close()
  })

  it('marque les injections d’un animal, sans changer la date de celles déjà supprimées', async () => {
    await db.runMany([injections.markDeletedByAnimalStatement(MIETTE, NOW)])

    await expect(tombstones()).resolves.toEqual(
      expect.arrayContaining([
        { vaccination_id: rage, deleted_at: NOW },
        { vaccination_id: typhus, deleted_at: EARLIER },
        { vaccination_id: chppi, deleted_at: null },
      ]),
    )
  })

  it('marque toutes les injections encore visibles, sans changer la date des autres', async () => {
    await db.runMany([injections.markAllDeletedStatement(NOW)])

    await expect(tombstones()).resolves.toEqual(
      expect.arrayContaining([
        { vaccination_id: rage, deleted_at: NOW },
        { vaccination_id: typhus, deleted_at: EARLIER },
        { vaccination_id: chppi, deleted_at: NOW },
      ]),
    )
  })

  it('liste les versions de toutes les injections, supprimées comprises', async () => {
    const versions = await injections.listVersions()

    expect(versions).toHaveLength(3)
    expect(versions).toContainEqual({
      id: typhus,
      vaccinationId: typhus,
      injectedOn: '2025-01-01',
      updatedAt: EARLIER,
      deletedAt: EARLIER,
    })
  })

  it('restaure une injection existante sans changer sa date ni son vaccin', async () => {
    await db.runMany([
      injections.restoreStatement(
        {
          id: typhus,
          vaccinationId: rage,
          animalId: VASCO,
          injectedOn: '2025-06-01',
          nextDueDate: '2026-06-01',
          createdAt: NOW,
          updatedAt: NOW,
        },
        true,
      ),
    ])

    await expect(
      db.query('SELECT * FROM vaccination_injection WHERE id = ?', [typhus]),
    ).resolves.toEqual([
      expect.objectContaining({
        vaccination_id: typhus,
        animal_id: MIETTE,
        injected_on: '2025-01-01',
        next_due_date: '2026-06-01',
        updated_at: NOW,
        deleted_at: null,
      }),
    ])
  })

  it('ramène une injection supprimée sans toucher ses dates ni son rappel', async () => {
    const [avant] = await db.query('SELECT * FROM vaccination_injection WHERE id = ?', [typhus])

    await db.runMany([injections.reviveStatement(typhus, NOW)])

    await expect(
      db.query('SELECT * FROM vaccination_injection WHERE id = ?', [typhus]),
    ).resolves.toEqual([{ ...(avant as object), updated_at: NOW, deleted_at: null }])
  })

  it('insère une injection absente avec l’identifiant choisi', async () => {
    const injection = {
      id: 'nouvelle',
      vaccinationId: rage,
      animalId: MIETTE,
      injectedOn: '2025-06-01',
      nextDueDate: null,
      createdAt: T0,
      updatedAt: NOW,
    }

    await db.runMany([injections.restoreStatement(injection, false)])

    await expect(
      db.query('SELECT * FROM vaccination_injection WHERE id = ?', ['nouvelle']),
    ).resolves.toEqual([
      {
        id: 'nouvelle',
        vaccination_id: rage,
        animal_id: MIETTE,
        injected_on: '2025-06-01',
        next_due_date: null,
        created_at: T0,
        updated_at: NOW,
        deleted_at: null,
      },
    ])
  })
})

describe('getVaccinationInjectionsRepository', () => {
  it('ne met pas en cache une ouverture ratée, puis réutilise celle qui réussit', async () => {
    const db = await createInMemoryDb()
    vi.mocked(getDb).mockRejectedValueOnce(new Error('base indisponible'))
    await expect(getVaccinationInjectionsRepository()).rejects.toThrow('base indisponible')

    vi.mocked(getDb).mockResolvedValueOnce(db)
    const repository = await getVaccinationInjectionsRepository()
    await expect(repository.listVersions()).resolves.toEqual([])

    await expect(getVaccinationInjectionsRepository()).resolves.toBe(repository)
    db.close()
  })
})
