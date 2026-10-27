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
  const settingOn = async (dueOn: string, dueTime: Hour) => {
    const reading = readTreatment(await stored(), replay.clock.day)!
    const slot = reading.view.slots(dueOn, dueOn).find(({ due }) => due.dueTime === dueTime)
    return slot?.due.settingId ?? (await latestPeriod())
  }
  const note = async (
    dueOn: string,
    dueTime: Hour,
    status: 'given' | 'missed',
    givenOn: string,
    shiftsFollowing: boolean,
  ) => {
    replay.tick()
    const settingId = await settingOn(dueOn, dueTime)
    await replay.doses.apply(id, {
      kind: 'note',
      gesture: {
        kind: 'note',
        due: { settingId, dueOn, dueTime },
        status,
        givenOn,
        shiftsFollowing,
      },
    })
  }
  return {
    day(on: string) {
      replay.clock.day = on
    },
    async move(dueOn: string, dueTime: Hour, to: string, shiftsFollowing: boolean) {
      replay.tick()
      const settingId = await settingOn(dueOn, dueTime)
      await replay.doses.apply(id, {
        kind: 'move',
        due: { settingId, dueOn, dueTime },
        to,
        shiftsFollowing,
      })
    },
    give: (dueOn: string, dueTime: Hour, givenOn: string, shiftsFollowing: boolean) =>
      note(dueOn, dueTime, 'given', givenOn, shiftsFollowing),
    miss: (dueOn: string, dueTime: Hour) => note(dueOn, dueTime, 'missed', dueOn, false),
    async modify(times: string[], nextDoseOn: string | null, end: string | null = null) {
      replay.tick()
      await replay.plans.update(id, { ...ASKED, frequency, times, endsOn: end, nextDoseOn })
    },
    async modifyAs(rhythm: Frequency, times: string[], nextDoseOn: string | null) {
      replay.tick()
      await replay.plans.update(id, {
        ...ASKED,
        frequency: rhythm,
        times,
        endsOn: null,
        nextDoseOn,
      })
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

  // R6, R7 : #988 fermé, conforme.
  it('Luna, chaque semaine sans heure ; le décalage du 13 avril supprimé : 20 avril, 1er mai, 8 mai', async () => {
    const luna = await carnet('2026-04-16', WEEK, [], '2026-04-11', '2026-05-10')
    await luna.modify([], '2026-04-13', '2026-05-10')
    luna.day('2026-04-17')
    await luna.give('2026-04-13', null, '2026-04-17', true)
    luna.day('2026-04-21')
    await luna.move('2026-04-24', null, '2026-05-01', true)
    await luna.removeShiftOf('2026-04-13')
    expect(await luna.slots('2026-04-14', '2026-05-10')).toEqual([
      '2026-04-20 - pending',
      '2026-05-01 - pending',
      '2026-05-08 - pending',
    ])
  })

  // Q-a, R7 : la dose touchée part avec les heures suivantes de sa journée ; la case ne gouverne que
  // les journées suivantes.
  it.each([
    ['20:00', ['2026-03-20 20:00', '2026-03-25 08:00', '2026-03-26 08:00']],
    ['08:00', ['2026-03-20 08:00', '2026-03-20 20:00', '2026-03-26 08:00']],
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

  it('Luna, tous les 3 jours à 8 h et 20 h ; la dose de 20 h du 10 mars reportée au 12 sans la case : le 10 garde 8 h, le 12 reçoit 20 h', async () => {
    const luna = await carnet(
      '2026-03-10',
      { value: 3, unit: 'day' },
      ['08:00', '20:00'],
      '2026-03-10',
    )
    await luna.move('2026-03-10', '20:00', '2026-03-12', false)
    expect(await luna.slots('2026-03-10', '2026-03-13')).toEqual([
      '2026-03-10 08:00 pending',
      '2026-03-12 20:00 pending',
      '2026-03-13 08:00 pending',
      '2026-03-13 20:00 pending',
    ])
  })

  // I1, R7 : avec la case, le décalage écrit après la date choisie avancée repart de son arrivée.
  it('Milo, I1 puis 8 h du 12 mars donnée d’avance ; la dose de 14 h du 12 reportée au 14 avec la case : 14 mars, puis 21 et 28 mars, 4 avril', async () => {
    const milo = await carnet('2026-03-05', WEEK, ['08:00', '20:00'], '2026-03-08')
    await milo.move('2026-03-05', '08:00', '2026-03-16', true)
    await milo.modify(['08:00', '14:00', '20:00'], '2026-04-06')
    await milo.move('2026-04-06', '08:00', '2026-03-12', true)
    await milo.give('2026-03-12', '08:00', '2026-03-08', false)
    await milo.move('2026-03-12', '14:00', '2026-03-14', true)
    expect(await milo.slots('2026-03-12', '2026-04-04')).toEqual([
      '2026-03-12 08:00 given',
      '2026-03-14 14:00 pending',
      '2026-03-14 20:00 pending',
      '2026-03-21 08:00 pending',
      '2026-03-21 14:00 pending',
      '2026-03-21 20:00 pending',
      '2026-03-28 08:00 pending',
      '2026-03-28 14:00 pending',
      '2026-03-28 20:00 pending',
      '2026-04-04 08:00 pending',
      '2026-04-04 14:00 pending',
      '2026-04-04 20:00 pending',
    ])
  })

  // R4, R7 : un report emporte ses heures telles qu'elles étaient quand il a été écrit ; ses prises
  // gardent leur journée quand les heures changent ensuite.
  it('Milo, chaque mois à 20 h ; le 2 avril à 6, 12, 18 et 23 h ; 23 h reportée au 26 ; « Modifier » : 12, 18 et 23 h : le 26 garde 23 h, le 2 ses trois prises', async () => {
    const MONTH: Frequency = { value: 1, unit: 'month' }
    const milo = await carnet('2026-03-20', MONTH, ['20:00'], '2026-03-24')
    await milo.move('2026-04-20', '20:00', '2026-04-04', true)
    await milo.miss('2026-03-20', '20:00')
    await milo.modify(['06:00', '12:00', '18:00', '23:00'], '2026-06-04')
    await milo.move('2026-06-04', '06:00', '2026-04-02', true)
    for (const hour of ['06:00', '12:00', '18:00']) {
      await milo.give('2026-04-02', hour, '2026-03-24', false)
    }
    await milo.move('2026-04-02', '23:00', '2026-04-26', false)
    await milo.modifyAs(MONTH, ['12:00', '18:00', '23:00'], null)
    expect(await milo.slots('2026-04-02', '2026-04-26')).toEqual([
      '2026-04-02 06:00 given',
      '2026-04-02 12:00 given',
      '2026-04-02 18:00 given',
      '2026-04-26 23:00 pending',
    ])
  })

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
