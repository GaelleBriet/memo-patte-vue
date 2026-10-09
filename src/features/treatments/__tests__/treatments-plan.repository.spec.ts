// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import {
  createTreatmentsRepository,
  type TreatmentsRepository,
} from '../repository/treatments.repository'
import type { NewTreatmentPlan, TreatmentPlanWrite } from '../schema/treatment-plan.schema'
import type { TreatmentPeriodSettings } from '../schema/treatment-period.schema'

const MIETTE = '11111111-1111-4111-8111-111111111111'
const PANACUR = '22222222-2222-4222-8222-222222222222'
const SECONDE = '33333333-3333-4333-8333-333333333333'
const REPORT = '44444444-4444-4444-8444-444444444444'
const ANIMAL_INCONNU = '55555555-5555-4555-8555-555555555555'
const T0 = '2026-09-28T10:00:00.000Z'
const T1 = '2026-09-28T10:01:00.000Z'

const REGLAGES: TreatmentPeriodSettings = {
  startsOn: '2026-09-29',
  firstDueOn: '2026-09-29',
  endsOn: '2026-10-10',
  frequency: { value: 1, unit: 'day' },
  times: ['08:00', '20:00'],
  doseQuantity: 0.5,
  doseUnit: 'tablet',
  reminderOffsetMinutes: null,
  reminderTime: null,
}

const PLAN: NewTreatmentPlan = {
  id: PANACUR,
  animalId: MIETTE,
  name: 'Panacur',
  type: 'deworming',
  settings: REGLAGES,
}

const RIEN: TreatmentPlanWrite = { treatment: null, period: null, doses: [] }

