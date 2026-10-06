// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { DbClient } from '@/core/db/db-client'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import {
  createVaccinationsRepository,
  type VaccinationsRepository,
} from '@/features/vaccinations/repository/vaccinations.repository'
import { createVaccinationInjectionsRepository } from '@/features/vaccinations/repository/vaccination-injections.repository'
import {
  createTreatmentsRepository,
  type TreatmentsRepository,
} from '@/features/treatments/repository/treatments.repository'
import { createTreatmentDosesRepository } from '@/features/treatments/repository/treatment-doses.repository'
import { createTreatmentPeriodsRepository } from '@/features/treatments/repository/treatment-periods.repository'
import {
  createWeightRepository,
  type WeightRepository,
} from '@/features/weight/repository/weight.repository'
import { getDb } from '@/core/db/sqlite'
import { cancelReminders, listScheduled, type ScheduledReminder } from '@/core/notifications'
import { deletePhoto, type PhotoStorage } from '@/core/photos/photo-storage'
import {
  createFakeNotifications,
  type FakeNotifications,
} from '@/shared/__tests__/fake-notifications'
import {
  animalDeletionService,
  createAnimalDeletionService,
  type AnimalDeletionService,
} from '../service/animal-deletion.service'
import { createAnimalsRepository, type AnimalsRepository } from '../repository/animals.repository'
import { createAnimalRemindersService } from '../service/animal-reminders.service'
import { seedTreatmentWithDose } from '@/features/treatments/__tests__/seed-treatment'

vi.mock('@/core/db/sqlite', () => ({ getDb: vi.fn<() => Promise<DbClient>>() }))
vi.mock('@/core/notifications', () => ({
  cancelReminders: vi.fn<(keys: string[]) => Promise<void>>().mockResolvedValue(),
  listScheduled: vi.fn<() => Promise<ScheduledReminder[]>>().mockResolvedValue([]),
}))
vi.mock('@/core/photos/photo-storage', () => ({
  deletePhoto: vi.fn<PhotoStorage['deletePhoto']>().mockResolvedValue(),
}))

interface Tombstone {
  deleted_at: string | null
  updated_at: string
}

