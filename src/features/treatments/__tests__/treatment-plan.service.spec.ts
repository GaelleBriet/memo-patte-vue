// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { editionDraft } from '../logic/treatment-plan'
import { treatmentScheduleOf } from '../logic/treatment-schedule-adapter'
import { createTreatmentDosesRepository } from '../repository/treatment-doses.repository'
import { createTreatmentPeriodsRepository } from '../repository/treatment-periods.repository'
import {
  createTreatmentsRepository,
  type TreatmentsRepository,
} from '../repository/treatments.repository'
import type { TreatmentCreationInput, TreatmentEditionInput } from '../schema/treatment-form.schema'
import { createWriteQueue } from '../logic/treatment-write-queue'
import { createTreatmentDosesService, type NotedMoment } from '../service/treatment-doses.service'
import {
  createTreatmentPlanService,
  type TreatmentPlanService,
} from '../service/treatment-plan.service'

const MILO = '11111111-1111-4111-8111-111111111111'
const T0 = '2026-09-01T08:00:00.000Z'

const MILBEMAX: TreatmentCreationInput = {
  animalId: MILO,
  name: 'Milbemax',
  type: 'deworming',
  firstDoseOn: '2026-09-26',
  frequency: { value: 1, unit: 'week' },
  times: [],
  doseQuantity: 1,
  doseUnit: 'tablet',
  endsOn: '2026-10-10',
}

function saisie(changes: Partial<TreatmentEditionInput> = {}): TreatmentEditionInput {
  const { animalId: _animalId, firstDoseOn: _firstDoseOn, ...plan } = MILBEMAX
  return { ...plan, nextDoseOn: null, ...changes }
}

