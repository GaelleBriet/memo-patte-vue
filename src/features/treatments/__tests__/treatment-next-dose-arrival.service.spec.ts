// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import {
  createReplay,
  readingAfter,
  storedTreatment,
  type Replay,
} from './treatment-services-replay'

const ID = '22222222-2222-4222-8222-222222222222'
const ANIMAL = '11111111-1111-4111-8111-111111111111'
const TWO_DAYS = { value: 2, unit: 'day' as const }

describe('#796 : « Prochaine dose » avec une posologie déplace l’arrivée du report (décision du 2026-10-12)', () => {
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

  async function metacamReportedToThe10th() {
    replay.clock.day = '2026-10-02'
    replay.tick()
    await replay.treatments.create({
      id: ID,
      animalId: ANIMAL,
      name: 'Métacam',
      type: 'medication',
      settings: {
        startsOn: '2026-10-02',
        firstDueOn: '2026-10-02',
        endsOn: null,
        frequency: TWO_DAYS,
        times: [],
        doseQuantity: 1,
        doseUnit: 'ml',
        reminderOffsetMinutes: null,
        reminderTime: null,
      },
    })
    for (const day of ['2026-10-02', '2026-10-04', '2026-10-06']) {
      replay.clock.day = day
      replay.tick()
      await replay.doses.apply(ID, {
        kind: 'note',
        gesture: {
          kind: 'note',
          due: { settingId: ID, dueOn: day, dueTime: null },
          status: 'given',
          givenOn: day,
          shiftsFollowing: false,
        },
      })
    }
    replay.clock.day = '2026-10-08'
    replay.tick()
    await replay.doses.apply(ID, {
      kind: 'move',
      due: { settingId: ID, dueOn: '2026-10-08', dueTime: null },
      to: '2026-10-10',
      shiftsFollowing: true,
    })
  }

  async function posologyWithNextDose(today: string, nextDoseOn: string) {
    replay.clock.day = today
    replay.tick()
    await replay.plans.update(ID, {
      name: 'Métacam',
      type: 'medication',
      doseQuantity: 2,
      doseUnit: 'ml',
      frequency: TWO_DAYS,
      times: [],
      endsOn: null,
      nextDoseOn,
    })
  }

  it('le 9, posologie et « Prochaine dose » le 11 : la fiche montre 11, 13 et le report arrive le 11', async () => {
    await metacamReportedToThe10th()
    await posologyWithNextDose('2026-10-09', '2026-10-11')

    const read = await readingAfter(replay, ID)
    expect(read?.[4]?.split(',').slice(0, 2)).toEqual(['2026-10-11 ', '2026-10-13 '])
    const report = (await storedTreatment(replay.treatments, ID)).doses.find(
      ({ status }) => status === 'postponed',
    )
    expect(report).toMatchObject({ dueOn: '2026-10-08', targetOn: '2026-10-11' })
    const shift = (await storedTreatment(replay.treatments, ID)).doses.find(
      ({ status }) => status === 'shift',
    )
    expect(shift).toMatchObject({ dueOn: '2026-10-08', targetOn: '2026-10-11' })
  })

  it('le 8, posologie et « Prochaine dose » le 8 : report et décalage supprimés, la fiche montre 8, 10, 12', async () => {
    await metacamReportedToThe10th()
    await posologyWithNextDose('2026-10-08', '2026-10-08')

    const read = await readingAfter(replay, ID)
    expect(read?.[4]?.split(',').slice(0, 3)).toEqual(['2026-10-08 ', '2026-10-10 ', '2026-10-12 '])
    const statuses = (await storedTreatment(replay.treatments, ID)).doses.map(
      ({ status }) => status,
    )
    expect(statuses).not.toContain('postponed')
    expect(statuses).not.toContain('shift')
  })
})
