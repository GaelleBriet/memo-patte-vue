// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { V2Walk } from '../../../../scripts/dose-engine/v2-walk'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import type { Frequency, Hour } from '@/shared/domain/dose-calendar'
import { readTreatment } from '@/shared/domain/treatment-reading'
import { createReplay, storedTreatment, type Replay } from './treatment-services-replay'

const EVERY_2_DAYS: Frequency = { value: 2, unit: 'day' }
const EVERY_3_DAYS: Frequency = { value: 3, unit: 'day' }
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

async function carnet(first: string, frequency: Frequency, times: string[], today: string) {
  const id = crypto.randomUUID()
  const setting = {
    id: 's1',
    startsOn: first,
    firstDueOn: first,
    gridOriginOn: first,
    endsOn: null,
    frequency,
    times,
    firstDueChosen: true,
    fallenDosesAnswer: 'unasked',
    stoppedOn: null,
    createdAt: '',
  }
  await replay.start({ input: { settings: [setting], lines: [], today } } as unknown as V2Walk, id)
  const reading = async () =>
    readTreatment(await storedTreatment(replay.treatments, id), replay.clock.day)!
  const settingOn = async (dueOn: string, dueTime: Hour) => {
    const slot = (await reading()).view
      .slots(dueOn, dueOn)
      .find(({ due }) => due.dueTime === dueTime)
    return slot!.due.settingId
  }
  return {
    day(on: string) {
      replay.clock.day = on
    },
    async give(dueOn: string, dueTime: Hour) {
      replay.tick()
      const due = { settingId: await settingOn(dueOn, dueTime), dueOn, dueTime }
      await replay.doses.apply(id, {
        kind: 'note',
        gesture: { kind: 'note', due, status: 'given', givenOn: dueOn, shiftsFollowing: false },
      })
    },
    async move(dueOn: string, dueTime: Hour, to: string, shiftsFollowing = false) {
      replay.tick()
      const due = { settingId: await settingOn(dueOn, dueTime), dueOn, dueTime }
      await replay.doses.apply(id, { kind: 'move', due, to, shiftsFollowing })
    },
    async modify(rhythm: Frequency, times: string[], nextDoseOn: string | null = null) {
      replay.tick()
      await replay.plans.update(id, {
        ...ASKED,
        frequency: rhythm,
        times,
        endsOn: null,
        nextDoseOn,
      })
    },
    async slots(from: string, to: string) {
      return (await reading()).view
        .slots(from, to)
        .map(({ due: { dueOn, dueTime }, state }) => `${dueOn} ${dueTime ?? '-'} ${state}`)
    },
  }
}

describe('Le report qui part du jour où un réglage cède la place, par les vrais services', () => {
  // #928 (graine 8800001778), R4, R7 : la journée d'arrivée garde les doses que le report a emportées.
  it.each([[[]], [['06:00']]])(
    'Milo, tous les 3 jours à 6 h et 18 h, la dose du 7 reportée au 8, puis tous les 2 jours sans heure ; le 8, la dose de 18 h reportée au 9, puis tous les 3 jours, heures %j : le 9 garde 18 h et la dose sans heure',
    async (times: string[]) => {
      const milo = await carnet('2026-04-01', EVERY_3_DAYS, ['06:00', '18:00'], '2026-04-06')
      await milo.move('2026-04-07', '06:00', '2026-04-08')
      await milo.modify(EVERY_2_DAYS, [], '2026-04-06')
      milo.day('2026-04-08')
      await milo.give('2026-04-08', '06:00')
      await milo.move('2026-04-08', '18:00', '2026-04-09')
      const arrived = ['2026-04-09 - pending', '2026-04-09 18:00 pending']
      expect(await milo.slots('2026-04-09', '2026-04-09')).toEqual(arrived)
      await milo.modify(EVERY_3_DAYS, times)
      expect(await milo.slots('2026-04-09', '2026-04-09')).toEqual(arrived)
    },
  )
})
