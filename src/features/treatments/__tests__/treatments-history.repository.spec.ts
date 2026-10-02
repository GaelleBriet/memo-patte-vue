// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { treatmentScheduleOf } from '../logic/treatment-schedule'
import { createTreatmentDosesRepository } from '../repository/treatment-doses.repository'
import {
  createTreatmentPeriodsRepository,
  type RestoredTreatmentPeriod,
} from '../repository/treatment-periods.repository'
import {
  createTreatmentsRepository,
  type TreatmentsRepository,
} from '../repository/treatments.repository'
import type { NewTreatmentDose } from '../schema/treatment-dose.schema'

const LUNA = '11111111-1111-4111-8111-111111111111'
const MILO = '22222222-2222-4222-8222-222222222222'
const AT = '2026-09-01T08:00:00.000Z'
const STAMPS = { createdAt: AT, updatedAt: AT }

const METACAM = { id: 'metacam', animalId: LUNA, name: 'Métacam', type: 'medication' } as const
const PANACUR = { id: 'panacur', animalId: MILO, name: 'Panacur', type: 'deworming' } as const

function period(
  overrides: Pick<RestoredTreatmentPeriod, 'id' | 'treatmentId' | 'animalId' | 'startsOn'> &
    Partial<RestoredTreatmentPeriod>,
): RestoredTreatmentPeriod {
  return {
    firstDueOn: overrides.startsOn,
    endsOn: null,
    stoppedOn: null,
    frequency: { value: 1, unit: 'day' },
    times: [],
    doseQuantity: null,
    doseUnit: null,
    reminderOffsetMinutes: null,
    reminderTime: null,
    ...STAMPS,
    ...overrides,
  }
}

const PREMIERE = period({
  id: 'metacam-1',
  treatmentId: METACAM.id,
  animalId: LUNA,
  startsOn: '2026-09-01',
  stoppedOn: '2026-09-21',
  times: ['08:00'],
  doseQuantity: 0.5,
  doseUnit: 'ml',
})
const EN_COURS = period({
  id: 'metacam-2',
  treatmentId: METACAM.id,
  animalId: LUNA,
  startsOn: '2026-09-21',
  endsOn: '2026-10-05',
  times: ['08:00', '20:00'],
  doseQuantity: 0.3,
  doseUnit: 'ml',
  reminderOffsetMinutes: 30,
})
const DE_PANACUR = period({
  id: PANACUR.id,
  treatmentId: PANACUR.id,
  animalId: MILO,
  startsOn: '2026-09-10',
  firstDueOn: '2026-10-10',
  frequency: { value: 3, unit: 'month' },
})

function dose(
  overrides: Pick<NewTreatmentDose, 'id' | 'periodId' | 'dueOn'> & Partial<NewTreatmentDose>,
): NewTreatmentDose {
  return {
    treatmentId: METACAM.id,
    animalId: LUNA,
    dueTime: '08:00',
    givenOn: overrides.dueOn,
    status: 'given',
    nextDueDate: overrides.dueOn,
    ...STAMPS,
    deletedAt: null,
    ...overrides,
  }
}

const MATIN_20 = dose({ id: 'd-20', periodId: PREMIERE.id, dueOn: '2026-09-20' })
const MATIN_27 = dose({ id: 'd-27-matin', periodId: EN_COURS.id, dueOn: '2026-09-27' })
const SOIR_27 = dose({
  id: 'd-27-soir',
  periodId: EN_COURS.id,
  dueOn: '2026-09-27',
  dueTime: '20:00',
  givenOn: null,
  status: 'missed',
  nextDueDate: '2026-09-28',
})
const SUPPRIMEE = dose({
  id: 'd-supprimee',
  periodId: EN_COURS.id,
  dueOn: '2026-09-26',
  deletedAt: AT,
})

