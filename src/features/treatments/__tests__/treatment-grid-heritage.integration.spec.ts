// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { editionDraft } from '../logic/treatment-edition-draft'
import type { TreatmentEditionInput } from '../schema/treatment-form.schema'
import { readTreatment } from '@/shared/domain/treatment-reading'
import { createReplay, storedTreatment, type Replay } from './treatment-services-replay'

// Une période qui reprend la grille de la précédente sans la changer garde sa date de grille.
// Milo, tous les 3 jours à 20 h depuis le 26 mars, prises du 26 et du 29.

const ANIMAL = '11111111-1111-4111-8111-111111111111'
const CREATED = '2026-03-26T07:00:00.000Z'
const EVERY_3_DAYS = { value: 3, unit: 'day' } as const

const edition = (changes: Partial<TreatmentEditionInput>): TreatmentEditionInput => ({
  name: 'Metacam',
  type: 'medication',
  frequency: EVERY_3_DAYS,
  times: ['20:00'],
  doseQuantity: null,
  doseUnit: null,
  endsOn: null,
  reminderOffsetMinutes: null,
  reminderTime: null,
  nextDoseOn: null,
  ...changes,
})

describe('date de grille d’une période ouverte par « Modifier » ou « Reprendre »', () => {
  let db: InMemoryDb
  let app: Replay
  let id: string

  const at = (day: string, time: string) => {
    app.clock.day = day
    vi.setSystemTime(new Date(`${day}T${time}:00.000Z`))
  }

  async function opened() {
    const periods = (await storedTreatment(app.treatments, id)).periods
    expect(periods).toHaveLength(2)
    return periods.at(-1)!
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(CREATED) })
    db = await createInMemoryDb()
    app = await createReplay(db)
    app.clock.day = '2026-03-26'
    ;({ id } = await app.plans.create({
      animalId: ANIMAL,
      name: 'Metacam',
      type: 'medication',
      firstDoseOn: '2026-03-26',
      frequency: EVERY_3_DAYS,
      times: ['20:00'],
      doseQuantity: null,
      doseUnit: null,
      endsOn: null,
      reminderOffsetMinutes: null,
      reminderTime: null,
    }))
    for (const day of ['2026-03-26', '2026-03-29']) {
      at(day, '20:00')
      const periodId = (await storedTreatment(app.treatments, id)).periods[0]!.id
      await app.doses.apply(id, {
        kind: 'note',
        gesture: {
          kind: 'note',
          due: { settingId: periodId, dueOn: day, dueTime: '20:00' },
          status: 'given',
          givenOn: day,
          shiftsFollowing: false,
        },
      })
    }
  })

  afterEach(() => {
    db.close()
    vi.useRealTimers()
  })

  it('« Modifier » à 6 h le 1er avril, heures seules : la nouvelle période garde la date de grille', async () => {
    at('2026-04-01', '09:00')
    await app.plans.update(id, edition({ times: ['06:00'] }))

    const period = await opened()
    expect([period.createdAt, period.gridWrittenAt]).toEqual(['2026-04-01T09:00:00.000Z', CREATED])
  })

  it('le 31 mars, « Modifier » 7 h et « Prochaine dose » le 1er avril : la fiche lit 1er, 4, 7… avant comme après, la grille hérite', async () => {
    at('2026-03-31', '09:00')
    const read = async () =>
      readTreatment(await storedTreatment(app.treatments, id), '2026-03-31')!
        .view.upcoming({ limit: 3 })
        .map(({ dueOn }) => dueOn)
    const before = await read()

    await app.plans.update(id, edition({ times: ['07:00'], nextDoseOn: '2026-04-01' }))

    expect(before).toEqual(['2026-04-01', '2026-04-04', '2026-04-07'])
    expect(await read()).toEqual(before)
    expect((await opened()).gridWrittenAt).toBe(CREATED)
  })

  it('« Elles restent à renseigner » sur un traitement sans prise : mêmes jours, la date de grille est gardée', async () => {
    at('2026-03-26', '07:00')
    ;({ id } = await app.plans.create({
      animalId: ANIMAL,
      name: 'Milbémax',
      type: 'deworming',
      firstDoseOn: '2026-03-26',
      frequency: EVERY_3_DAYS,
      times: ['20:00'],
      doseQuantity: null,
      doseUnit: null,
      endsOn: null,
      reminderOffsetMinutes: null,
      reminderTime: null,
    }))
    at('2026-04-02', '09:00')
    const input = edition({ name: 'Milbémax', type: 'deworming', times: ['06:00'] })
    const draft = editionDraft(await storedTreatment(app.treatments, id), input, '2026-04-02')
    expect(draft.pastDues.length).toBeGreaterThan(0)

    await app.plans.update(id, {
      ...input,
      nextDoseOn: draft.nextDose!.proposedOn,
      pastDues: 'keep',
    })

    const period = await opened()
    expect([period.fallenDosesAnswer, period.gridWrittenAt]).toEqual(['stay-unlogged', CREATED])
  })

  it.each<[string, Partial<TreatmentEditionInput>]>([
    ['une fin posée', { times: ['06:00'], endsOn: '2026-06-30' }],
    ['une autre fréquence', { frequency: { value: 2, unit: 'day' } }],
    [
      '« Prochaine dose » le 2 avril, hors de la grille',
      { times: ['06:00'], nextDoseOn: '2026-04-02' },
    ],
  ])('%s : la nouvelle période est datée de sa création', async (_, changes) => {
    at('2026-04-01', '09:00')
    await app.plans.update(id, edition(changes))

    expect((await opened()).gridWrittenAt).toBe('2026-04-01T09:00:00.000Z')
  })

  it('un ou deux « Modifier » le 1er avril (6 h, puis « Prochaine dose » le 4) : la même date de grille', async () => {
    at('2026-04-01', '06:00')
    await app.plans.update(id, edition({ times: ['06:00'] }))
    at('2026-04-01', '06:05')
    await app.plans.update(id, edition({ times: ['06:00'], nextDoseOn: '2026-04-04' }))
    const twice = await opened()

    expect([twice.firstDueOn, twice.gridWrittenAt]).toEqual(['2026-04-04', CREATED])
  })

  it('« Prochaine dose » le 4 avril en un seul « Modifier » : la date de grille du 26 mars', async () => {
    at('2026-04-01', '06:05')
    await app.plans.update(id, edition({ times: ['06:00'], nextDoseOn: '2026-04-04' }))
    const once = await opened()

    expect([once.firstDueOn, once.gridWrittenAt]).toEqual(['2026-04-04', CREATED])
  })

  it('tous les 2 jours puis de nouveau tous les 3 jours le même matin : la date de grille du 26 mars', async () => {
    at('2026-04-01', '06:00')
    await app.plans.update(id, edition({ frequency: { value: 2, unit: 'day' } }))
    expect((await opened()).gridWrittenAt).toBe('2026-04-01T06:00:00.000Z')
    at('2026-04-01', '06:05')
    await app.plans.update(id, edition({}))

    expect((await opened()).gridWrittenAt).toBe(CREATED)
  })

  it('« Reprendre » après un arrêt : la nouvelle période est datée de sa création', async () => {
    at('2026-03-30', '09:00')
    await app.stops.stop(id)
    at('2026-04-01', '09:00')
    await app.plans.resume(id, {
      firstDoseOn: '2026-04-01',
      frequency: EVERY_3_DAYS,
      times: ['20:00'],
      doseQuantity: null,
      doseUnit: null,
      endsOn: null,
      reminderOffsetMinutes: null,
      reminderTime: null,
    })

    expect((await opened()).gridWrittenAt).toBe('2026-04-01T09:00:00.000Z')
  })
})

