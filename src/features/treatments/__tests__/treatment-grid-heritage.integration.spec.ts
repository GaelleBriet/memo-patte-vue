// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { editionDraft } from '../logic/treatment-edition-draft'
import type { TreatmentEditionInput } from '../schema/treatment-form.schema'
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
