// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { V2Walk } from '../../../../scripts/dose-engine/v2-walk'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import type { Frequency, Hour } from '@/shared/domain/dose-calendar'
import { readTreatment } from '@/shared/domain/treatment-reading'
import { createReplay, storedTreatment, type Replay } from './treatment-services-replay'

const EVERY_3_DAYS: Frequency = { value: 3, unit: 'day' }
const TWO_TABLETS = {
  name: 'Test',
  type: 'medication',
  doseQuantity: 2,
  doseUnit: 'tablet',
} as const

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

async function luna() {
  const id = crypto.randomUUID()
  const setting = {
    id: 's1',
    startsOn: '2026-04-10',
    firstDueOn: '2026-04-12',
    gridOriginOn: '2026-04-12',
    endsOn: null,
    frequency: EVERY_3_DAYS,
    times: [],
    firstDueChosen: true,
    fallenDosesAnswer: 'unasked',
    stoppedOn: null,
    createdAt: '',
  }
  const walk = { input: { settings: [setting], lines: [], today: '2026-04-11' } }
  await replay.start(walk as unknown as V2Walk, id)
  const reading = async () =>
    readTreatment(await storedTreatment(replay.treatments, id), replay.clock.day)!
  const settingOn = async (dueOn: string, dueTime: Hour) => {
    const slot = (await reading()).view
      .slots(dueOn, dueOn)
      .find(({ due }) => due.dueTime === dueTime)
    return slot!.due.settingId
  }
  return {
    on(day: string) {
      replay.clock.day = day
    },
    async move(dueOn: string, to: string, shiftsFollowing: boolean) {
      replay.tick()
      const due = { settingId: await settingOn(dueOn, null), dueOn, dueTime: null }
      await replay.doses.apply(id, { kind: 'move', due, to, shiftsFollowing })
    },
    async modify(times: string[], nextDoseOn: string | null) {
      replay.tick()
      await replay.plans.update(id, {
        ...TWO_TABLETS,
        frequency: EVERY_3_DAYS,
        times,
        endsOn: null,
        reminderOffsetMinutes: null,
        reminderTime: null,
        nextDoseOn,
      })
    },
    async days(from: string, to: string) {
      return (await reading()).view
        .slots(from, to)
        .map(({ due }) => `${due.dueOn} ${due.dueTime ?? '-'}`)
    },
  }
}

describe('Une heure ajoutée garde la dose arrivée par un report redéplacé depuis la date choisie (R4, R7)', () => {
  // #992, graine 120000798.
  it('Luna, tous les 3 jours sans heure dès le 12 avril ; le 11, la dose du 12 reportée au 18 avec la case, puis deux comprimés et « Prochaine dose » le 3 mai ; le 17, la dose du 3 mai reportée au 18 sans la case, puis 6 h ajoutée : le 18 garde sa dose sans heure', async () => {
    const carnet = await luna()
    await carnet.move('2026-04-12', '2026-04-18', true)
    await carnet.modify([], '2026-05-03')
    carnet.on('2026-04-17')
    await carnet.move('2026-05-03', '2026-04-18', false)
    expect(await carnet.days('2026-04-17', '2026-04-20')).toEqual(['2026-04-18 -'])

    await carnet.modify(['06:00'], null)

    expect(await carnet.days('2026-04-17', '2026-04-20')).toEqual(['2026-04-18 -'])
  })
})
