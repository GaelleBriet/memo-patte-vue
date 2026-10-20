// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { V2Walk } from '../../../../scripts/dose-engine/v2-walk'
import { createReplay, storedTreatment, type Replay } from './treatment-services-replay'
import { GestureRefusedError } from '../logic/treatment-dose-change'
import { dateChangeOf } from '../logic/treatment-line-actions'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import i18n from '@/core/i18n'
import type { Frequency, Hour } from '@/shared/domain/dose-calendar'
import { plusDays } from '@/shared/domain/dose-calendar/grid'
import { readTreatment } from '@/shared/domain/treatment-reading'

const t = i18n.global.t
const DAY: Frequency = { value: 1, unit: 'day' }
const THREE_DAYS: Frequency = { value: 3, unit: 'day' }
const HOURS = ['08:00', '20:00']
const TODAY = '2026-10-20'

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

// Milo, Métacam à 8 h et 20 h depuis le 1er octobre, chaque prise donnée à l'heure jusqu'au 19.
async function milo(frequency: Frequency = DAY) {
  const id = crypto.randomUUID()
  const setting = {
    id: 's1',
    startsOn: '2026-10-01',
    firstDueOn: '2026-10-01',
    gridOriginOn: '2026-10-01',
    endsOn: null,
    frequency,
    times: HOURS,
    firstDueChosen: true,
    fallenDosesAnswer: 'unasked',
    stoppedOn: null,
    createdAt: '',
  }
  const walk = { input: { settings: [setting], lines: [], today: TODAY } }
  await replay.start(walk as unknown as V2Walk, id)
  const stored = () => storedTreatment(replay.treatments, id)
  const periodId = (await stored()).periods[0]!.id
  for (let day = '2026-10-01'; day < TODAY; day = plusDays(day, frequency.value)) {
    for (const dueTime of HOURS as Hour[]) {
      replay.tick()
      await replay.doses.apply(id, {
        kind: 'note',
        gesture: {
          kind: 'note',
          due: { settingId: periodId, dueOn: day, dueTime },
          status: 'given',
          givenOn: day,
          shiftsFollowing: false,
        },
      })
    }
  }
  const prise = async (dueOn: string, dueTime: string) =>
    (await stored()).doses.find(
      (dose) => dose.status === 'given' && dose.dueOn === dueOn && dose.dueTime === dueTime,
    )!
  return {
    stored,
    prise,
    periodId,
    async redate(dueOn: string, dueTime: string, givenOn: string) {
      const line = await prise(dueOn, dueTime)
      replay.tick()
      await replay.doses.apply(id, {
        kind: 'redate',
        lineId: line.id,
        givenOn,
        shiftsFollowing: false,
      })
    },
    async view() {
      return readTreatment(await stored(), TODAY)!.view
    },
  }
}

describe('#1004 : TR-24 bis vaut aussi à plusieurs heures (décision du 20 octobre 2026)', () => {
  it('Milo, tous les jours à 8 h et 20 h : la prise du 19 oct. à 20 h ne descend pas au 18, grisé et refusé', async () => {
    const carnet = await milo()
    expect((await carnet.stored()).doses.filter(({ status }) => status === 'given')).toHaveLength(
      38,
    )
    const line = await carnet.prise('2026-10-19', '20:00')
    const change = dateChangeOf(t, line, null, {
      today: TODAY,
      earliest: null,
      view: await carnet.view(),
    })
    expect(change?.min).toBe('2026-10-19')

    await expect(carnet.redate('2026-10-19', '20:00', '2026-10-18')).rejects.toThrow(
      GestureRefusedError,
    )
    expect((await carnet.prise('2026-10-19', '20:00')).givenOn).toBe('2026-10-19')
  })

  it('tous les 3 jours : le 17, à moins d’un intervalle, couvre encore la dose du 19 à 20 h (R5) ; le 16 est refusé', async () => {
    const carnet = await milo(THREE_DAYS)
    const line = await carnet.prise('2026-10-19', '20:00')
    const change = dateChangeOf(t, line, null, {
      today: TODAY,
      earliest: null,
      view: await carnet.view(),
    })
    expect(change?.min).toBe('2026-10-17')

    await expect(carnet.redate('2026-10-19', '20:00', '2026-10-16')).rejects.toThrow(
      GestureRefusedError,
    )
    await carnet.redate('2026-10-19', '20:00', '2026-10-17')
    expect((await carnet.prise('2026-10-19', '20:00')).givenOn).toBe('2026-10-17')
    const slots = (await carnet.view()).slots('2026-10-19', '2026-10-19')
    expect(slots.map(({ due, state }) => `${due.dueTime} ${state}`)).toEqual([
      '08:00 given',
      '20:00 given',
    ])
  })
})
