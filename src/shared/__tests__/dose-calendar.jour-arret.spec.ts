// @vitest-environment node
import { describe, expect, it } from 'vitest'

import type { Frequency, Line } from '../domain/dose-calendar/types'
import * as reference from './dose-calendar.reference.aides'
import { DAY, H, keys, line, setting, TWO_DAYS, view } from './dose-calendar.v2.aides'

const STOP = '2026-10-13'

const effectsOf = (read: ReturnType<typeof view>, lines: Line[]) =>
  lines.map((each) => read.history.find(({ line: read }) => read.id === each.id)!.effect)

describe('TR-30, #819 : les prises du jour de l’arrêt, données avant l’arrêt, restent comptées', () => {
  describe('« Test » tous les 2 jours à 8 h et 20 h dès le 13 oct. ; 13 et 15 donnés le 13 ; « Arrêter » le 13', () => {
    const test = setting('p1', STOP, TWO_DAYS, H, { stoppedOn: STOP })
    const ofDay13 = H.map((hour) => line('p1', 'given', STOP, hour))
    const ofDay15 = H.map((hour) => line('p1', 'given', '2026-10-15', hour))
    const read = view([test], [...ofDay13, ...ofDay15], STOP)

    it('les deux prises du 13 couvrent leurs doses', () => {
      expect(effectsOf(read, ofDay13)).toEqual([
        { kind: 'covers', key: '2026-10-13 08:00' },
        { kind: 'covers', key: '2026-10-13 20:00' },
      ])
    })

    it('les deux prises du 15, après l’arrêt, restent sans effet', () => {
      expect(effectsOf(read, ofDay15)).toEqual([
        { kind: 'idle', reason: 'nothing-to-cover' },
        { kind: 'idle', reason: 'nothing-to-cover' },
      ])
    })

    it('« Arrêté le 13 oct. », rien à renseigner', () => {
      expect([read.phase, read.finished, read.stoppedBeforeFirstDose, read.endedOn]).toEqual([
        'stopped',
        true,
        false,
        STOP,
      ])
      expect(read.unloggedDoses).toEqual([])
    })
  })

  it.each<[string, string, Frequency]>([
    ['ouvert le jour de l’arrêt, tous les 2 jours', STOP, TWO_DAYS],
    ['tous les jours depuis le 10', '2026-10-10', DAY],
    ['tous les 2 jours depuis le 11', '2026-10-11', TWO_DAYS],
  ])('%s : le jour de l’arrêt se lit de la même façon', (_, firstDueOn, frequency) => {
    const stopped = setting('p1', firstDueOn, frequency, H, { stoppedOn: STOP })
    const ofDay13 = H.map((hour) => line('p1', 'given', STOP, hour))
    expect(effectsOf(view([stopped], ofDay13, STOP), ofDay13)).toEqual([
      { kind: 'covers', key: '2026-10-13 08:00' },
      { kind: 'covers', key: '2026-10-13 20:00' },
    ])
  })

  it('tous les jours depuis le 10, 8 h du 13 donnée, arrêt le 13 : 20 h est retirée, pas à renseigner', () => {
    const daily = setting('p1', '2026-10-10', DAY, H, { stoppedOn: STOP })
    const before = ['2026-10-10', '2026-10-11', '2026-10-12'].flatMap((day) =>
      H.map((hour) => line('p1', 'given', day, hour)),
    )
    const morning = line('p1', 'given', STOP, '08:00')
    const read = view([daily], [...before, morning], STOP)
    expect(effectsOf(read, [morning])).toEqual([{ kind: 'covers', key: '2026-10-13 08:00' }])
    expect(read.dueState({ dueOn: STOP, dueTime: '20:00' })).toBe('removed')
    expect([read.finished, keys(read.unloggedDoses)]).toEqual([true, []])
  })

  describe('tous les 2 jours à 8 h dès le 10 ; dose du 12 reportée au 13 ; arrêt le 13', () => {
    const stopped = setting('p1', '2026-10-10', TWO_DAYS, ['08:00'], { stoppedOn: STOP })
    const first = line('p1', 'given', '2026-10-10', '08:00')
    const report = line('p1', 'postponed', '2026-10-12', '08:00', STOP)

    it('donnée le 13 avant l’arrêt : la prise couvre la dose arrivée, le report arrive le 13', () => {
      const given = line('p1', 'given', STOP, '08:00')
      const read = view([stopped], [first, report, given], STOP)
      expect(effectsOf(read, [report, given])).toEqual([
        { kind: 'moves', keys: ['2026-10-12 08:00'], arrival: STOP },
        { kind: 'covers', key: '2026-10-13 08:00' },
      ])
    })

    it('sans prise le 13 : la dose arrivée est retirée par l’arrêt, rien à renseigner', () => {
      const read = view([stopped], [first, report], STOP)
      expect([read.finished, keys(read.unloggedDoses)]).toEqual([true, []])
      expect(read.dueState({ dueOn: STOP, dueTime: '08:00' })).toBe('removed')
    })
  })

  it('ouvert le 13, première dose le 15, arrêté le 13 sans prise : « Arrêté avant la première prise »', () => {
    const later = setting('p1', '2026-10-15', TWO_DAYS, H, { startsOn: STOP, stoppedOn: STOP })
    const read = view([later], [], STOP)
    expect([read.stoppedBeforeFirstDose, read.endedOn]).toEqual([true, STOP])
  })

  it('modèle naïf, même carnet : arrêté, rien à renseigner ni à venir', () => {
    const test = reference.setting('p1', STOP, reference.TWO_DAYS, H, { stoppedOn: STOP })
    const lines = [STOP, '2026-10-15'].flatMap((day) =>
      H.map((hour) => reference.line('p1', 'given', day, hour)),
    )
    expect(reference.read([test], lines, STOP)).toEqual({
      phase: 'stopped',
      finished: true,
      current: [],
      unlogged: [],
      upcoming: [],
    })
  })
})