describe('en mois, la grille gardée est celle que le moteur continue', () => {
  // Luna, chaque mois à 20 h depuis le 31 janvier, prises du 31 janvier et du 28 février.
  const MONTHLY = { value: 1, unit: 'month' } as const
  const LUNA_CREATED = '2026-01-31T07:00:00.000Z'
  let db: InMemoryDb
  let app: Replay
  let id: string

  const at = (day: string, time: string) => {
    app.clock.day = day
    vi.setSystemTime(new Date(`${day}T${time}:00.000Z`))
  }
  const given = async (day: string, time = '20:00') => {
    at(day, time)
    const treatment = await storedTreatment(app.treatments, id)
    await app.doses.apply(id, {
      kind: 'note',
      gesture: {
        kind: 'note',
        due: { settingId: treatment.periods.at(-1)!.id, dueOn: day, dueTime: time },
        status: 'given',
        givenOn: day,
        shiftsFollowing: false,
      },
    })
  }
  const modified = (times: string[], nextDoseOn: string) =>
    app.plans.update(id, {
      ...edition({ name: 'Bravecto', type: 'antiparasitic', frequency: MONTHLY }),
      times,
      nextDoseOn,
    })
  const gridDates = async () =>
    (await storedTreatment(app.treatments, id)).periods.map(({ gridWrittenAt }) => gridWrittenAt)

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(LUNA_CREATED) })
    db = await createInMemoryDb()
    app = await createReplay(db)
    app.clock.day = '2026-01-31'
    ;({ id } = await app.plans.create({
      animalId: ANIMAL,
      name: 'Bravecto',
      type: 'antiparasitic',
      firstDoseOn: '2026-01-31',
      frequency: MONTHLY,
      times: ['20:00'],
      doseQuantity: null,
      doseUnit: null,
      endsOn: null,
      reminderOffsetMinutes: null,
      reminderTime: null,
    }))
    await given('2026-01-31')
    await given('2026-02-28')
    at('2026-04-02', '09:00')
    await modified(['08:00'], '2026-04-30')
    await given('2026-04-30', '08:00')
  })

  afterEach(() => {
    db.close()
    vi.useRealTimers()
  })

  it('le 2 avril, « Prochaine dose » le 30 avril garde la grille du 31 janvier', async () => {
    expect(await gridDates()).toEqual([LUNA_CREATED, LUNA_CREATED])
  })

  it('le 5 mai, « Prochaine dose » le 30 mai change la grille : datée de sa création', async () => {
    at('2026-05-05', '09:00')
    await modified(['09:00'], '2026-05-30')

    expect((await gridDates()).at(-1)).toBe('2026-05-05T09:00:00.000Z')
  })

  it('le 5 mai, « Prochaine dose » le 31 juillet garde la grille du 31 janvier', async () => {
    at('2026-05-05', '09:00')
    await modified(['09:00'], '2026-07-31')

    expect((await gridDates()).at(-1)).toBe(LUNA_CREATED)
  })
})