describe('treatmentsRepository — créer et écrire un plan', () => {
  let db: InMemoryDb
  let repository: TreatmentsRepository

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(T0) })
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    await db.run(
      `INSERT INTO animal (id, name, species, created_at, updated_at, created_by_device, updated_by_device)
       VALUES (?, 'Miette', 'cat', ?, ?, 'appareil-test', 'appareil-test')`,
      [MIETTE, T0, T0],
    )
    repository = createTreatmentsRepository(db)
  })

  afterEach(() => {
    vi.useRealTimers()
    db.close()
  })

  async function stamps() {
    const [treatment] = await db.query<{ updated_at: string }>(
      'SELECT updated_at FROM treatment WHERE id = ?',
      [PANACUR],
    )
    const periods = await db.query<{ updated_at: string }>(
      'SELECT updated_at FROM treatment_period WHERE treatment_id = ? ORDER BY starts_on, id',
      [PANACUR],
    )
    return { treatment: treatment?.updated_at, periods: periods.map((row) => row.updated_at) }
  }

  async function queued() {
    const rows = await db.query<{ entity: string }>('SELECT entity FROM sync_outbox')
    return rows.map(({ entity }) => entity).sort()
  }

  async function createdThenSynced() {
    await repository.create(PLAN)
    await db.run('UPDATE sync_state SET enabled = 1 WHERE id = 1')
    vi.setSystemTime(new Date(T1))
  }

  describe('create', () => {
    it('écrit le traitement et sa première période, de même identifiant, sans aucune prise', async () => {
      const created = await repository.create(PLAN)

      expect(created).toEqual({
        id: PANACUR,
        animalId: MIETTE,
        name: 'Panacur',
        type: 'deworming',
        periodId: PANACUR,
        frequency: { value: 1, unit: 'day' },
        stoppedOn: null,
        createdAt: T0,
        updatedAt: T0,
        deletedAt: null,
      })
      await expect(repository.getWithHistory(PANACUR)).resolves.toMatchObject({
        periods: [
          { id: PANACUR, treatmentId: PANACUR, animalId: MIETTE, stoppedOn: null, ...REGLAGES },
        ],
        doses: [],
      })
      await expect(db.query('SELECT id FROM treatment_dose')).resolves.toEqual([])
    })

    it('écrit les prises du plan avec le traitement et sa période, en une seule transaction', async () => {
      const runMany = vi.spyOn(db, 'runMany')
      const fields = { periodId: PANACUR, dueTime: '08:00' }

      await repository.create({
        ...PLAN,
        settings: { ...REGLAGES, startsOn: '2026-09-26', firstDueOn: '2026-09-26' },
        doses: [
          {
            id: REPORT,
            dose: {
              ...fields,
              dueOn: '2026-09-26',
              givenOn: '2026-09-26',
              status: 'given',
              nextDueDate: '2026-09-26',
            },
          },
          {
            id: SECONDE,
            dose: {
              ...fields,
              dueOn: '2026-09-27',
              givenOn: null,
              status: 'missed',
              nextDueDate: '2026-09-27',
            },
          },
        ],
      })

      expect(runMany).toHaveBeenCalledOnce()
      const history = await repository.getWithHistory(PANACUR)
      expect(history?.doses.map(({ id }) => id).sort()).toEqual([SECONDE, REPORT])
      expect(history?.doses).toMatchObject([
        { treatmentId: PANACUR, animalId: MIETTE, periodId: PANACUR },
        { treatmentId: PANACUR, animalId: MIETTE, periodId: PANACUR },
      ])
    })

    it('n’écrit ni traitement ni période quand une prise du plan est refusée', async () => {
      const dose = {
        periodId: PANACUR,
        dueOn: '2026-09-26',
        dueTime: null,
        givenOn: '2026-09-26',
        status: 'given' as const,
        nextDueDate: '2026-09-27',
      }

      await expect(
        repository.create({
          ...PLAN,
          doses: [
            { id: REPORT, dose },
            { id: REPORT, dose },
          ],
        }),
      ).rejects.toThrow(/UNIQUE constraint failed/)

      await expect(db.query('SELECT id FROM treatment')).resolves.toEqual([])
      await expect(db.query('SELECT id FROM treatment_period')).resolves.toEqual([])
    })

    it('n’écrit rien quand la période est refusée par la base', async () => {
      await db.execute(
        `CREATE TRIGGER refuse BEFORE INSERT ON treatment_period
         BEGIN SELECT RAISE(ABORT, 'écriture refusée'); END`,
      )

      await expect(repository.create(PLAN)).rejects.toThrow('écriture refusée')

      await expect(db.query('SELECT id FROM treatment')).resolves.toEqual([])
    })

    it.each([
      ['un nom vide', { name: '   ' }],
      ['un type hors liste', { type: 'vaccine' as never }],
      ['une quantité sans unité', { settings: { ...REGLAGES, doseUnit: null } }],
      [
        'une date de fin avant la première prise',
        { settings: { ...REGLAGES, endsOn: '2026-09-28' } },
      ],
      [
        'une fréquence nulle',
        { settings: { ...REGLAGES, frequency: { value: 0, unit: 'day' as const } } },
      ],
    ])('rejette %s avant d’atteindre la base', async (_, change) => {
      await expect(repository.create({ ...PLAN, ...change })).rejects.toBeInstanceOf(ZodError)

      await expect(db.query('SELECT id FROM treatment')).resolves.toEqual([])
    })

    it('refuse un traitement rattaché à un animal inexistant (clé étrangère)', async () => {
      await expect(repository.create({ ...PLAN, animalId: ANIMAL_INCONNU })).rejects.toThrow(
        /FOREIGN KEY constraint failed/,
      )

      await expect(db.query('SELECT id FROM treatment')).resolves.toEqual([])
    })
  })

  describe('applyPlan', () => {
    it('corrige le nom et le type en ne datant que le traitement', async () => {
      await createdThenSynced()

      const updated = await repository.applyPlan(PANACUR, {
        ...RIEN,
        treatment: { name: ' Panacur 250 ', type: 'medication' },
      })

      expect(updated).toMatchObject({ name: 'Panacur 250', type: 'medication', updatedAt: T1 })
      await expect(stamps()).resolves.toEqual({ treatment: T1, periods: [T0] })
      await expect(queued()).resolves.toEqual(['treatment'])
    })

    it('ne date rien quand le nom et le type ne changent pas', async () => {
      await createdThenSynced()

      await repository.applyPlan(PANACUR, {
        ...RIEN,
        treatment: { name: 'Panacur', type: 'deworming' },
      })

      await expect(stamps()).resolves.toEqual({ treatment: T0, periods: [T0] })
      await expect(queued()).resolves.toEqual([])
    })

    it('corrige les réglages de la période en cours, sans dater le traitement', async () => {
      await createdThenSynced()
      const settings = { ...REGLAGES, times: ['09:00'], endsOn: null, doseQuantity: 1 }

      await repository.applyPlan(PANACUR, { ...RIEN, period: { action: 'correct', settings } })

      await expect(repository.getWithHistory(PANACUR)).resolves.toMatchObject({
        periods: [{ id: PANACUR, ...settings, updatedAt: T1 }],
      })
      await expect(stamps()).resolves.toEqual({ treatment: T0, periods: [T1] })
      await expect(queued()).resolves.toEqual(['treatment_period'])
    })

    it('ouvre une nouvelle période, qui devient la période en cours, sans toucher à la précédente', async () => {
      await createdThenSynced()
      const settings: TreatmentPeriodSettings = {
        ...REGLAGES,
        startsOn: '2026-10-02',
        firstDueOn: '2026-10-03',
        frequency: { value: 2, unit: 'day' },
      }

      const updated = await repository.applyPlan(PANACUR, {
        ...RIEN,
        period: { action: 'open', id: SECONDE, settings },
      })

      expect(updated).toMatchObject({
        periodId: SECONDE,
        frequency: { value: 2, unit: 'day' },
      })
      await expect(repository.getWithHistory(PANACUR)).resolves.toMatchObject({
        periods: [
          { id: PANACUR, ...REGLAGES, updatedAt: T0 },
          {
            id: SECONDE,
            treatmentId: PANACUR,
            animalId: MIETTE,
            stoppedOn: null,
            ...settings,
            createdAt: T1,
            updatedAt: T1,
          },
        ],
      })
    })

    const LIGNE = {
      periodId: PANACUR,
      dueOn: '2026-09-29',
      dueTime: '08:00',
      givenOn: null,
      status: 'postponed',
      nextDueDate: '2026-10-01',
    } as const

    it('crée, réécrit puis supprime une ligne de déplacement', async () => {
      await createdThenSynced()

      await repository.applyPlan(PANACUR, {
        ...RIEN,
        doses: [{ action: 'create', id: REPORT, dose: LIGNE }],
      })
      await expect(repository.getWithHistory(PANACUR)).resolves.toMatchObject({
        doses: [{ id: REPORT, treatmentId: PANACUR, animalId: MIETTE, ...LIGNE, createdAt: T1 }],
      })

      await repository.applyPlan(PANACUR, {
        ...RIEN,
        doses: [{ action: 'rewrite', id: REPORT, dose: { ...LIGNE, nextDueDate: '2026-10-02' } }],
      })
      await expect(repository.getWithHistory(PANACUR)).resolves.toMatchObject({
        doses: [{ id: REPORT, nextDueDate: '2026-10-02' }],
      })

      await repository.applyPlan(PANACUR, { ...RIEN, doses: [{ action: 'delete', id: REPORT }] })
      await expect(repository.getWithHistory(PANACUR)).resolves.toMatchObject({ doses: [] })
    })

    it('n’écrit ni le nom, ni la période, ni la ligne quand une des écritures échoue', async () => {
      await createdThenSynced()
      await db.execute(
        `CREATE TRIGGER refuse BEFORE INSERT ON treatment_dose
         BEGIN SELECT RAISE(ABORT, 'ligne refusée'); END`,
      )

      await expect(
        repository.applyPlan(PANACUR, {
          treatment: { name: 'Autre', type: 'deworming' },
          period: { action: 'correct', settings: { ...REGLAGES, endsOn: null } },
          doses: [{ action: 'create', id: REPORT, dose: LIGNE }],
        }),
      ).rejects.toThrow('ligne refusée')

      await expect(repository.getById(PANACUR)).resolves.toMatchObject({ name: 'Panacur' })
      await expect(stamps()).resolves.toEqual({ treatment: T0, periods: [T0] })
    })

    it('refuse des réglages incohérents sans rien écrire', async () => {
      await createdThenSynced()

      await expect(
        repository.applyPlan(PANACUR, {
          ...RIEN,
          treatment: { name: 'Autre', type: 'deworming' },
          period: { action: 'correct', settings: { ...REGLAGES, endsOn: '2026-09-28' } },
        }),
      ).rejects.toBeInstanceOf(ZodError)

      await expect(repository.getById(PANACUR)).resolves.toMatchObject({ name: 'Panacur' })
    })

    it('échoue pour un traitement inconnu ou supprimé, sans le ressusciter', async () => {
      await repository.create(PLAN)
      await repository.remove(PANACUR)
      const plan = { ...RIEN, treatment: { name: 'Autre', type: 'deworming' as const } }

      await expect(repository.applyPlan('inconnu', plan)).rejects.toThrow(
        'Traitement introuvable : inconnu',
      )
      await expect(repository.applyPlan(PANACUR, plan)).rejects.toThrow(
        `Traitement introuvable : ${PANACUR}`,
      )
      await expect(db.query('SELECT name FROM treatment')).resolves.toEqual([{ name: 'Panacur' }])
    })
  })
})
