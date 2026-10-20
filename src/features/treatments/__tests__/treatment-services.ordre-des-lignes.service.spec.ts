// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { V2Walk } from '../../../../scripts/dose-engine/v2-walk'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import type { Frequency, Hour } from '@/shared/domain/dose-calendar'
import { readTreatment } from '@/shared/domain/treatment-reading'
import { createReplay, storedTreatment, type Replay } from './treatment-services-replay'

const EVERY_3_DAYS: Frequency = { value: 3, unit: 'day' }

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
    endsOn: null,
    frequency: EVERY_3_DAYS,
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
  const reading = async () => readTreatment(await stored(), replay.clock.day)!.view
  return {
    day(on: string) {
      replay.clock.day = on
    },
    async give(dueOn: string, dueTime: Hour) {
      replay.tick()
      const settingId = (await reading())
        .slots(dueOn, dueOn)
        .find(({ due }) => due.dueTime === dueTime)!.due.settingId
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
    async stop() {
      replay.tick()
      await replay.stops.stop(id)
    },
    async resume(firstDoseOn: string, hours: string[]) {
      replay.tick()
      await replay.plans.resume(id, {
        firstDoseOn,
        frequency: EVERY_3_DAYS,
        times: hours,
        doseQuantity: null,
        doseUnit: null,
        endsOn: null,
      })
    },
    async removeThenUndo(dueOn: string, dueTime: Hour) {
      const line = (await stored()).doses.find(
        (dose) => dose.status === 'given' && dose.dueOn === dueOn && dose.dueTime === dueTime,
      )!
      replay.tick()
      const { undo } = await replay.doses.apply(id, { kind: 'remove', lineId: line.id })
      replay.tick()
      await replay.doses.undoBatch(id, undo)
    },
    async history(dueOn: string) {
      return (await reading()).history
        .filter(({ line }) => line.dueOn === dueOn)
        .map(({ line, effect }) =>
          effect.kind === 'covers'
            ? `${line.dueTime} couvre ${effect.key.slice(11)}`
            : `${line.dueTime} ${effect.kind}`,
        )
    },
  }
}

describe('R12 : une même base, une seule lecture, quel que soit l’ordre de ses lignes', () => {
  it('Milo, tous les 3 jours à 8 h et 20 h ; les deux doses du 11 avril données le 9, arrêt le 9, reprise le 11 à 6, 12, 18 et 23 h ; « Supprimer » puis « Annuler » sur la prise de 8 h : l’historique ne change pas (graine 7300000099)', async () => {
    const milo = await carnet('2026-04-05', ['08:00', '20:00'])
    milo.day('2026-04-09')
    await milo.give('2026-04-11', '08:00')
    await milo.give('2026-04-11', '20:00')
    await milo.stop()
    milo.day('2026-04-11')
    await milo.resume('2026-04-11', ['06:00', '12:00', '18:00', '23:00'])

    expect(await milo.history('2026-04-11')).toEqual(['08:00 couvre 06:00', '20:00 couvre 23:00'])

    await milo.removeThenUndo('2026-04-11', '08:00')

    expect(await milo.history('2026-04-11')).toEqual(['08:00 couvre 06:00', '20:00 couvre 23:00'])
  })
})