describe('animalDeletionService', () => {
  let db: InMemoryDb
  let animals: AnimalsRepository
  let vaccinations: VaccinationsRepository
  let weight: WeightRepository
  let treatments: TreatmentsRepository
  let service: AnimalDeletionService
  let notifications: FakeNotifications
  let photos: { deletePhoto: Mock<PhotoStorage['deletePhoto']> }
  let rescheduled: string[]

  function reminders() {
    return createAnimalRemindersService({
      vaccinations: () => vaccinations,
      treatments: () => treatments,
      vaccinationReminders: { reschedule: async (id) => void rescheduled.push(id) },
      treatmentReminders: { reschedule: async (id) => void rescheduled.push(id) },
      notifications,
    })
  }

  beforeEach(async () => {
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    animals = createAnimalsRepository(db)
    vaccinations = createVaccinationsRepository(db)
    weight = createWeightRepository(db)
    treatments = createTreatmentsRepository(db)
    notifications = createFakeNotifications()
    photos = { deletePhoto: vi.fn<PhotoStorage['deletePhoto']>().mockResolvedValue() }
    rescheduled = []
    service = createAnimalDeletionService(
      () => animals,
      [
        () => vaccinations,
        () => createVaccinationInjectionsRepository(db),
        () => weight,
        () => treatments,
        () => createTreatmentPeriodsRepository(db),
        () => createTreatmentDosesRepository(db),
      ],
      reminders(),
      photos,
    )
  })

  afterEach(() => {
    db.close()
    vi.useRealTimers()
  })

  async function animalTombstone(id: string): Promise<Tombstone | undefined> {
    const rows = await db.query<Tombstone>(
      'SELECT deleted_at, updated_at FROM animal WHERE id = ?',
      [id],
    )
    return rows[0]
  }

  async function vaccinationTombstones(animalId: string): Promise<Tombstone[]> {
    return db.query<Tombstone>(
      'SELECT deleted_at, updated_at FROM vaccination WHERE animal_id = ? ORDER BY name',
      [animalId],
    )
  }

  it('marque l’animal et ses vaccins avec la même date de suppression', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    const miette = await animals.create({ name: 'Miette', species: 'cat' })
    await vaccinations.create({
      animalId: miette.id,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
    })
    await vaccinations.create({
      animalId: miette.id,
      name: 'Typhus',
      lastInjectionDate: '2025-09-12',
    })
    vi.advanceTimersByTime(60_000)

    await service.remove(miette.id)

    const expected: Tombstone = {
      deleted_at: '2026-03-01T10:01:00.000Z',
      updated_at: '2026-03-01T10:01:00.000Z',
    }
    await expect(animalTombstone(miette.id)).resolves.toEqual(expected)
    await expect(vaccinationTombstones(miette.id)).resolves.toEqual([expected, expected])
    await expect(animals.getById(miette.id)).resolves.toBeNull()
    await expect(vaccinations.listByAnimal(miette.id)).resolves.toEqual([])
  })

  it('pose une seule date sur l’animal et ses vaccins, sans horloge gelée', async () => {
    const miette = await animals.create({ name: 'Miette', species: 'cat' })
    await vaccinations.create({
      animalId: miette.id,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
    })

    await service.remove(miette.id)

    const animal = await animalTombstone(miette.id)
    expect(animal?.deleted_at).toEqual(expect.any(String))
    await expect(vaccinationTombstones(miette.id)).resolves.toEqual([animal])
  })

  it('marque les pesées de l’animal avec la même date, sans toucher celles des autres', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    const miette = await animals.create({ name: 'Miette', species: 'cat' })
    const vasco = await animals.create({ name: 'Vasco', species: 'dog' })
    await weight.create({ animalId: miette.id, weightKg: 4.1, measuredOn: '2026-01-10' })
    const vascoEntry = await weight.create({
      animalId: vasco.id,
      weightKg: 12,
      measuredOn: '2026-01-10',
    })
    vi.advanceTimersByTime(60_000)

    await service.remove(miette.id)

    await expect(weight.listByAnimal(miette.id)).resolves.toEqual([])
    await expect(
      db.query<Tombstone>('SELECT deleted_at, updated_at FROM weight_entry WHERE animal_id = ?', [
        miette.id,
      ]),
    ).resolves.toEqual([
      { deleted_at: '2026-03-01T10:01:00.000Z', updated_at: '2026-03-01T10:01:00.000Z' },
    ])
    await expect(weight.listByAnimal(vasco.id)).resolves.toEqual([vascoEntry])
  })

  it('marque les traitements de l’animal avec la même date, sans toucher ceux des autres', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    const miette = await animals.create({ name: 'Miette', species: 'cat' })
    const vasco = await animals.create({ name: 'Vasco', species: 'dog' })
    await seedTreatmentWithDose(db, {
      animalId: miette.id,
      name: 'Milbemax',
      type: 'deworming',
      frequency: { value: 3, unit: 'month' },
      lastDoseDate: '2026-01-10',
    })
    const vascoTreatment = await seedTreatmentWithDose(db, {
      animalId: vasco.id,
      name: 'Bravecto',
      type: 'antiparasitic',
      frequency: { value: 3, unit: 'month' },
      lastDoseDate: '2026-01-10',
    })
    vi.advanceTimersByTime(60_000)

    await service.remove(miette.id)

    await expect(treatments.listByAnimal(miette.id)).resolves.toEqual([])
    await expect(
      db.query<Tombstone>('SELECT deleted_at, updated_at FROM treatment WHERE animal_id = ?', [
        miette.id,
      ]),
    ).resolves.toEqual([
      { deleted_at: '2026-03-01T10:01:00.000Z', updated_at: '2026-03-01T10:01:00.000Z' },
    ])
    await expect(treatments.listByAnimal(vasco.id)).resolves.toEqual([vascoTreatment])
  })

  it('marque les injections, les périodes et les prises de l’animal avec la même date, sans toucher celles des autres', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    const miette = await animals.create({ name: 'Miette', species: 'cat' })
    const vasco = await animals.create({ name: 'Vasco', species: 'dog' })
    const rage = await vaccinations.create({
      animalId: miette.id,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
    })
    const milbemax = await seedTreatmentWithDose(db, {
      animalId: miette.id,
      name: 'Milbemax',
      type: 'deworming',
      frequency: { value: 3, unit: 'month' },
      lastDoseDate: '2026-01-10',
    })
    const chppi = await vaccinations.create({
      animalId: vasco.id,
      name: 'CHPPi',
      lastInjectionDate: '2025-11-02',
    })
    vi.advanceTimersByTime(60_000)

    await service.remove(miette.id)

    const tombstone: Tombstone = {
      deleted_at: '2026-03-01T10:01:00.000Z',
      updated_at: '2026-03-01T10:01:00.000Z',
    }
    await expect(
      db.query<Tombstone>(
        'SELECT deleted_at, updated_at FROM vaccination_injection WHERE vaccination_id = ?',
        [rage.id],
      ),
    ).resolves.toEqual([tombstone])
    await expect(
      db.query<Tombstone>(
        'SELECT deleted_at, updated_at FROM treatment_dose WHERE treatment_id = ?',
        [milbemax.id],
      ),
    ).resolves.toEqual([tombstone])
    await expect(
      db.query<Tombstone>(
        'SELECT deleted_at, updated_at FROM treatment_period WHERE treatment_id = ?',
        [milbemax.id],
      ),
    ).resolves.toEqual([tombstone])
    await expect(vaccinations.listByAnimal(vasco.id)).resolves.toEqual([chppi])
  })

  it('laisse intacts les autres animaux et leurs vaccins', async () => {
    const miette = await animals.create({ name: 'Miette', species: 'cat' })
    const vasco = await animals.create({ name: 'Vasco', species: 'dog' })
    await vaccinations.create({
      animalId: miette.id,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
    })
    const chppi = await vaccinations.create({
      animalId: vasco.id,
      name: 'CHPPi',
      lastInjectionDate: '2025-11-02',
    })

    await service.remove(miette.id)

    await expect(animals.getById(vasco.id)).resolves.toEqual(vasco)
    await expect(vaccinations.listByAnimal(vasco.id)).resolves.toEqual([chppi])
  })

  it('ne marque ni l’animal ni ses vaccins quand une instruction de la cascade échoue', async () => {
    const miette = await animals.create({ name: 'Miette', species: 'cat' })
    const rage = await vaccinations.create({
      animalId: miette.id,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
    })
    const failing = createAnimalDeletionService(
      () => animals,
      [
        () => vaccinations,
        () => ({
          markDeletedByAnimalStatement: () => ({
            sql: 'UPDATE table_inexistante SET deleted_at = 1',
          }),
          reviveByAnimalStatement: () => ({ sql: 'SELECT 1' }),
        }),
      ],
      reminders(),
      photos,
    )

    await expect(failing.remove(miette.id)).rejects.toThrow(/no such table/)

    await expect(animals.getById(miette.id)).resolves.toEqual(miette)
    await expect(vaccinations.listByAnimal(miette.id)).resolves.toEqual([rage])
    await expect(animalTombstone(miette.id)).resolves.toMatchObject({ deleted_at: null })
    await expect(vaccinationTombstones(miette.id)).resolves.toEqual([
      { deleted_at: null, updated_at: rage.updatedAt },
    ])
  })

  it('annule les rappels des vaccins et traitements de l’animal, et d’eux seuls', async () => {
    const miette = await animals.create({ name: 'Miette', species: 'cat' })
    const vasco = await animals.create({ name: 'Vasco', species: 'dog' })
    const rage = await vaccinations.create({
      animalId: miette.id,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
      dueDate: '2027-03-01',
    })
    const milbemax = await seedTreatmentWithDose(db, {
      animalId: miette.id,
      name: 'Milbemax',
      type: 'deworming',
      frequency: { value: 3, unit: 'month' },
      lastDoseDate: '2026-01-10',
    })
    const chppi = await vaccinations.create({
      animalId: vasco.id,
      name: 'CHPPi',
      lastInjectionDate: '2025-11-02',
      dueDate: '2026-11-02',
    })
    const kept = `vaccination:${chppi.id}:2026-11-02:due`
    for (const key of [
      `vaccination:${rage.id}:2027-03-01:before`,
      `treatment:${milbemax.id}:2026-04-10:due`,
      `treatment:${milbemax.id}:2026-07-10:overdue`,
      kept,
    ]) {
      notifications.pending.set(key, { key, title: '', body: '', at: new Date() })
    }

    await service.remove(miette.id)

    expect([...notifications.pending.keys()]).toEqual([kept])
  })

  it('garde les rappels quand la suppression échoue', async () => {
    const miette = await animals.create({ name: 'Miette', species: 'cat' })
    await vaccinations.create({
      animalId: miette.id,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
      dueDate: '2027-03-01',
    })
    const failing = createAnimalDeletionService(
      () => animals,
      [
        () => ({
          markDeletedByAnimalStatement: () => ({
            sql: 'UPDATE table_inexistante SET deleted_at = 1',
          }),
          reviveByAnimalStatement: () => ({ sql: 'SELECT 1' }),
        }),
      ],
      reminders(),
      photos,
    )

    await expect(failing.remove(miette.id)).rejects.toThrow(/no such table/)

    expect(notifications.cancelReminders).not.toHaveBeenCalled()
  })

  it('AN-12 : garde la photo à la suppression, et l’efface ensuite par forgetPhoto', async () => {
    const miette = await animals.create({
      name: 'Miette',
      species: 'cat',
      photoPath: '2f5b0d18-0f3a-4c11-9a7e-1d2c3b4a5e6f.jpg',
    })

    const removal = await service.remove(miette.id)
    expect(photos.deletePhoto).not.toHaveBeenCalled()

    await service.forgetPhoto(removal!)

    expect(photos.deletePhoto).toHaveBeenCalledExactlyOnceWith(
      '2f5b0d18-0f3a-4c11-9a7e-1d2c3b4a5e6f.jpg',
    )
  })

  it('rend l’animal, sa photo et la date de la suppression', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    const miette = await animals.create({ name: 'Miette', species: 'cat', photoPath: 'm.jpg' })

    await expect(service.remove(miette.id)).resolves.toEqual({
      animalId: miette.id,
      deletedAt: '2026-03-01T10:00:00.000Z',
      photoPath: 'm.jpg',
    })
  })

  it('n’efface aucun fichier quand l’animal n’a pas de photo', async () => {
    const miette = await animals.create({ name: 'Miette', species: 'cat' })

    await service.forgetPhoto((await service.remove(miette.id))!)

    expect(photos.deletePhoto).not.toHaveBeenCalled()
  })

  it('n’efface pas la photo d’un animal rendu par « Annuler »', async () => {
    const miette = await animals.create({ name: 'Miette', species: 'cat', photoPath: 'm.jpg' })
    const removal = (await service.remove(miette.id))!
    await service.restore(removal)

    await service.forgetPhoto(removal)

    expect(photos.deletePhoto).not.toHaveBeenCalled()
  })

  it('supprime l’animal même si le fichier est déjà absent', async () => {
    const miette = await animals.create({
      name: 'Miette',
      species: 'cat',
      photoPath: 'absente.jpg',
    })
    const rage = await vaccinations.create({
      animalId: miette.id,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
      dueDate: '2027-03-01',
    })
    const key = `vaccination:${rage.id}:2027-03-01:due`
    notifications.pending.set(key, { key, title: '', body: '', at: new Date() })
    photos.deletePhoto.mockRejectedValue(new Error('File does not exist'))

    await expect(service.forgetPhoto((await service.remove(miette.id))!)).resolves.toBeUndefined()

    await expect(animals.getById(miette.id)).resolves.toBeNull()
    expect([...notifications.pending.keys()]).toEqual([])
  })

  it('garde la photo quand la cascade échoue', async () => {
    const miette = await animals.create({
      name: 'Miette',
      species: 'cat',
      photoPath: 'gardee.jpg',
    })
    const failing = createAnimalDeletionService(
      () => animals,
      [
        () => ({
          markDeletedByAnimalStatement: () => ({
            sql: 'UPDATE table_inexistante SET deleted_at = 1',
          }),
          reviveByAnimalStatement: () => ({ sql: 'SELECT 1' }),
        }),
      ],
      reminders(),
      photos,
    )

    await expect(failing.remove(miette.id)).rejects.toThrow(/no such table/)

    expect(photos.deletePhoto).not.toHaveBeenCalled()
  })

  it('ne rend rien pour un animal déjà supprimé ou inconnu', async () => {
    const miette = await animals.create({ name: 'Miette', species: 'cat' })
    await service.remove(miette.id)

    await expect(service.remove(miette.id)).resolves.toBeNull()
    await expect(service.remove('inconnu')).resolves.toBeNull()
  })

  it('ne change aucune date déjà posée lors d’une seconde suppression', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    const miette = await animals.create({ name: 'Miette', species: 'cat' })
    await vaccinations.create({
      animalId: miette.id,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
    })
    await service.remove(miette.id)
    const animalBefore = await animalTombstone(miette.id)
    const vaccinationsBefore = await vaccinationTombstones(miette.id)
    vi.advanceTimersByTime(60_000)

    await service.remove(miette.id)

    await expect(animalTombstone(miette.id)).resolves.toEqual(animalBefore)
    await expect(vaccinationTombstones(miette.id)).resolves.toEqual(vaccinationsBefore)
    expect(animalBefore?.deleted_at).toBe('2026-03-01T10:00:00.000Z')
  })

  it('ne touche pas la date d’un vaccin supprimé avant l’animal', async () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T10:00:00.000Z') })
    const miette = await animals.create({ name: 'Miette', species: 'cat' })
    const rage = await vaccinations.create({
      animalId: miette.id,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
    })
    await vaccinations.remove(rage.id)
    vi.advanceTimersByTime(60_000)

    await service.remove(miette.id)

    await expect(vaccinationTombstones(miette.id)).resolves.toEqual([
      { deleted_at: '2026-03-01T10:00:00.000Z', updated_at: '2026-03-01T10:00:00.000Z' },
    ])
  })

  describe('restore (« Annuler »)', () => {
    const TABLES = [
      'vaccination',
      'vaccination_injection',
      'weight_entry',
      'treatment',
      'treatment_period',
      'treatment_dose',
    ]

    async function deletedAtByTable(animalId: string): Promise<Record<string, unknown[]>> {
      const entries = await Promise.all(
        TABLES.map(async (table) => {
          const rows = await db.query<{ deleted_at: string | null }>(
            `SELECT deleted_at FROM ${table} WHERE animal_id = ? ORDER BY id`,
            [animalId],
          )
          return [table, rows.map(({ deleted_at }) => deleted_at)] as const
        }),
      )
      return Object.fromEntries(entries)
    }

    async function seedCarnet(animalId: string) {
      const rage = await vaccinations.create({
        animalId,
        name: 'Rage',
        lastInjectionDate: '2024-03-01',
        dueDate: '2027-03-01',
      })
      await weight.create({ animalId, weightKg: 4.1, measuredOn: '2026-01-10' })
      const milbemax = await seedTreatmentWithDose(db, {
        animalId,
        name: 'Milbemax',
        type: 'deworming',
        frequency: { value: 3, unit: 'month' },
        lastDoseDate: '2026-01-10',
      })
      return { rage, milbemax }
    }

    it('critère 5 : rend l’animal et tout son carnet supprimés avec lui, puis ses rappels', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-03-01T10:00:00.000Z') })
      const miette = await animals.create({ name: 'Miette', species: 'cat' })
      const { rage, milbemax } = await seedCarnet(miette.id)
      const before = await deletedAtByTable(miette.id)
      const removal = (await service.remove(miette.id))!
      vi.setSystemTime(new Date('2026-03-01T10:00:03.000Z'))

      await service.restore(removal)

      await expect(animals.getById(miette.id)).resolves.toMatchObject({ deletedAt: null })
      await expect(deletedAtByTable(miette.id)).resolves.toEqual(before)
      expect(rescheduled.sort()).toEqual([rage.id, milbemax.id].sort())
      await expect(
        db.query('SELECT updated_at FROM treatment WHERE id = ?', [milbemax.id]),
      ).resolves.toEqual([{ updated_at: '2026-03-01T10:00:03.000Z' }])
    })

    it('laisse supprimé ce qui l’était avant l’animal', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-03-01T10:00:00.000Z') })
      const miette = await animals.create({ name: 'Miette', species: 'cat' })
      const { rage } = await seedCarnet(miette.id)
      await vaccinations.remove(rage.id)
      vi.setSystemTime(new Date('2026-03-01T10:01:00.000Z'))
      const removal = (await service.remove(miette.id))!

      await service.restore(removal)

      await expect(vaccinationTombstones(miette.id)).resolves.toEqual([
        { deleted_at: '2026-03-01T10:00:00.000Z', updated_at: '2026-03-01T10:00:00.000Z' },
      ])
    })

    it('ne touche pas aux autres animaux supprimés', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-03-01T10:00:00.000Z') })
      const miette = await animals.create({ name: 'Miette', species: 'cat' })
      const vasco = await animals.create({ name: 'Vasco', species: 'dog' })
      await seedCarnet(vasco.id)
      const removal = (await service.remove(miette.id))!
      await service.remove(vasco.id)

      await service.restore(removal)

      await expect(animals.getById(vasco.id)).resolves.toBeNull()
      const vascoRows = await deletedAtByTable(vasco.id)
      expect(Object.values(vascoRows).flat()).not.toContain(null)
    })
  })

  it('conserve toutes les lignes en base : jamais de DELETE', async () => {
    const miette = await animals.create({ name: 'Miette', species: 'cat' })
    await vaccinations.create({
      animalId: miette.id,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
    })
    await vaccinations.create({
      animalId: miette.id,
      name: 'Typhus',
      lastInjectionDate: '2025-09-12',
    })

    await service.remove(miette.id)

    const [animalCount] = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM animal')
    const [vaccinationCount] = await db.query<{ n: number }>(
      'SELECT COUNT(*) AS n FROM vaccination',
    )
    expect(animalCount?.n).toBe(1)
    expect(vaccinationCount?.n).toBe(2)
  })

  it('branche par défaut la base locale et les rappels', async () => {
    vi.mocked(getDb).mockResolvedValue(db)
    const miette = await animals.create({
      name: 'Miette',
      species: 'cat',
      photoPath: 'branchee.jpg',
    })
    await vaccinations.create({
      animalId: miette.id,
      name: 'Rage',
      lastInjectionDate: '2024-03-01',
    })
    await weight.create({ animalId: miette.id, weightKg: 4.1, measuredOn: '2026-01-10' })
    const milbemax = await seedTreatmentWithDose(db, {
      animalId: miette.id,
      name: 'Milbemax',
      type: 'deworming',
      frequency: { value: 3, unit: 'month' },
      lastDoseDate: '2026-01-10',
    })
    const key = `treatment:${milbemax.id}:2026-04-10:due`
    vi.mocked(listScheduled).mockResolvedValue([{ id: 1, key, title: '', body: '', exact: false }])

    const removal = await animalDeletionService.remove(miette.id)
    await animalDeletionService.forgetPhoto(removal!)

    expect(vi.mocked(cancelReminders)).toHaveBeenCalledExactlyOnceWith([key])
    expect(vi.mocked(deletePhoto)).toHaveBeenCalledExactlyOnceWith('branchee.jpg')
    const animal = await animalTombstone(miette.id)
    expect(animal?.deleted_at).toEqual(expect.any(String))
    await expect(vaccinationTombstones(miette.id)).resolves.toEqual([animal])
    await expect(
      db.query<Tombstone>('SELECT deleted_at, updated_at FROM weight_entry WHERE animal_id = ?', [
        miette.id,
      ]),
    ).resolves.toEqual([animal])
    await expect(
      db.query<Tombstone>('SELECT deleted_at, updated_at FROM treatment WHERE animal_id = ?', [
        miette.id,
      ]),
    ).resolves.toEqual([animal])
    await expect(
      db.query<Tombstone>(
        'SELECT deleted_at, updated_at FROM vaccination_injection WHERE animal_id = ?',
        [miette.id],
      ),
    ).resolves.toEqual([animal])
    await expect(
      db.query<Tombstone>(
        'SELECT deleted_at, updated_at FROM treatment_period WHERE animal_id = ?',
        [miette.id],
      ),
    ).resolves.toEqual([animal])
    await expect(
      db.query<Tombstone>('SELECT deleted_at, updated_at FROM treatment_dose WHERE animal_id = ?', [
        miette.id,
      ]),
    ).resolves.toEqual([animal])
  })
})
