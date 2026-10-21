// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createReplay, storedTreatment, type Replay } from './treatment-services-replay'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { readTreatment } from '@/shared/domain/treatment-reading'

const ID = '22222222-2222-4222-8222-222222222222'
const ANIMAL = '11111111-1111-4111-8111-111111111111'
const EVERY_3_DAYS = { value: 3, unit: 'day' } as const
const ASKED = { name: 'Test', type: 'medication', doseQuantity: null, doseUnit: null } as const

let db: InMemoryDb
let replay: Replay

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2027, 0, 1) })
  db = await createInMemoryDb()
  replay = await createReplay(db)
})

afterEach(() => {
  db.close()
  vi.useRealTimers()
})

async function miloReportedToThe23rd(): Promise<void> {
  replay.clock.day = '2026-04-05'
  replay.tick()
  await replay.treatments.create({
    id: ID,
    animalId: ANIMAL,
    name: 'Test',
    type: 'medication',
    settings: {
      startsOn: '2026-04-05',
      firstDueOn: '2026-04-07',
      endsOn: null,
      frequency: { value: 1, unit: 'month' },
      times: ['08:00', '14:00', '20:00'],
      doseQuantity: null,
      doseUnit: null,
      reminderOffsetMinutes: null,
      reminderTime: null,
    },
  })
  replay.tick()
  await replay.doses.apply(ID, {
    kind: 'note',
    gesture: {
      kind: 'note',
      due: { settingId: ID, dueOn: '2026-04-07', dueTime: '08:00' },
      status: 'given',
      givenOn: '2026-04-05',
      shiftsFollowing: false,
    },
  })
  replay.tick()
  await replay.plans.update(ID, {
    ...ASKED,
    frequency: EVERY_3_DAYS,
    times: ['08:00', '14:00', '20:00'],
    endsOn: '2026-04-26',
    nextDoseOn: null,
  })
  replay.tick()
  const periodId = (await storedTreatment(replay.treatments, ID)).periods.at(-1)!.id
  await replay.doses.apply(ID, {
    kind: 'move',
    due: { settingId: periodId, dueOn: '2026-04-07', dueTime: '20:00' },
    to: '2026-04-23',
    shiftsFollowing: true,
  })
  replay.tick()
  await replay.plans.update(ID, {
    ...ASKED,
    doseQuantity: 1,
    doseUnit: 'tablet',
    frequency: EVERY_3_DAYS,
    times: ['08:00', '14:00', '20:00'],
    endsOn: '2026-04-26',
    nextDoseOn: null,
  })
}

async function upcoming(): Promise<string[]> {
  const reading = readTreatment(await storedTreatment(replay.treatments, ID), replay.clock.day)
  return reading!.view
    .upcoming({ limit: 3 })
    .map(({ dueOn, dueTime }) => `${dueOn} ${dueTime ?? ''}`)
}

describe('#983 : une ligne « pas à donner » sur la journée de départ ne change pas l’heure d’arrivée du report (R7, #873)', () => {
  it('Milo, 8 h du 7 avril donnée d’avance, puis tous les 3 jours à 8 h, 14 h et 20 h, 20 h du 7 reportée au 23 avec la case, posologie changée ; le 8, passage à 6, 12, 18 et 23 h, « pas à donner » pour le 7 à 14 h : le 23 garde 20 h', async () => {
    await miloReportedToThe23rd()
    replay.clock.day = '2026-04-08'
    expect((await upcoming())[0]).toBe('2026-04-23 20:00')

    replay.tick()
    await replay.plans.update(ID, {
      ...ASKED,
      frequency: EVERY_3_DAYS,
      times: ['06:00', '12:00', '18:00', '23:00'],
      endsOn: '2026-04-26',
      nextDoseOn: null,
      pastDues: 'drop',
    })

    const doses = (await storedTreatment(replay.treatments, ID)).doses
    expect(
      doses
        .filter(({ status }) => status === 'not-due')
        .map(({ dueOn, dueTime }) => `${dueOn} ${dueTime}`),
    ).toEqual(['2026-04-07 14:00'])
    expect((await upcoming())[0]).toBe('2026-04-23 20:00')
  })
})