describe('reports, décalages et lignes que le même « Modifier » réécrit', () => {
  type Frequency = { value: number; unit: 'day' | 'week' | 'month' }
  let db: InMemoryDb
  let app: Replay

  const at = (day: string, time: string) => {
    app.clock.day = day
    vi.setSystemTime(new Date(`${day}T${time}:00.000Z`))
  }
  const create = async (firstDoseOn: string, frequency: Frequency, times: string[]) =>
    (
      await app.plans.create({
        animalId: ANIMAL,
        name: 'Metacam',
        type: 'medication',
        firstDoseOn,
        frequency,
        times,
        doseQuantity: null,
        doseUnit: null,
        endsOn: null,
        reminderOffsetMinutes: null,
        reminderTime: null,
      })
    ).id
  const periodOf = async (id: string) => (await storedTreatment(app.treatments, id)).periods.at(-1)!
  const move = async (id: string, dueOn: string, dueTime: string, to: string) =>
    app.doses.apply(id, {
      kind: 'move',
      due: { settingId: (await periodOf(id)).id, dueOn, dueTime },
      to,
      shiftsFollowing: true,
    })
  const note = async (
    id: string,
    dueOn: string,
    dueTime: string,
    status: 'given' | 'missed',
    givenOn: string,
    shiftsFollowing = false,
  ) =>
    app.doses.apply(id, {
      kind: 'note',
      gesture: {
        kind: 'note',
        due: { settingId: (await periodOf(id)).id, dueOn, dueTime },
        status,
        givenOn,
        shiftsFollowing,
      },
    })
  const modify = (
    id: string,
    frequency: Frequency,
    times: string[],
    nextDoseOn: string | null = null,
  ) => app.plans.update(id, { ...edition({ frequency, times }), nextDoseOn })
  const inherited = async (id: string) => {
    const periods = (await storedTreatment(app.treatments, id)).periods
    return periods.at(-1)!.gridWrittenAt === periods[0]!.gridWrittenAt
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-01-01T00:00:00.000Z') })
    db = await createInMemoryDb()
    app = await createReplay(db)
  })

  afterEach(() => {
    db.close()
    vi.useRealTimers()
  })

  it('tous les jours depuis le 1er mars, la dose du 6 reportée au 21 en décalant ; le 6, « Prochaine dose » le 15 réécrit report et décalage : datée', async () => {
    const daily = { value: 1, unit: 'day' } as const
    at('2026-03-01', '07:00')
    const id = await create('2026-03-01', daily, ['20:00'])
    at('2026-03-06', '07:00')
    await move(id, '2026-03-06', '20:00', '2026-03-21')
    at('2026-03-06', '08:00')
    await modify(id, daily, ['21:00'], '2026-03-15')

    expect(await inherited(id)).toBe(false)
  })

  it('même carnet, le 6, « Modifier » 21 h seules : hérite', async () => {
    const daily = { value: 1, unit: 'day' } as const
    at('2026-03-01', '07:00')
    const id = await create('2026-03-01', daily, ['20:00'])
    at('2026-03-06', '07:00')
    await move(id, '2026-03-06', '20:00', '2026-03-21')
    at('2026-03-06', '08:00')
    await modify(id, daily, ['21:00'])

    expect(await inherited(id)).toBe(true)
  })

  it('toutes les 3 semaines depuis le 22 septembre ; la dose du 22 reportée au 23, celle du 23 donnée le 25, en décalant ; le 25, tous les 21 jours : hérite, comme à 3 semaines (#979)', async () => {
    const threeWeeks = { value: 3, unit: 'week' } as const
    at('2026-09-22', '07:00')
    const id = await create('2026-09-22', threeWeeks, ['08:00'])
    await move(id, '2026-09-22', '08:00', '2026-09-23')
    at('2026-09-25', '07:00')
    await note(id, '2026-09-23', '08:00', 'given', '2026-09-25', true)
    at('2026-09-25', '08:00')
    await modify(id, { value: 21, unit: 'day' }, ['08:00'])

    expect(await inherited(id)).toBe(true)
  })

  it('tous les 2 mois à 8 h et 20 h depuis le 11 novembre, 20 h oubliée, la dose du 11 janvier à 8 h avancée au 19 novembre en décalant ; le 11, 9 h et 21 h, « Prochaine dose » le 19 : hérite', async () => {
    const twoMonths = { value: 2, unit: 'month' } as const
    at('2026-11-11', '07:00')
    const id = await create('2026-11-11', twoMonths, ['08:00', '20:00'])
    await note(id, '2026-11-11', '20:00', 'missed', '2026-11-11')
    await move(id, '2027-01-11', '08:00', '2026-11-19')
    at('2026-11-11', '09:00')
    await modify(id, twoMonths, ['09:00', '21:00'], '2026-11-19')

    expect(await inherited(id)).toBe(true)
  })

  it('une grille qui commence le 10 avril : « Prochaine dose » le 7 ou le 4 datée, le 13 hérite', async () => {
    const results: boolean[] = []
    for (const nextDoseOn of ['2026-04-07', '2026-04-04', '2026-04-13']) {
      at('2026-03-30', '07:00')
      const id = await create('2026-04-10', { value: 3, unit: 'day' }, ['20:00'])
      at('2026-03-31', '09:00')
      await modify(id, { value: 3, unit: 'day' }, ['07:00'], nextDoseOn)
      results.push(await inherited(id))
    }

    expect(results).toEqual([false, false, true])
  })

  it('tous les 3 jours depuis le 1er mars, dose du 1er donnée, la dose du 4 reportée au 6 en décalant ; le 3, un ou deux « Modifier » (22 h et le 5) : datée du 3 mars à 8 h', async () => {
    const results: string[] = []
    for (const steps of [[['22:00']], [['21:00'], ['22:00']]]) {
      at('2026-03-01', '07:00')
      const id = await create('2026-03-01', { value: 3, unit: 'day' }, ['20:00'])
      at('2026-03-01', '21:00')
      await note(id, '2026-03-01', '20:00', 'given', '2026-03-01')
      at('2026-03-02', '09:00')
      await move(id, '2026-03-04', '20:00', '2026-03-06')
      for (const [index, times] of steps.entries()) {
        at('2026-03-03', `0${8 + index}:00`)
        await modify(id, { value: 3, unit: 'day' }, times, '2026-03-05')
      }
      results.push((await storedTreatment(app.treatments, id)).periods.at(-1)!.gridWrittenAt)
    }

    expect(results).toEqual(['2026-03-03T08:00:00.000Z', '2026-03-03T08:00:00.000Z'])
  })

  it('tous les 3 jours depuis le 1er mars, la dose du 4 reportée au 8 en décalant ; le 5, un ou deux « Modifier » vers le 9 : la même date de grille, datée', async () => {
    const results: [boolean, string][] = []
    for (const steps of [['2026-03-09'], ['2026-03-06', '2026-03-09']]) {
      at('2026-03-01', '07:00')
      const id = await create('2026-03-01', { value: 3, unit: 'day' }, ['20:00'])
      at('2026-03-04', '07:00')
      await move(id, '2026-03-04', '20:00', '2026-03-08')
      for (const [index, nextDoseOn] of steps.entries()) {
        at('2026-03-05', `0${8 + index}:00`)
        await modify(id, { value: 3, unit: 'day' }, ['21:00'], nextDoseOn)
      }
      const read = readTreatment(await storedTreatment(app.treatments, id), '2026-03-05')!
      const days = read.view.upcoming({ limit: 3 }).map(({ dueOn }) => dueOn)
      results.push([await inherited(id), days.join(' ')])
    }

    expect(results[1]).toEqual(results[0])
    expect(results[0]![0]).toBe(false)
  })
})
