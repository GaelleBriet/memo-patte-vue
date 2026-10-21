// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { V2Walk } from '../../../../scripts/dose-engine/v2-walk'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import type { Frequency, Hour } from '@/shared/domain/dose-calendar'
import { readTreatment } from '@/shared/domain/treatment-reading'
import { createReplay, storedTreatment, type Replay } from './treatment-services-replay'

const DAILY: Frequency = { value: 1, unit: 'day' }
const FOUR_TIMES = ['06:00', '12:00', '18:00', '23:00']
const ASKED = { name: 'Test', type: 'medication', doseUnit: 'ml' } as const

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

async function carnet(first: string, today: string) {
  const id = crypto.randomUUID()
  const setting = {
    id: 's1',
    startsOn: first,
    firstDueOn: first,
    gridOriginOn: first,
    endsOn: null,
    frequency: DAILY,
    times: FOUR_TIMES,
    firstDueChosen: true,
    fallenDosesAnswer: 'unasked',
    stoppedOn: null,
    createdAt: '',
  }
  await replay.start({ input: { settings: [setting], lines: [], today } } as unknown as V2Walk, id)
  replay.clock.day = today
  const reading = async () =>
    readTreatment(await storedTreatment(replay.treatments, id), replay.clock.day)!
  const settingOn = async (dueOn: string, dueTime: Hour) => {
    const slot = (await reading()).view
      .slots(dueOn, dueOn)
      .find(({ due }) => due.dueTime === dueTime)
    return slot!.due.settingId
  }
  return {
    async give(dueOn: string, dueTime: Hour, givenOn: string) {
      replay.tick()
      const due = { settingId: await settingOn(dueOn, dueTime), dueOn, dueTime }
      await replay.doses.apply(id, {
        kind: 'note',
        gesture: { kind: 'note', due, status: 'given', givenOn, shiftsFollowing: true },
      })
    },
    async move(dueOn: string, dueTime: Hour, to: string) {
      replay.tick()
      const due = { settingId: await settingOn(dueOn, dueTime), dueOn, dueTime }
      await replay.doses.apply(id, { kind: 'move', due, to, shiftsFollowing: true })
    },
    async dose(doseQuantity: number) {
      replay.tick()
      await replay.plans.update(id, {
        ...ASKED,
        doseQuantity,
        frequency: DAILY,
        times: FOUR_TIMES,
        endsOn: null,
        nextDoseOn: null,
      })
    },
    async slots(from: string, to: string) {
      return (await reading()).view
        .slots(from, to)
        .map(({ due: { dueOn, dueTime }, state }) => `${dueOn} ${dueTime ?? '-'} ${state}`)
    },
  }
}

describe('« Modifier » la posologie après deux reports avec la case, par les vrais services', () => {
  // #998 (graine 12200000123), R1, R3 : une posologie changée ne change aucune échéance.
  it('Milo, chaque jour à 6 h, 12 h, 18 h et 23 h dès le 3 avril ; le 2, la dose du 3 à 23 h donnée d’avance, posologie passée à 1 ml, la dose du 3 à 6 h reportée au 13 avec la case, celle du 13 à 12 h donnée, celle du 13 à 6 h reportée au 23 avec la case, puis posologie passée à 2 ml : le 23 ne gagne pas de dose à 23 h', async () => {
    const milo = await carnet('2026-04-03', '2026-04-02')
    await milo.give('2026-04-03', '23:00', '2026-04-02')
    await milo.dose(1)
    await milo.move('2026-04-03', '06:00', '2026-04-13')
    await milo.give('2026-04-13', '12:00', '2026-04-01')
    await milo.move('2026-04-13', '06:00', '2026-04-23')
    const shown = await milo.slots('2026-04-23', '2026-04-24')
    expect(shown.filter((slot) => slot.startsWith('2026-04-23'))).not.toContain(
      '2026-04-23 23:00 pending',
    )
    await milo.dose(2)
    expect(await milo.slots('2026-04-23', '2026-04-24')).toEqual(shown)
  })
})
