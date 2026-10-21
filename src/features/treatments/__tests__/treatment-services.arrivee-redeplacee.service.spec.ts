// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { V2Walk } from '../../../../scripts/dose-engine/v2-walk'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import type { Frequency, Hour } from '@/shared/domain/dose-calendar'
import { readTreatment } from '@/shared/domain/treatment-reading'
import { createReplay, storedTreatment, type Replay } from './treatment-services-replay'

const WEEKLY: Frequency = { value: 1, unit: 'week' }
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

async function carnet(first: string, times: string[], today: string) {
  const id = crypto.randomUUID()
  const setting = {
    id: 's1',
    startsOn: first,
    firstDueOn: first,
    gridOriginOn: first,
    endsOn: null,
    frequency: WEEKLY,
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
    async move(dueOn: string, dueTime: Hour, to: string) {
      replay.tick()
      const due = { settingId: await settingOn(dueOn, dueTime), dueOn, dueTime }
      await replay.doses.apply(id, { kind: 'move', due, to, shiftsFollowing: true })
    },
    async modify(times: string[], nextDoseOn: string) {
      replay.tick()
      await replay.plans.update(id, {
        ...ASKED,
        frequency: WEEKLY,
        times,
        endsOn: null,
        nextDoseOn,
      })
    },
    async days(from: string, to: string) {
      const byDay = new Map<string, string[]>()
      for (const { due } of (await reading()).view.slots(from, to)) {
        byDay.set(due.dueOn, [...(byDay.get(due.dueOn) ?? []), due.dueTime ?? '-'])
      }
      return [...byDay].map(([day, hours]) => `${day} ${hours.join(' ')}`)
    },
  }
}

const AFTER = [
  '2026-03-21 08:00 14:00 20:00',
  '2026-03-28 08:00 14:00 20:00',
  '2026-04-04 08:00 14:00 20:00',
  '2026-04-11 08:00 14:00 20:00',
]

async function miloTurnedOn12th() {
  const milo = await carnet('2026-03-05', ['08:00', '20:00'], '2026-03-08')
  await milo.move('2026-03-05', '08:00', '2026-03-16')
  await milo.modify(['08:00', '14:00', '20:00'], '2026-04-06')
  await milo.move('2026-04-06', '08:00', '2026-03-12')
  expect(await milo.days('2026-03-09', '2026-04-10')).toEqual([
    '2026-03-12 08:00 14:00 20:00',
    '2026-03-19 08:00 14:00 20:00',
    '2026-03-26 08:00 14:00 20:00',
    '2026-04-02 08:00 14:00 20:00',
    '2026-04-09 08:00 14:00 20:00',
  ])
  return milo
}

describe('Redéplacer une dose depuis l’arrivée d’un décalage, par les vrais services', () => {
  const story =
    'Milo, chaque jeudi à 8 h et 20 h depuis le 5 mars ; le 8, la dose du 5 reportée au 16 avec la case, puis 8, 14 et 20 h avec prochaine dose le 6 avril, puis la dose du 6 avril avancée au 12 mars avec la case'

  // #989, R7 : l'arrivée redéplacée est une journée propre, le nouveau décalage repart du nouveau jour.
  it(`${story} ; la dose de 14 h du 12 reportée au 14 avec la case : le 12 garde 8 h, le 14 à 14 et 20 h, puis chaque samedi`, async () => {
    const milo = await miloTurnedOn12th()
    await milo.move('2026-03-12', '14:00', '2026-03-14')
    expect(await milo.days('2026-03-09', '2026-04-12')).toEqual([
      '2026-03-12 08:00',
      '2026-03-14 14:00 20:00',
      ...AFTER,
    ])
  })

  // #1000, R7 : redéplacée elle-même, la dose du report emmène l'arrivée, et son décalage repart du nouveau jour.
  it(`${story} ; la dose de 8 h du 12 reportée au 14 avec la case : le 14 à 8, 14 et 20 h, puis chaque samedi`, async () => {
    const milo = await miloTurnedOn12th()
    await milo.move('2026-03-12', '08:00', '2026-03-14')
    expect(await milo.days('2026-03-09', '2026-04-12')).toEqual([
      '2026-03-14 08:00 14:00 20:00',
      ...AFTER,
    ])
  })
})
