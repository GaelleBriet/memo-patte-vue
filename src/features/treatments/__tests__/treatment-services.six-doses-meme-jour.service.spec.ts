// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { V2Walk } from '../../../../scripts/dose-engine/v2-walk'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import type { Frequency, Hour } from '@/shared/domain/dose-calendar'
import { readTreatment } from '@/shared/domain/treatment-reading'
import { createReplay, storedTreatment, type Replay } from './treatment-services-replay'

const QUARTER: Frequency = { value: 3, unit: 'month' }
const ASKED = { name: 'Test', type: 'medication', doseQuantity: null, doseUnit: null } as const
const END = '2026-05-02'

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

async function carnet(first: string, times: string[]) {
  const id = crypto.randomUUID()
  const setting = {
    id: 's1',
    startsOn: first,
    firstDueOn: first,
    gridOriginOn: first,
    endsOn: END,
    frequency: QUARTER,
    times,
    firstDueChosen: true,
    fallenDosesAnswer: 'unasked',
    stoppedOn: null,
    createdAt: '',
  }
  await replay.start(
    { input: { settings: [setting], lines: [], today: first } } as unknown as V2Walk,
    id,
  )
  const stored = () => storedTreatment(replay.treatments, id)
  const settingOn = async (dueOn: string, dueTime: Hour) => {
    const reading = readTreatment(await stored(), replay.clock.day)!
    const slot = reading.view.slots(dueOn, dueOn).find(({ due }) => due.dueTime === dueTime)
    return slot!.due.settingId
  }
  return {
    day(on: string) {
      replay.clock.day = on
    },
    async move(dueOn: string, dueTime: Hour, to: string, shiftsFollowing = true) {
      replay.tick()
      const settingId = await settingOn(dueOn, dueTime)
      await replay.doses.apply(id, {
        kind: 'move',
        due: { settingId, dueOn, dueTime },
        to,
        shiftsFollowing,
      })
    },
    async removeShiftOf(dueOn: string) {
      const shift = (await stored()).doses.find(
        (dose) => dose.status === 'shift' && dose.dueOn === dueOn,
      )!
      replay.tick()
      await replay.doses.apply(id, { kind: 'remove', lineId: shift.id })
    },
    async give(dueOn: string, dueTime: Hour) {
      replay.tick()
      const settingId = await settingOn(dueOn, dueTime)
      await replay.doses.apply(id, {
        kind: 'note',
        gesture: {
          kind: 'note',
          due: { settingId, dueOn, dueTime },
          status: 'given',
          givenOn: replay.clock.day,
          shiftsFollowing: false,
        },
      })
    },
    async modify(times: string[], nextDoseOn: string | null) {
      replay.tick()
      await replay.plans.update(id, {
        ...ASKED,
        frequency: QUARTER,
        times,
        endsOn: END,
        nextDoseOn,
      })
    },
    async slots(from: string, to: string) {
      const reading = readTreatment(await stored(), replay.clock.day)!
      return reading.view
        .slots(from, to)
        .map(({ due: { dueOn, dueTime }, state }) => `${dueOn} ${dueTime ?? '-'} ${state}`)
    },
  }
}

describe('Le jour du changement d’heures, après un report ramené par « Prochaine dose »', () => {
  it('Milo, tous les 3 mois à 20 h ; 15 mars reportée au 19 avril avec la case, puis 8 h, 14 h et 20 h, « Prochaine dose » le 20 mars, 8 h donnée, puis 6 h, 12 h, 18 h et 23 h : pas de dose de trop le 20 (graine 7500002977)', async () => {
    const milo = await carnet('2026-03-15', ['20:00'])
    milo.day('2026-03-16')
    await milo.move('2026-03-15', '20:00', '2026-04-19')
    await milo.modify(['08:00', '14:00', '20:00'], null)
    milo.day('2026-03-20')
    await milo.modify(['08:00', '14:00', '20:00'], '2026-03-20')
    await milo.give('2026-03-20', '08:00')

    await milo.modify(['06:00', '12:00', '18:00', '23:00'], null)

    expect(await milo.slots('2026-03-20', '2026-03-20')).toEqual([
      '2026-03-20 06:00 covered',
      '2026-03-20 12:00 pending',
      '2026-03-20 18:00 pending',
      '2026-03-20 23:00 pending',
    ])
  })

  it('Milo, tous les 3 mois à 20 h ; 15 mars reportée au 19 avril avec la case, puis 8 h, 14 h et 20 h ; le 20, « Prochaine dose » le 20, puis 6 h, 12 h, 18 h et 23 h : le 20 à ces quatre heures seulement', async () => {
    const milo = await carnet('2026-03-15', ['20:00'])
    milo.day('2026-03-16')
    await milo.move('2026-03-15', '20:00', '2026-04-19')
    await milo.modify(['08:00', '14:00', '20:00'], null)
    milo.day('2026-03-20')
    await milo.modify(['08:00', '14:00', '20:00'], '2026-03-20')

    await milo.modify(['06:00', '12:00', '18:00', '23:00'], null)

    expect(await milo.slots('2026-03-19', '2026-03-21')).toEqual([
      '2026-03-20 06:00 pending',
      '2026-03-20 12:00 pending',
      '2026-03-20 18:00 pending',
      '2026-03-20 23:00 pending',
    ])
  })

  it('la suite de la graine : le décalage du 15 supprimé, 12 h du 20 reportée au 2 avril et donnée, puis une minute plus tard : le 2 avril garde 12 h, 18 h et 23 h', async () => {
    const milo = await carnet('2026-03-15', ['20:00'])
    milo.day('2026-03-16')
    await milo.move('2026-03-15', '20:00', '2026-04-19')
    await milo.modify(['08:00', '14:00', '20:00'], null)
    milo.day('2026-03-20')
    await milo.modify(['08:00', '14:00', '20:00'], '2026-03-20')
    await milo.give('2026-03-20', '08:00')
    await milo.modify(['06:00', '12:00', '18:00', '23:00'], null)
    await milo.removeShiftOf('2026-03-15')
    await milo.move('2026-03-20', '12:00', '2026-04-02', false)
    await milo.give('2026-04-02', '12:00')

    await milo.modify(['06:01', '12:01', '18:01', '23:01'], null)

    expect(await milo.slots('2026-04-02', '2026-04-02')).toEqual([
      '2026-04-02 12:00 given',
      '2026-04-02 18:00 pending',
      '2026-04-02 23:00 pending',
    ])
  })
})
