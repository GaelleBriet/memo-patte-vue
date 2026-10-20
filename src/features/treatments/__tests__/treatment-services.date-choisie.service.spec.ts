// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { V2Walk } from '../../../../scripts/dose-engine/v2-walk'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import type { Frequency, Hour } from '@/shared/domain/dose-calendar'
import { readTreatment } from '@/shared/domain/treatment-reading'
import { createReplay, storedTreatment, type Replay } from './treatment-services-replay'

// Décisions du 20 octobre 2026 (session d'analyse du moteur) sur la date choisie, par les vrais
// services : « Modifier », « Prochaine dose », la case « Décaler aussi les doses suivantes ».

const DAY: Frequency = { value: 1, unit: 'day' }
const WEEK: Frequency = { value: 1, unit: 'week' }
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

async function carnet(
  first: string,
  frequency: Frequency,
  times: string[],
  today: string,
  endsOn: string | null = null,
) {
  const id = crypto.randomUUID()
  const setting = {
    id: 's1',
    startsOn: first,
    firstDueOn: first,
    gridOriginOn: first,
    endsOn,
    frequency,
    times,
    firstDueChosen: true,
    fallenDosesAnswer: 'unasked',
    stoppedOn: null,
    createdAt: '',
  }
  await replay.start({ input: { settings: [setting], lines: [], today } } as unknown as V2Walk, id)
  const stored = () => storedTreatment(replay.treatments, id)
  const latestPeriod = async () =>
    (await stored()).periods
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .at(-1)!.id
  return {
    day(on: string) {
      replay.clock.day = on
    },
    async move(dueOn: string, dueTime: Hour, to: string, shiftsFollowing: boolean) {
      replay.tick()
      const settingId = await latestPeriod()
      await replay.doses.apply(id, {
        kind: 'move',
        due: { settingId, dueOn, dueTime },
        to,
        shiftsFollowing,
      })
    },
    async give(dueOn: string, dueTime: Hour, givenOn: string, shiftsFollowing: boolean) {
      replay.tick()
      const settingId = await latestPeriod()
      await replay.doses.apply(id, {
        kind: 'note',
        gesture: {
          kind: 'note',
          due: { settingId, dueOn, dueTime },
          status: 'given',
          givenOn,
          shiftsFollowing,
        },
      })
    },
    async modify(times: string[], nextDoseOn: string | null, end: string | null = null) {
      replay.tick()
      await replay.plans.update(id, { ...ASKED, frequency, times, endsOn: end, nextDoseOn })
    },
    async removeShiftOf(dueOn: string) {
      const shift = (await stored()).doses.find(
        (dose) => dose.status === 'shift' && dose.dueOn === dueOn,
      )!
      replay.tick()
      await replay.doses.apply(id, { kind: 'remove', lineId: shift.id })
    },
    async slots(from: string, to: string) {
      const reading = readTreatment(await stored(), replay.clock.day)!
      return reading.view
        .slots(from, to)
        .map(({ due: { dueOn, dueTime }, state }) => `${dueOn} ${dueTime ?? '-'} ${state}`)
    },
    async upcoming(limit: number) {
      const reading = readTreatment(await stored(), replay.clock.day)!
      return reading.view
        .upcoming({ limit })
        .map(({ dueOn, dueTime }) => (dueTime === null ? dueOn : `${dueOn} ${dueTime}`))
    },
  }
}

describe('La date choisie, déplacée par les vrais services', () => {
  // G13, R9 : le report part d'un jour antérieur au réglage qui a choisi la date ; la série repart
  // quand même de l'arrivée, et l'ancienne date choisie disparaît.
  it('Milo, chaque jeudi à 8 h et 20 h ; la dose du 6 avril avancée au jeudi 12 mars avec la case : 12, 19, 26 mars…', async () => {
    const milo = await carnet('2026-03-05', WEEK, ['08:00', '20:00'], '2026-03-08')
    await milo.move('2026-03-05', '08:00', '2026-03-16', true)
    await milo.modify(['08:00', '14:00', '20:00'], '2026-04-06')
    await milo.move('2026-04-06', '08:00', '2026-03-12', true)
    expect(await milo.upcoming(13)).toEqual([
      '2026-03-12 08:00',
      '2026-03-12 14:00',
      '2026-03-12 20:00',
      '2026-03-19 08:00',
      '2026-03-19 14:00',
      '2026-03-19 20:00',
      '2026-03-26 08:00',
      '2026-03-26 14:00',
      '2026-03-26 20:00',
      '2026-04-02 08:00',
      '2026-04-02 14:00',
      '2026-04-02 20:00',
      '2026-04-09 08:00',
    ])
  })

  // I2, R6 : sur un seul téléphone, une réécriture plus ancienne que le report n'a pas pu lui ôter sa
  // journée ; la ligne de décalage supprimée, la grille revient.
  it('Luna, chaque semaine sans heure ; le décalage du 13 avril supprimé : 20 avril, 27 avril, 4 mai', async () => {
    const luna = await carnet('2026-04-16', WEEK, [], '2026-04-11', '2026-05-10')
    await luna.modify([], '2026-04-13', '2026-05-10')
    luna.day('2026-04-17')
    await luna.give('2026-04-13', null, '2026-04-17', true)
    luna.day('2026-04-21')
    await luna.move('2026-04-24', null, '2026-05-01', true)
    await luna.removeShiftOf('2026-04-13')
    expect(await luna.slots('2026-04-14', '2026-05-10')).toEqual([
      '2026-04-20 - pending',
      '2026-04-27 - pending',
      '2026-05-04 - pending',
    ])
  })

  // Q-a, Q-c : sans la case, le report déplace une seule dose, celle qu'on a touchée.
  it.each([
    ['20:00', ['2026-03-20 20:00', '2026-03-25 08:00', '2026-03-26 08:00']],
    ['08:00', ['2026-03-20 08:00', '2026-03-25 20:00', '2026-03-26 08:00']],
  ])(
    'Luna, chaque jour à 20 h, date choisie du 25 à 8 h et 20 h ; la dose de %s du 25 avancée au 20 sans la case',
    async (touched, expected) => {
      const luna = await carnet('2026-03-13', DAY, ['20:00'], '2026-03-15')
      await luna.move('2026-03-15', '20:00', '2026-03-18', true)
      await luna.modify(['08:00', '20:00'], '2026-03-25')
      await luna.move('2026-03-25', touched, '2026-03-20', false)
      expect(await luna.upcoming(3)).toEqual(expected)
    },
  )

  // Q-b : une heure écrite vide, dans un réglage qui a des heures, laisse la dose à l'heure de son rang.
  it('Milo, chaque jour sans heure ; date choisie du 20 à 8 h et 20 h, reculée au 28 avec la case : 28 et 29 mars à 8 h et 20 h', async () => {
    const milo = await carnet('2026-03-16', DAY, [], '2026-03-16')
    await milo.move('2026-03-16', null, '2026-03-28', true)
    await milo.modify(['08:00', '20:00'], '2026-03-20', '2026-03-29')
    await milo.move('2026-03-20', '08:00', '2026-03-28', true)
    expect(await milo.upcoming(5)).toEqual([
      '2026-03-28 08:00',
      '2026-03-28 20:00',
      '2026-03-29 08:00',
      '2026-03-29 20:00',
    ])
  })
})