describe('treatmentPlanService', () => {
  let db: InMemoryDb
  let treatments: TreatmentsRepository
  let service: TreatmentPlanService
  let today: string

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(T0) })
    today = '2026-09-28'
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    await db.run(
      `INSERT INTO animal (id, name, species, created_at, updated_at, created_by_device, updated_by_device)
       VALUES (?, 'Milo', 'dog', ?, ?, 'appareil-test', 'appareil-test')`,
      [MILO, T0, T0],
    )
    treatments = createTreatmentsRepository(db)
    service = createTreatmentPlanService({
      treatments: () => treatments,
      today: () => today,
      newId: () => crypto.randomUUID(),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    db.close()
  })

  async function give(treatmentId: string, dueOn: string, nextDueDate: string): Promise<void> {
    await createTreatmentDosesRepository(db).applyBatch(
      [
        {
          action: 'create',
          id: crypto.randomUUID(),
          treatmentId,
          animalId: MILO,
          dose: {
            periodId: treatmentId,
            dueOn,
            dueTime: null,
            givenOn: dueOn,
            status: 'given',
            nextDueDate,
          },
        },
      ],
      T0,
    )
  }

  async function historyOf(id: string) {
    const history = await treatments.getWithHistory(id)
    if (history === null) throw new Error('introuvable')
    return history
  }

  it('crée le traitement avec sa période, sans rien noter comme donné (TR-3)', async () => {
    const created = await service.create({ ...MILBEMAX, firstDoseOn: '2026-09-03' })

    expect(created).toMatchObject({
      name: 'Milbemax',
      periodId: created.id,
    })
    await expect(historyOf(created.id)).resolves.toMatchObject({
      periods: [
        {
          id: created.id,
          startsOn: '2026-09-03',
          firstDueOn: '2026-09-03',
          endsOn: '2026-10-10',
          frequency: { value: 1, unit: 'week' },
          times: [],
          doseQuantity: 1,
          doseUnit: 'tablet',
        },
      ],
      doses: [],
    })
  })

  it('crée le traitement avec les doses passées renseignées dans l’encart, le reste à renseigner', async () => {
    const created = await service.create({
      ...MILBEMAX,
      firstDoseOn: '2026-09-05',
      pastDoses: [
        { dueOn: '2026-09-05', dueTime: null, status: 'given' },
        { dueOn: '2026-09-12', dueTime: null, status: 'missed' },
      ],
    })

    const history = await historyOf(created.id)
    const schedule = treatmentScheduleOf(history, today)
    expect(
      history.doses.map(({ dueOn, status, periodId }) => ({ dueOn, status, periodId })),
    ).toEqual(
      expect.arrayContaining([
        { dueOn: '2026-09-05', status: 'given', periodId: created.id },
        { dueOn: '2026-09-12', status: 'missed', periodId: created.id },
      ]),
    )
    expect(history.doses).toHaveLength(2)
    expect(schedule.unloggedDoses.map(({ dueOn }) => dueOn)).toEqual(['2026-09-19'])
    expect(schedule.currentDoses.map(({ dueOn }) => dueOn)).toEqual(['2026-09-26'])
  })

  it('n’écrit rien quand une dose passée n’est pas une échéance du traitement', async () => {
    await expect(
      service.create({
        ...MILBEMAX,
        firstDoseOn: '2026-09-05',
        pastDoses: [{ dueOn: '2026-09-06', dueTime: null, status: 'given' }],
      }),
    ).rejects.toThrow(RangeError)

    await expect(db.query('SELECT id FROM treatment')).resolves.toEqual([])
  })

  it('refuse une création que le moteur ne saurait pas relire, sans rien écrire', async () => {
    const refus = await service
      .create({
        ...MILBEMAX,
        firstDoseOn: '1950-01-01',
        frequency: { value: 1, unit: 'day' },
        times: ['08:00', '20:00'],
        endsOn: null,
      })
      .catch((cause: unknown) => cause)

    expect(refus).toBeInstanceOf(ZodError)
    expect((refus as ZodError).issues).toMatchObject([{ path: ['firstDoseOn'], message: 'tooOld' }])
    await expect(db.query('SELECT id FROM treatment')).resolves.toEqual([])
  })

  it('refuse une création incohérente sans rien écrire', async () => {
    await expect(service.create({ ...MILBEMAX, doseUnit: null })).rejects.toBeInstanceOf(ZodError)
    await expect(service.create({ ...MILBEMAX, endsOn: '2026-09-25' })).rejects.toBeInstanceOf(
      ZodError,
    )

    await expect(db.query('SELECT id FROM treatment')).resolves.toEqual([])
  })

  it('corrige les réglages d’une période sans prise (TR-28)', async () => {
    const { id } = await service.create({ ...MILBEMAX, firstDoseOn: '2026-10-01' })

    await service.update(id, saisie({ frequency: { value: 2, unit: 'day' }, times: ['08:00'] }))

    await expect(historyOf(id)).resolves.toMatchObject({
      periods: [{ id, frequency: { value: 2, unit: 'day' }, times: ['08:00'] }],
    })
  })

  describe('échéances tombées d’une période sans prise dont le rythme change', () => {
    const TOUS_LES_2_JOURS: TreatmentCreationInput = {
      ...MILBEMAX,
      firstDoseOn: '2026-10-03',
      frequency: { value: 2, unit: 'day' },
      endsOn: null,
    }

    function correction(changes: Partial<TreatmentEditionInput> = {}): TreatmentEditionInput {
      return saisie({ frequency: { value: 3, unit: 'day' }, endsOn: null, ...changes })
    }

    function jours(dues: { dueOn: string; dueTime: string | null }[]): string[] {
      return dues.map(({ dueOn, dueTime }) => (dueTime === null ? dueOn : `${dueOn} ${dueTime}`))
    }

    beforeEach(() => {
      today = '2026-10-08'
    })

    it('n’écrit rien tant que la question n’a pas de réponse', async () => {
      const { id } = await service.create(TOUS_LES_2_JOURS)
      const before = await historyOf(id)

      await expect(service.update(id, correction())).rejects.toBeInstanceOf(ZodError)

      await expect(historyOf(id)).resolves.toEqual(before)
    })

    it('« Elles restent à renseigner » : nouvelle période aujourd’hui, les 3, 5 et 7 oct. restent à renseigner', async () => {
      const { id } = await service.create(TOUS_LES_2_JOURS)
      const [before] = (await historyOf(id)).periods

      await service.update(id, correction({ pastDues: 'keep' }))

      const history = await historyOf(id)
      expect(history.periods[0]).toEqual(before)
      expect(history.periods[1]).toMatchObject({
        startsOn: '2026-10-08',
        firstDueOn: '2026-10-08',
        frequency: { value: 3, unit: 'day' },
      })
      const schedule = treatmentScheduleOf(history, today)
      expect(jours(schedule.unloggedDoses)).toEqual(['2026-10-03', '2026-10-05', '2026-10-07'])
      expect(jours(schedule.currentDoses)).toEqual(['2026-10-08'])
      expect(schedule.phase).toBe('today')
    })

    it('« Elles n’étaient pas à donner » : la période est corrigée, plus rien à renseigner, première échéance aujourd’hui', async () => {
      const { id } = await service.create(TOUS_LES_2_JOURS)

      await service.update(id, correction({ pastDues: 'drop' }))

      const history = await historyOf(id)
      expect(history.periods).toHaveLength(1)
      expect(history.periods[0]).toMatchObject({
        startsOn: '2026-10-03',
        firstDueOn: '2026-10-08',
        frequency: { value: 3, unit: 'day' },
      })
      const schedule = treatmentScheduleOf(history, today)
      expect(schedule.unloggedDoses).toEqual([])
      expect(jours(schedule.currentDoses)).toEqual(['2026-10-08'])
    })

    describe('la date écrite est celle que la question annonçait', () => {
      async function gaelle() {
        return (await service.create(TOUS_LES_2_JOURS)).id
      }

      async function plusieursHeures() {
        return (await service.create({ ...TOUS_LES_2_JOURS, times: ['08:00', '20:00'] })).id
      }

      // Hebdomadaire, prises des 18 et 25 sept. ; le 2 oct., dose due sans prise, fréquence à 10 jours.
      async function ouverteParModifier() {
        today = '2026-10-02'
        const { id } = await service.create({
          ...MILBEMAX,
          firstDoseOn: '2026-09-18',
          endsOn: null,
        })
        await give(id, '2026-09-18', '2026-09-25')
        await give(id, '2026-09-25', '2026-10-02')
        await service.update(id, saisie({ frequency: { value: 10, unit: 'day' }, endsOn: null }))
        today = '2026-10-04'
        return id
      }

      it.each([
        ['le scénario de Gaelle', gaelle, { value: 3, unit: 'day' }, '2026-10-08', '2026-10-08'],
        [
          'plusieurs heures',
          plusieursHeures,
          { value: 3, unit: 'day' },
          '2026-10-08',
          '2026-10-08',
        ],
        [
          'une période ouverte par « Modifier »',
          ouverteParModifier,
          { value: 20, unit: 'day' },
          '2026-10-15',
          '2026-10-04',
        ],
      ] as const)('%s', async (_, prepare, frequency, keep, drop) => {
        for (const [pastDues, expected] of [
          ['keep', keep],
          ['drop', drop],
        ] as const) {
          db.close()
          db = await createInMemoryDb()
          await db.execute('PRAGMA foreign_keys = ON')
          await db.run(
            `INSERT INTO animal (id, name, species, created_at, updated_at, created_by_device, updated_by_device)
             VALUES (?, 'Milo', 'dog', ?, ?, 'appareil-test', 'appareil-test')`,
            [MILO, T0, T0],
          )
          treatments = createTreatmentsRepository(db)
          today = '2026-10-08'
          const id = await prepare()
          const history = await historyOf(id)
          const current = history.periods.at(-1)!
          const input = {
            ...correction({ frequency, times: current.times }),
          }
          const announced = editionDraft(history, input, today).pastDuesNextDose

          expect(announced?.[pastDues]).toBe(expected)
          await service.update(id, { ...input, pastDues, nextDoseOn: announced![pastDues] })

          expect((await historyOf(id)).periods.at(-1)?.firstDueOn).toBe(expected)
        }
      })
    })

    it('à plusieurs heures, garde chaque heure tombée à renseigner', async () => {
      const { id } = await service.create({ ...TOUS_LES_2_JOURS, times: ['08:00', '20:00'] })

      await service.update(id, correction({ times: ['09:00', '21:00'], pastDues: 'keep' }))

      const schedule = treatmentScheduleOf(await historyOf(id), today)
      expect(jours(schedule.unloggedDoses)).toEqual([
        '2026-10-03 08:00',
        '2026-10-03 20:00',
        '2026-10-05 08:00',
        '2026-10-05 20:00',
        '2026-10-07 08:00',
        '2026-10-07 20:00',
      ])
      expect(jours(schedule.currentDoses)).toEqual(['2026-10-08 09:00', '2026-10-08 21:00'])
    })
  })

  it('ouvre une nouvelle période aujourd’hui quand une prise est notée, l’ancienne intacte (TR-28)', async () => {
    const { id } = await service.create(MILBEMAX)
    await give(id, '2026-09-26', '2026-10-03')
    const [before] = (await historyOf(id)).periods

    const updated = await service.update(id, saisie({ frequency: { value: 2, unit: 'day' } }))

    const { periods } = await historyOf(id)
    expect(periods).toHaveLength(2)
    expect(periods[0]).toEqual(before)
    expect(periods[1]).toMatchObject({
      startsOn: '2026-09-28',
      firstDueOn: '2026-09-28',
      frequency: { value: 2, unit: 'day' },
      doseQuantity: 1,
      doseUnit: 'tablet',
      endsOn: '2026-10-10',
    })
    expect(updated.periodId).toBe(periods[1]?.id)
  })

  it('reporte la prochaine dose par une ligne « Reportée », sans période nouvelle (TR-9)', async () => {
    const { id } = await service.create(MILBEMAX)
    await give(id, '2026-09-26', '2026-10-03')

    const updated = await service.update(id, saisie({ nextDoseOn: '2026-10-06' }))

    expect(updated.periodId).toBe(id)
    const { periods, doses } = await historyOf(id)
    expect(periods).toHaveLength(1)
    expect(doses.filter(({ status }) => status !== 'shift')).toMatchObject([
      { dueOn: '2026-10-03', givenOn: null, status: 'postponed', nextDueDate: '2026-10-06' },
      { dueOn: '2026-09-26', status: 'given' },
    ])
    expect(doses.filter(({ status }) => status === 'shift')).toMatchObject([
      { dueOn: '2026-10-03', nextDueDate: '2026-10-06' },
    ])
  })

  it('une notification « C’est fait » pendant un report attend sa fin : jamais une prise et un report sur la même échéance', async () => {
    const { id } = await service.create(MILBEMAX)
    await give(id, '2026-09-26', '2026-10-03')
    const queue = createWriteQueue()
    const doses = createTreatmentDosesService({
      treatments: () => treatments,
      doses: () => createTreatmentDosesRepository(db),
      reminders: { reschedule: () => Promise.resolve() },
      now: () => new Date(),
      today: () => today,
      queue,
    })
    let notification: Promise<NotedMoment> | null = null
    const planning = createTreatmentPlanService({
      treatments: () => ({
        create: (plan) => treatments.create(plan),
        async getWithHistory(treatmentId) {
          const history = await treatments.getWithHistory(treatmentId)
          notification ??= doses.noteMoment(treatmentId, today)
          await new Promise((resolve) => setTimeout(resolve, 50))
          return history
        },
        applyPlan: (treatmentId, plan) => treatments.applyPlan(treatmentId, plan),
      }),
      today: () => today,
      newId: () => crypto.randomUUID(),
      queue,
    })

    await planning.update(id, saisie({ nextDoseOn: '2026-10-06' }))
    await notification

    const { doses: lines } = await historyOf(id)
    const report = lines.find(({ status }) => status === 'postponed')
    expect(report).toMatchObject({ dueOn: '2026-10-03' })
    expect(
      lines.filter(({ status, dueOn }) => status === 'given' && dueOn === report?.dueOn),
    ).toEqual([])
  })

  it('refuse une prochaine dose après la date de fin d’une période qui a déjà une prise, sans rien écrire (Q20)', async () => {
    const { id } = await service.create(MILBEMAX)
    await give(id, '2026-09-26', '2026-10-03')
    const before = await historyOf(id)

    const refus = await service
      .update(id, saisie({ name: 'Autre', nextDoseOn: '2026-11-01' }))
      .catch((cause: unknown) => cause)

    expect(refus).toBeInstanceOf(ZodError)
    expect((refus as ZodError).issues).toMatchObject([
      { path: ['nextDoseOn'], message: 'afterEnd' },
    ])
    await expect(historyOf(id)).resolves.toEqual(before)
  })

  it('reprend un traitement arrêté dans une nouvelle période, la précédente intacte (TR-32)', async () => {
    const { id } = await service.create(MILBEMAX)
    await give(id, '2026-09-26', '2026-10-03')
    await createTreatmentPeriodsRepository(db).stop(id, '2026-09-28')
    const [before] = (await historyOf(id)).periods
    today = '2026-11-02'

    const resumed = await service.resume(id, {
      firstDoseOn: '2026-11-03',
      frequency: { value: 1, unit: 'day' },
      times: ['20:00'],
      doseQuantity: 0.5,
      doseUnit: 'tablet',
      endsOn: '2026-11-07',
    })

    expect(resumed).toMatchObject({
      stoppedOn: null,
    })
    const { periods } = await historyOf(id)
    expect(resumed.periodId).toBe(periods[1]?.id)
    expect(periods[0]).toEqual(before)
    expect(periods[1]).toMatchObject({
      startsOn: '2026-11-03',
      firstDueOn: '2026-11-03',
      endsOn: '2026-11-07',
      stoppedOn: null,
      times: ['20:00'],
      doseQuantity: 0.5,
    })
  })

  it('reprend le jour même de l’arrêt, la prise de ce jour et l’ancienne période intactes (G3)', async () => {
    today = '2026-10-02'
    const { id } = await service.create({ ...MILBEMAX, firstDoseOn: '2026-09-25', endsOn: null })
    await give(id, '2026-10-02', '2026-10-09')
    await createTreatmentPeriodsRepository(db).stop(id, '2026-10-02')
    const before = await historyOf(id)

    await service.resume(id, {
      firstDoseOn: '2026-10-02',
      frequency: { value: 1, unit: 'week' },
      times: [],
      doseQuantity: 1,
      doseUnit: 'tablet',
      endsOn: null,
    })

    const after = await historyOf(id)
    expect(after.periods[0]).toEqual(before.periods[0])
    expect(after.doses).toEqual(before.doses)
    expect(after.periods[1]).toMatchObject({ startsOn: '2026-10-02', firstDueOn: '2026-10-02' })
    const schedule = treatmentScheduleOf(after, today)
    expect(schedule.currentDoses).toMatchObject([
      { periodId: after.periods[1]?.id, dueOn: '2026-10-02' },
    ])
    expect(schedule.doses).toHaveLength(1)
  })

  describe('plusieurs heures par jour', () => {
    const METACAM: TreatmentCreationInput = {
      animalId: MILO,
      name: 'Métacam',
      type: 'medication',
      firstDoseOn: '2026-09-27',
      frequency: { value: 1, unit: 'day' },
      times: ['08:00', '20:00'],
      doseQuantity: 0.5,
      doseUnit: 'ml',
      endsOn: null,
    }

    function reglages(changes: Partial<TreatmentEditionInput> = {}): TreatmentEditionInput {
      const { animalId: _animalId, firstDoseOn: _firstDoseOn, ...plan } = METACAM
      return { ...plan, nextDoseOn: null, ...changes }
    }

    async function giveAt(treatmentId: string, dueOn: string, dueTime: string): Promise<void> {
      await createTreatmentDosesRepository(db).applyBatch(
        [
          {
            action: 'create',
            id: crypto.randomUUID(),
            treatmentId,
            animalId: MILO,
            dose: {
              periodId: treatmentId,
              dueOn,
              dueTime,
              givenOn: dueOn,
              status: 'given',
              nextDueDate: dueOn,
            },
          },
        ],
        T0,
      )
    }

    async function scheduleOf(id: string) {
      return treatmentScheduleOf(await historyOf(id), today)
    }

    function times(dues: { dueOn: string; dueTime: string | null }[]): string[] {
      return dues.map(({ dueOn, dueTime }) => `${dueOn} ${dueTime}`)
    }

    const TOUS_LES_2_JOURS = { frequency: { value: 2, unit: 'day' } } as const

    it('déplace la journée entière par une seule ligne (Q21)', async () => {
      const { id } = await service.create({
        ...METACAM,
        ...TOUS_LES_2_JOURS,
        firstDoseOn: '2026-09-25',
      })
      await giveAt(id, '2026-09-25', '08:00')
      await giveAt(id, '2026-09-25', '20:00')

      await service.update(id, reglages({ ...TOUS_LES_2_JOURS, nextDoseOn: '2026-09-29' }))

      const { periods, doses } = await historyOf(id)
      expect(periods).toHaveLength(1)
      expect(doses.filter(({ status }) => status === 'postponed')).toMatchObject([
        { dueOn: '2026-09-27', dueTime: '08:00', nextDueDate: '2026-09-29' },
      ])
      const schedule = await scheduleOf(id)
      expect(times(schedule.upcoming(3))).toEqual([
        '2026-09-29 08:00',
        '2026-09-29 20:00',
        '2026-10-01 08:00',
      ])
      expect(schedule.unloggedDoses).toEqual([])
    })

    it('ne déplace que l’heure restante d’une journée dont la première prise est notée (Q21)', async () => {
      const { id } = await service.create({ ...METACAM, ...TOUS_LES_2_JOURS })
      await giveAt(id, '2026-09-27', '08:00')

      await service.update(id, reglages({ ...TOUS_LES_2_JOURS, nextDoseOn: '2026-09-29' }))

      const { doses } = await historyOf(id)
      expect(doses.filter(({ status }) => status === 'postponed')).toMatchObject([
        { dueOn: '2026-09-27', dueTime: '20:00', nextDueDate: '2026-09-29' },
      ])
      const schedule = await scheduleOf(id)
      expect(times(schedule.upcoming(2))).toEqual(['2026-09-29 08:00', '2026-09-29 20:00'])
      expect(schedule.unloggedDoses).toEqual([])
    })

    it('compte la prise de 8 h déjà notée pour la première heure du nouveau réglage : reste 21 h (Q24)', async () => {
      const { id } = await service.create(METACAM)
      await giveAt(id, '2026-09-27', '08:00')
      await giveAt(id, '2026-09-27', '20:00')
      await giveAt(id, '2026-09-28', '08:00')

      await service.update(id, reglages({ times: ['09:00', '21:00'] }))

      const { periods } = await historyOf(id)
      expect(periods[1]).toMatchObject({
        startsOn: '2026-09-28',
        firstDueOn: '2026-09-28',
        times: ['09:00', '21:00'],
      })
      const schedule = await scheduleOf(id)
      expect(times(schedule.currentDoses)).toEqual(['2026-09-28 21:00'])
      expect(schedule.unloggedDoses).toEqual([])
    })

    it('commence la nouvelle période par la dose du jour quand le rythme ne change pas et que rien n’est noté (G15)', async () => {
      const { id } = await service.create(METACAM)
      await giveAt(id, '2026-09-27', '08:00')
      await giveAt(id, '2026-09-27', '20:00')

      await service.update(id, reglages({ times: ['09:00', '21:00'] }))

      const { periods } = await historyOf(id)
      expect(periods[1]).toMatchObject({ startsOn: '2026-09-28', firstDueOn: '2026-09-28' })
      const schedule = await scheduleOf(id)
      expect(times(schedule.currentDoses)).toEqual(['2026-09-28 09:00', '2026-09-28 21:00'])
      expect(schedule.unloggedDoses).toEqual([])
    })
  })

  it('échoue pour un traitement introuvable', async () => {
    await expect(service.update('inconnu', saisie())).rejects.toThrow(
      'Traitement introuvable : inconnu',
    )
  })
})
