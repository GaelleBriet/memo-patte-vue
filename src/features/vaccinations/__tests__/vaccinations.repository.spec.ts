// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'
import type { DbClient } from '@/core/db/db-client'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { getDb } from '@/core/db/sqlite'
import {
  createVaccinationsRepository,
  getVaccinationsRepository,
  type VaccinationsRepository,
} from '../repository/vaccinations.repository'
import {
  createVaccinationInjectionsRepository,
  type VaccinationInjectionsRepository,
} from '../repository/vaccination-injections.repository'
import type { ExportVaccination } from '@/shared/domain/carnet-data'

// La fabrique est le seul code testé ici qui ouvre la base : on lui substitue `getDb`.
vi.mock('@/core/db/sqlite', () => ({ getDb: vi.fn<() => Promise<DbClient>>() }))

const MIETTE = '11111111-1111-4111-8111-111111111111'
const VASCO = '22222222-2222-4222-8222-222222222222'
const ANIMAL_INCONNU = '33333333-3333-4333-8333-333333333333'

async function seedAnimal(db: InMemoryDb, id: string, name: string) {
  await db.run(
    `INSERT INTO animal (id, name, species, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, name, 'cat', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
  )
}

describe('vaccinationsRepository', () => {
  let db: InMemoryDb
  let repository: VaccinationsRepository

  beforeEach(async () => {
    db = await createInMemoryDb()
    // sql.js désactive les clés étrangères par défaut, contrairement au plugin Capacitor.
    await db.execute('PRAGMA foreign_keys = ON')
    await seedAnimal(db, MIETTE, 'Miette')
    await seedAnimal(db, VASCO, 'Vasco')
    repository = createVaccinationsRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  it('crée un vaccin puis le relit à l’identique', async () => {
    const created = await repository.create({
      animalId: MIETTE,
      name: 'Typhus (RCP)',
      lastInjectionDate: '2025-09-12',
      dueDate: '2026-09-12',
    })

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(created.createdAt).toBe(created.updatedAt)
    await expect(repository.getById(created.id)).resolves.toEqual(created)
  })

  it('complète les champs facultatifs à null', async () => {
    const created = await repository.create({
      animalId: MIETTE,
      name: 'CHPPi',
      lastInjectionDate: '2025-06-12',
    })

    expect(created).toMatchObject({ dueDate: null, deletedAt: null })
    await expect(repository.getById(created.id)).resolves.toEqual(created)
  })

  it('renvoie null pour un identifiant inconnu', async () => {
    await expect(repository.getById('inconnu')).resolves.toBeNull()
  })

  it('liste les vaccins d’un animal, injection la plus récente en tête', async () => {
    await repository.create({ animalId: MIETTE, name: 'Rage', lastInjectionDate: '2024-03-01' })
    await repository.create({ animalId: MIETTE, name: 'Typhus', lastInjectionDate: '2025-09-12' })
    await repository.create({ animalId: VASCO, name: 'CHPPi', lastInjectionDate: '2025-11-02' })

    const names = (await repository.listByAnimal(MIETTE)).map((vaccination) => vaccination.name)
    expect(names).toEqual(['Typhus', 'Rage'])
  })

  it('liste les vaccins de tous les animaux, sans les supprimés', async () => {
    await repository.create({ animalId: MIETTE, name: 'Rage', lastInjectionDate: '2024-03-01' })
    const typhus = await repository.create({
      animalId: MIETTE,
      name: 'Typhus',
      lastInjectionDate: '2025-09-12',
    })
    await repository.create({ animalId: VASCO, name: 'CHPPi', lastInjectionDate: '2025-11-02' })
    await repository.remove(typhus.id)

    const all = await repository.listAll()
    expect(all.map((vaccination) => [vaccination.animalId, vaccination.name])).toEqual([
      [MIETTE, 'Rage'],
      [VASCO, 'CHPPi'],
    ])
  })

  it('départage deux vaccins de même date par nom, sans tenir compte de la casse', async () => {
    await repository.create({ animalId: MIETTE, name: 'typhus', lastInjectionDate: '2025-09-12' })
    await repository.create({ animalId: MIETTE, name: 'Rage', lastInjectionDate: '2025-09-12' })
    await repository.create({ animalId: MIETTE, name: 'Abricot', lastInjectionDate: '2025-09-12' })

    const names = (await repository.listByAnimal(MIETTE)).map((vaccination) => vaccination.name)
    expect(names).toEqual(['Abricot', 'Rage', 'typhus'])
  })

  it('renvoie une liste vide pour un animal sans vaccin', async () => {
    await expect(repository.listByAnimal(VASCO)).resolves.toEqual([])
  })

  it('met à jour les champs et rafraîchit updatedAt sans toucher createdAt', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    try {
      const created = await repository.create({
        animalId: MIETTE,
        name: 'CHPPi',
        lastInjectionDate: '2025-06-12',
        dueDate: '2026-06-12',
      })
      vi.advanceTimersByTime(60_000)

      const updated = await repository.update(created.id, {
        name: 'CHPPiL',
        lastInjectionDate: '2026-02-10',
      })

      expect(updated).toMatchObject({
        id: created.id,
        animalId: MIETTE,
        name: 'CHPPiL',
        lastInjectionDate: '2026-02-10',
        dueDate: null,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:01:00.000Z',
      })
      await expect(repository.getById(created.id)).resolves.toEqual(updated)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ne déplace pas un vaccin vers un autre animal', async () => {
    const rage = await repository.create({
      animalId: MIETTE,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
    })

    const updated = await repository.update(rage.id, {
      name: 'Rage renouvelée',
      lastInjectionDate: '2026-03-01',
      // @ts-expect-error le rattachement est figé : `animalId` n'est pas modifiable
      animalId: VASCO,
    })

    expect(updated.animalId).toBe(MIETTE)
    expect((await repository.listByAnimal(MIETTE)).map((v) => v.id)).toEqual([rage.id])
    await expect(repository.listByAnimal(VASCO)).resolves.toEqual([])
  })

  it('échoue à mettre à jour un vaccin inexistant', async () => {
    await expect(
      repository.update('inconnu', {
        name: 'CHPPi',
        lastInjectionDate: '2025-06-12',
      }),
    ).rejects.toThrow('Vaccin introuvable : inconnu')
  })

  it('supprime un vaccin et laisse les autres intacts', async () => {
    const rage = await repository.create({
      animalId: MIETTE,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
    })
    const typhus = await repository.create({
      animalId: MIETTE,
      name: 'Typhus',
      lastInjectionDate: '2025-09-12',
    })

    await repository.remove(rage.id)

    await expect(repository.getById(rage.id)).resolves.toBeNull()
    expect((await repository.listByAnimal(MIETTE)).map((v) => v.id)).toEqual([typhus.id])
  })

  it('conserve la ligne supprimée en base avec deleted_at et updated_at renseignés', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    try {
      const rage = await repository.create({
        animalId: MIETTE,
        name: 'Rage',
        lastInjectionDate: '2024-03-01',
      })
      vi.advanceTimersByTime(60_000)

      await repository.remove(rage.id)

      const rows = await db.query<{ id: string; deleted_at: string | null; updated_at: string }>(
        'SELECT id, deleted_at, updated_at FROM vaccination WHERE id = ?',
        [rage.id],
      )
      expect(rows).toEqual([
        {
          id: rage.id,
          deleted_at: '2026-03-01T10:01:00.000Z',
          updated_at: '2026-03-01T10:01:00.000Z',
        },
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('ne casse rien quand on supprime un identifiant inconnu', async () => {
    const rage = await repository.create({
      animalId: MIETTE,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
    })

    await expect(repository.remove('inconnu')).resolves.toBeUndefined()

    expect((await repository.listByAnimal(MIETTE)).map((v) => v.id)).toEqual([rage.id])
  })

  it('ne ressuscite pas un vaccin supprimé lors d’une mise à jour', async () => {
    const rage = await repository.create({
      animalId: MIETTE,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
    })
    await repository.remove(rage.id)

    await expect(
      repository.update(rage.id, {
        name: 'Rage renouvelée',
        lastInjectionDate: '2026-03-01',
      }),
    ).rejects.toThrow(`Vaccin introuvable : ${rage.id}`)

    const rows = await db.query<{ name: string; deleted_at: string | null }>(
      'SELECT name, deleted_at FROM vaccination WHERE id = ?',
      [rage.id],
    )
    expect(rows[0]?.name).toBe('Rage')
    expect(rows[0]?.deleted_at).not.toBeNull()
    await expect(repository.getById(rage.id)).resolves.toBeNull()
  })

  it('supprimer deux fois le même vaccin ne change pas la date de suppression', async () => {
    const rage = await repository.create({
      animalId: MIETTE,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
    })
    await repository.remove(rage.id)
    const [first] = await db.query<{ deleted_at: string }>(
      'SELECT deleted_at FROM vaccination WHERE id = ?',
      [rage.id],
    )

    await repository.remove(rage.id)

    const [second] = await db.query<{ deleted_at: string }>(
      'SELECT deleted_at FROM vaccination WHERE id = ?',
      [rage.id],
    )
    expect(second?.deleted_at).toBe(first?.deleted_at)
  })

  it('rejette un nom de vaccin vide avant d’atteindre la base', async () => {
    await expect(
      repository.create({ animalId: MIETTE, name: '   ', lastInjectionDate: '2025-06-12' }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(repository.listByAnimal(MIETTE)).resolves.toEqual([])
  })

  it('rejette une date de dernière injection dans le futur avant d’atteindre la base', async () => {
    await expect(
      repository.create({ animalId: MIETTE, name: 'CHPPi', lastInjectionDate: '2099-01-01' }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(repository.listByAnimal(MIETTE)).resolves.toEqual([])
  })

  it('rejette un identifiant d’animal mal formé avant d’atteindre la base', async () => {
    await expect(
      repository.create({ animalId: 'a1', name: 'CHPPi', lastInjectionDate: '2025-06-12' }),
    ).rejects.toBeInstanceOf(ZodError)
  })

  it('refuse un vaccin rattaché à un animal inexistant (clé étrangère)', async () => {
    await expect(
      repository.create({
        animalId: ANIMAL_INCONNU,
        name: 'CHPPi',
        lastInjectionDate: '2025-06-12',
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/)

    const rows = await db.query<{ id: string }>('SELECT id FROM vaccination')
    expect(rows).toEqual([])
  })
  describe('markDeletedByAnimalStatement', () => {
    it('construit l’instruction sans l’exécuter', async () => {
      const rage = await repository.create({
        animalId: MIETTE,
        name: 'Rage',
        lastInjectionDate: '2024-03-01',
      })

      const statement = repository.markDeletedByAnimalStatement(MIETTE, '2026-03-01T10:00:00.000Z')

      expect(statement).toEqual({
        sql: 'UPDATE vaccination SET deleted_at = ?, updated_at = ? WHERE animal_id = ? AND deleted_at IS NULL',
        params: ['2026-03-01T10:00:00.000Z', '2026-03-01T10:00:00.000Z', MIETTE],
      })
      await expect(repository.getById(rage.id)).resolves.toEqual(rage)
    })

    it('exécutée via runMany, marque les vaccins de l’animal sans toucher aux autres', async () => {
      const rage = await repository.create({
        animalId: MIETTE,
        name: 'Rage',
        lastInjectionDate: '2024-03-01',
      })
      const chppi = await repository.create({
        animalId: VASCO,
        name: 'CHPPi',
        lastInjectionDate: '2025-11-02',
      })
      const dejaSupprime = await repository.create({
        animalId: MIETTE,
        name: 'Typhus',
        lastInjectionDate: '2025-09-12',
      })
      await repository.remove(dejaSupprime.id)

      await db.runMany([
        repository.markDeletedByAnimalStatement(MIETTE, '2026-03-01T10:00:00.000Z'),
      ])

      await expect(repository.listByAnimal(MIETTE)).resolves.toEqual([])
      await expect(repository.getById(chppi.id)).resolves.toEqual(chppi)
      const rows = await db.query<{ id: string; deleted_at: string | null; updated_at: string }>(
        'SELECT id, deleted_at, updated_at FROM vaccination WHERE animal_id = ?',
        [MIETTE],
      )
      expect(rows.find((row) => row.id === rage.id)).toEqual({
        id: rage.id,
        deleted_at: '2026-03-01T10:00:00.000Z',
        updated_at: '2026-03-01T10:00:00.000Z',
      })
      expect(rows.find((row) => row.id === dejaSupprime.id)?.deleted_at).not.toBe(
        '2026-03-01T10:00:00.000Z',
      )
    })
  })
})

describe('vaccinationsRepository — injections', () => {
  let db: InMemoryDb
  let repository: VaccinationsRepository
  let injections: VaccinationInjectionsRepository

  interface InjectionRow {
    id: string
    vaccination_id: string
    animal_id: string
    injected_on: string
    next_due_date: string | null
    created_at: string
    updated_at: string
    deleted_at: string | null
  }

  async function addInjection(
    vaccinationId: string,
    injectedOn: string,
    nextDueDate: string | null,
    { createdAt = '2026-09-20T10:00:00.000Z', id = crypto.randomUUID() } = {},
  ): Promise<string> {
    await db.runMany([
      injections.insertStatement({
        id,
        vaccinationId,
        animalId: MIETTE,
        injectedOn,
        nextDueDate,
        createdAt,
        updatedAt: createdAt,
        deletedAt: null,
      }),
    ])
    return id
  }

  function injectionsOf(vaccinationId: string): Promise<InjectionRow[]> {
    return db.query<InjectionRow>(
      'SELECT * FROM vaccination_injection WHERE vaccination_id = ? ORDER BY injected_on',
      [vaccinationId],
    )
  }

  beforeEach(async () => {
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    await seedAnimal(db, MIETTE, 'Miette')
    await seedAnimal(db, VASCO, 'Vasco')
    repository = createVaccinationsRepository(db)
    injections = createVaccinationInjectionsRepository(db)
  })

  afterEach(() => {
    db.close()
    vi.useRealTimers()
  })

  it('crée le vaccin et sa première injection, de même identifiant', async () => {
    const carre = await repository.create({
      animalId: MIETTE,
      name: 'Carré',
      lastInjectionDate: '2025-09-25',
      dueDate: '2026-09-25',
    })

    await expect(injectionsOf(carre.id)).resolves.toEqual([
      {
        id: carre.id,
        vaccination_id: carre.id,
        animal_id: MIETTE,
        injected_on: '2025-09-25',
        next_due_date: '2026-09-25',
        created_at: carre.createdAt,
        updated_at: carre.createdAt,
        deleted_at: null,
      },
    ])
  })

  it('n’écrit pas le vaccin quand sa première injection est refusée', async () => {
    await db.execute(
      `CREATE TRIGGER refuse_injection BEFORE INSERT ON vaccination_injection
       BEGIN SELECT RAISE(ABORT, 'injection refusée'); END`,
    )

    await expect(
      repository.create({ animalId: MIETTE, name: 'Carré', lastInjectionDate: '2025-09-25' }),
    ).rejects.toThrow('injection refusée')

    await expect(db.query('SELECT id FROM vaccination')).resolves.toEqual([])
  })

  it('prend ses dates dans l’injection la plus récente', async () => {
    const carre = await repository.create({
      animalId: MIETTE,
      name: 'Carré',
      lastInjectionDate: '2025-09-25',
      dueDate: '2026-09-25',
    })

    await addInjection(carre.id, '2026-09-20', '2029-09-20')

    const attendu = { lastInjectionDate: '2026-09-20', dueDate: '2029-09-20' }
    await expect(repository.getById(carre.id)).resolves.toMatchObject(attendu)
    await expect(repository.listByAnimal(MIETTE)).resolves.toMatchObject([attendu])
    await expect(repository.listAll()).resolves.toMatchObject([attendu])
  })

  it('une injection plus ancienne ajoutée ensuite ne devient pas la tête', async () => {
    const carre = await repository.create({
      animalId: MIETTE,
      name: 'Carré',
      lastInjectionDate: '2025-09-25',
      dueDate: '2026-09-25',
    })

    await addInjection(carre.id, '2024-09-20', '2025-09-20', {
      createdAt: '2099-01-01T00:00:00.000Z',
    })

    await expect(repository.getById(carre.id)).resolves.toMatchObject({
      lastInjectionDate: '2025-09-25',
      dueDate: '2026-09-25',
    })
  })

  it('à date égale, la dernière saisie fait foi, puis le plus grand identifiant', async () => {
    const rage = await repository.create({
      animalId: MIETTE,
      name: 'Rage',
      lastInjectionDate: '2020-01-01',
    })
    await addInjection(rage.id, '2026-01-10', '2027-01-10', {
      createdAt: '2026-01-10T11:00:00.000Z',
      id: '00000000-0000-4000-8000-000000000000',
    })
    await addInjection(rage.id, '2026-01-10', '2028-01-10', {
      createdAt: '2026-01-10T10:00:00.000Z',
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    })

    await expect(repository.getById(rage.id)).resolves.toMatchObject({ dueDate: '2027-01-10' })

    await addInjection(rage.id, '2026-01-10', '2029-01-10', {
      createdAt: '2026-01-10T11:00:00.000Z',
      id: '11111111-0000-4000-8000-000000000000',
    })

    await expect(repository.getById(rage.id)).resolves.toMatchObject({ dueDate: '2029-01-10' })
  })

  it('ignore une injection supprimée : la précédente redevient la tête', async () => {
    const carre = await repository.create({
      animalId: MIETTE,
      name: 'Carré',
      lastInjectionDate: '2025-09-25',
      dueDate: '2026-09-25',
    })
    const recente = await addInjection(carre.id, '2026-09-20', '2029-09-20')

    await db.run('UPDATE vaccination_injection SET deleted_at = updated_at WHERE id = ?', [recente])

    await expect(repository.getById(carre.id)).resolves.toMatchObject({
      lastInjectionDate: '2025-09-25',
      dueDate: '2026-09-25',
    })
  })

  it('ne montre pas un vaccin sans injection visible', async () => {
    await db.run(
      `INSERT INTO vaccination (id, animal_id, name, created_at, updated_at)
       VALUES ('sans-injection', ?, 'Leucose', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      [MIETTE],
    )

    await expect(repository.getById('sans-injection')).resolves.toBeNull()
    await expect(repository.listByAnimal(MIETTE)).resolves.toEqual([])
    await expect(repository.listAll()).resolves.toEqual([])
  })

  it('trie les vaccins d’un animal par la date de leur tête', async () => {
    const rage = await repository.create({
      animalId: MIETTE,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
    })
    await repository.create({ animalId: MIETTE, name: 'Typhus', lastInjectionDate: '2025-09-12' })

    await addInjection(rage.id, '2026-03-01', '2027-03-01')

    const names = (await repository.listByAnimal(MIETTE)).map(({ name }) => name)
    expect(names).toEqual(['Rage', 'Typhus'])
  })

  it('la modification change le vaccin et son injection de tête, pas les précédentes', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-24T10:00:00.000Z') })
    const carre = await repository.create({
      animalId: MIETTE,
      name: 'Carré',
      lastInjectionDate: '2025-09-25',
      dueDate: '2026-09-25',
    })
    const ancienne = await addInjection(carre.id, '2024-09-20', '2025-09-20')
    vi.advanceTimersByTime(60_000)

    await repository.update(carre.id, {
      name: 'Carré (Eurican)',
      lastInjectionDate: '2025-09-26',
      dueDate: '2026-09-26',
    })

    await expect(injectionsOf(carre.id)).resolves.toMatchObject([
      { id: ancienne, injected_on: '2024-09-20', next_due_date: '2025-09-20' },
      {
        id: carre.id,
        injected_on: '2025-09-26',
        next_due_date: '2026-09-26',
        updated_at: '2026-09-24T10:01:00.000Z',
      },
    ])
    await expect(repository.getById(carre.id)).resolves.toMatchObject({
      name: 'Carré (Eurican)',
      updatedAt: '2026-09-24T10:01:00.000Z',
    })
  })

  it('supprimer un vaccin pose sa date de suppression sur toutes ses injections', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-24T10:00:00.000Z') })
    const carre = await repository.create({
      animalId: MIETTE,
      name: 'Carré',
      lastInjectionDate: '2025-09-25',
    })
    await addInjection(carre.id, '2024-09-20', null)
    const rage = await repository.create({
      animalId: MIETTE,
      name: 'Rage',
      lastInjectionDate: '2025-01-01',
    })
    vi.advanceTimersByTime(60_000)

    await repository.remove(carre.id)

    const tombstone = {
      deleted_at: '2026-09-24T10:01:00.000Z',
      updated_at: '2026-09-24T10:01:00.000Z',
    }
    await expect(injectionsOf(carre.id)).resolves.toMatchObject([tombstone, tombstone])
    await expect(injectionsOf(rage.id)).resolves.toMatchObject([{ deleted_at: null }])
  })

  it('supprimer deux fois un vaccin ne change pas la date de ses injections', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-24T10:00:00.000Z') })
    const carre = await repository.create({
      animalId: MIETTE,
      name: 'Carré',
      lastInjectionDate: '2025-09-25',
    })
    await repository.remove(carre.id)
    const avant = await injectionsOf(carre.id)
    vi.advanceTimersByTime(60_000)

    await repository.remove(carre.id)

    await expect(injectionsOf(carre.id)).resolves.toEqual(avant)
  })
})