describe('treatmentsRepository — traitement avec ses périodes et ses prises', () => {
  let db: InMemoryDb
  let repository: TreatmentsRepository

  beforeEach(async () => {
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    repository = createTreatmentsRepository(db)
    const periods = createTreatmentPeriodsRepository(db)
    const doses = createTreatmentDosesRepository(db)
    await db.runMany([
      {
        sql: `INSERT INTO animal (id, name, species, created_at, updated_at)
              VALUES (?, 'Luna', 'cat', ?, ?), (?, 'Milo', 'dog', ?, ?)`,
        params: [LUNA, AT, AT, MILO, AT, AT],
      },
      repository.restoreStatement({ ...METACAM, ...STAMPS }, false),
      repository.restoreStatement({ ...PANACUR, ...STAMPS }, false),
      periods.restoreStatement(EN_COURS, false),
      periods.restoreStatement(PREMIERE, false),
      periods.restoreStatement(DE_PANACUR, false),
      ...[SOIR_27, MATIN_27, MATIN_20, SUPPRIMEE].map((row) => doses.insertStatement(row)),
    ])
  })

  afterEach(() => {
    db.close()
  })

  it('lit un traitement avec toutes ses périodes, de la première à la dernière, et ses prises visibles', async () => {
    const metacam = await repository.getWithHistory(METACAM.id)

    expect(metacam).toMatchObject({ ...METACAM, ...STAMPS })
    expect(metacam?.periods).toEqual([
      { ...PREMIERE, deletedAt: null },
      { ...EN_COURS, deletedAt: null },
    ])
    expect(metacam?.doses.map(({ id }) => id).sort()).toEqual(['d-20', 'd-27-matin', 'd-27-soir'])
    expect(metacam?.doses.find(({ id }) => id === 'd-27-soir')).toMatchObject(SOIR_27)
  })

  it('lit un traitement sans prise', async () => {
    await expect(repository.getWithHistory(PANACUR.id)).resolves.toMatchObject({
      ...PANACUR,
      periods: [{ id: PANACUR.id, firstDueOn: '2026-10-10' }],
      doses: [],
    })
  })

  it('ne rend ni un traitement inconnu, ni supprimé, ni sans période', async () => {
    await repository.remove(PANACUR.id)
    await db.run('UPDATE treatment_period SET deleted_at = ? WHERE treatment_id = ?', [
      AT,
      METACAM.id,
    ])

    await expect(repository.getWithHistory('inconnu')).resolves.toBeNull()
    await expect(repository.getWithHistory(PANACUR.id)).resolves.toBeNull()
    await expect(repository.getWithHistory(METACAM.id)).resolves.toBeNull()
    await expect(repository.listAllWithHistory()).resolves.toEqual([])
  })

  it('laisse de côté une période supprimée et ses prises', async () => {
    await db.run('UPDATE treatment_period SET deleted_at = ? WHERE id = ?', [AT, PREMIERE.id])

    const metacam = await repository.getWithHistory(METACAM.id)

    expect(metacam?.periods.map(({ id }) => id)).toEqual([EN_COURS.id])
    expect(metacam?.doses.map(({ id }) => id).sort()).toEqual(['d-27-matin', 'd-27-soir'])
  })

  it('liste les traitements d’un animal, chacun avec ses périodes et ses prises', async () => {
    const [metacam, ...others] = await repository.listWithHistoryByAnimal(LUNA)

    expect(others).toEqual([])
    expect(metacam).toEqual(await repository.getWithHistory(METACAM.id))
    await expect(repository.listWithHistoryByAnimal('inconnu')).resolves.toEqual([])
  })

  it('liste les traitements de tous les animaux', async () => {
    const all = await repository.listAllWithHistory()

    expect(all).toEqual([
      await repository.getWithHistory(METACAM.id),
      await repository.getWithHistory(PANACUR.id),
    ])
  })

  it('lit en trois requêtes, quel que soit le nombre de traitements', async () => {
    const query = vi.spyOn(db, 'query')

    await repository.listAllWithHistory()
    expect(query).toHaveBeenCalledTimes(3)

    query.mockClear()
    await repository.listWithHistoryByAnimal(LUNA)
    expect(query).toHaveBeenCalledTimes(3)
  })

  it('donne au moteur d’échéances de quoi calculer la dose du moment', async () => {
    const metacam = await repository.getWithHistory(METACAM.id)
    const panacur = await repository.getWithHistory(PANACUR.id)

    const schedule = treatmentScheduleOf(metacam!, '2026-09-28')
    expect(schedule.phase).toBe('today')
    expect(schedule.currentPeriodId).toBe(EN_COURS.id)
    expect(schedule.currentDoses).toEqual([
      { periodId: EN_COURS.id, dueOn: '2026-09-28', dueTime: '08:00' },
      { periodId: EN_COURS.id, dueOn: '2026-09-28', dueTime: '20:00' },
    ])
    expect(treatmentScheduleOf(panacur!, '2026-09-28')).toMatchObject({
      phase: 'upcoming',
      currentDoses: [{ periodId: PANACUR.id, dueOn: '2026-10-10', dueTime: null }],
      currentPeriodHasDose: false,
    })
  })
})