describe('vaccinationsRepository — import', () => {
  const IMPORTE: ExportVaccination = {
    id: '44444444-4444-4444-8444-444444444444',
    animalId: MIETTE,
    name: 'Typhus',
    lastInjectionDate: '2025-09-12',
    dueDate: '2026-09-12',
    createdAt: '2025-09-12T08:00:00.000Z',
    updatedAt: '2025-09-12T08:00:00.000Z',
  }

  let db: InMemoryDb
  let repository: VaccinationsRepository
  let injections: VaccinationInjectionsRepository

  function restore(vaccination: ExportVaccination, exists: boolean) {
    return db.runMany([
      repository.restoreStatement(vaccination, exists),
      injections.restoreStatement(
        {
          id: vaccination.id,
          vaccinationId: vaccination.id,
          animalId: vaccination.animalId,
          injectedOn: vaccination.lastInjectionDate,
          nextDueDate: vaccination.dueDate,
          createdAt: vaccination.createdAt,
          updatedAt: vaccination.updatedAt,
        },
        exists,
      ),
    ])
  }

  beforeEach(async () => {
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    await seedAnimal(db, MIETTE, 'Miette')
    await seedAnimal(db, VASCO, 'Vasco')
    repository = createVaccinationsRepository(db)
    injections = createVaccinationInjectionsRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  it('insère un vaccin importé avec son identifiant et ses dates d’origine', async () => {
    await restore(IMPORTE, false)

    await expect(repository.getById(IMPORTE.id)).resolves.toEqual({ ...IMPORTE, deletedAt: null })
  })

  it('écrase un vaccin existant, même supprimé, et le rend visible', async () => {
    await restore(IMPORTE, false)
    await repository.remove(IMPORTE.id)
    const importe = {
      ...IMPORTE,
      name: 'CHPPiL',
      dueDate: null,
      updatedAt: '2026-09-15T08:00:00.000Z',
    }

    await restore(importe, true)

    await expect(repository.getById(IMPORTE.id)).resolves.toEqual({ ...importe, deletedAt: null })
    await expect(
      db.query('SELECT id FROM vaccination_injection WHERE vaccination_id = ?', [IMPORTE.id]),
    ).resolves.toEqual([{ id: IMPORTE.id }])
  })

  it('ne déplace pas un vaccin existant vers l’animal du fichier', async () => {
    await restore(IMPORTE, false)

    await restore({ ...IMPORTE, animalId: VASCO }, true)

    await expect(repository.getById(IMPORTE.id)).resolves.toMatchObject({
      animalId: IMPORTE.animalId,
    })
    await expect(
      db.query('SELECT animal_id FROM vaccination_injection WHERE id = ?', [IMPORTE.id]),
    ).resolves.toEqual([{ animal_id: MIETTE }])
  })

  it('liste les versions de toutes les lignes, supprimées comprises', async () => {
    const vivant = await repository.create({
      animalId: VASCO,
      name: 'Rage',
      lastInjectionDate: '2025-01-01',
    })
    await restore(IMPORTE, false)
    await repository.remove(IMPORTE.id)

    const versions = await repository.listVersions()

    expect(versions).toHaveLength(2)
    expect(versions).toContainEqual({
      id: vivant.id,
      animalId: VASCO,
      updatedAt: vivant.updatedAt,
      deletedAt: null,
    })
    expect(versions.find((version) => version.id === IMPORTE.id)?.deletedAt).not.toBeNull()
  })

  it('marque tous les vaccins encore visibles, sans changer la date des déjà supprimés', async () => {
    await restore(IMPORTE, false)
    const autre = await repository.create({
      animalId: VASCO,
      name: 'Rage',
      lastInjectionDate: '2025-01-01',
    })
    await repository.remove(autre.id)
    const avant = (await repository.listVersions()).find(({ id }) => id === autre.id)

    await db.runMany([repository.markAllDeletedStatement('2030-01-01T09:00:00.000Z')])

    const versions = await repository.listVersions()
    expect(versions.find(({ id }) => id === IMPORTE.id)).toMatchObject({
      deletedAt: '2030-01-01T09:00:00.000Z',
      updatedAt: '2030-01-01T09:00:00.000Z',
    })
    expect(versions.find(({ id }) => id === autre.id)).toEqual(avant)
  })
})

describe('getVaccinationsRepository', () => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createInMemoryDb()
  })

  afterEach(() => {
    db.close()
  })

  it('ne met pas en cache une ouverture ratée, puis réutilise celle qui réussit', async () => {
    vi.mocked(getDb).mockRejectedValueOnce(new Error('base indisponible'))
    await expect(getVaccinationsRepository()).rejects.toThrow('base indisponible')

    // Sans remise à `null` du cache, ce second appel resservirait le rejet.
    vi.mocked(getDb).mockResolvedValueOnce(db)
    const repository = await getVaccinationsRepository()
    await expect(repository.listByAnimal(MIETTE)).resolves.toEqual([])

    await expect(getVaccinationsRepository()).resolves.toBe(repository)
    expect(getDb).toHaveBeenCalledTimes(2)
  })
})
