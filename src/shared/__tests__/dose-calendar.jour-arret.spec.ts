// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { removalRefusal } from '../domain/dose-calendar'
import type { Frequency, Line } from '../domain/dose-calendar/types'
import * as reference from './dose-calendar.reference.aides'
import { DAY, H, keys, line, MONTH, setting, TWO_DAYS, view } from './dose-calendar.v2.aides'

const STOP = '2026-10-13'

const effectsOf = (read: ReturnType<typeof view>, lines: Line[]) =>
  lines.map((each) => read.history.find(({ line: read }) => read.id === each.id)!.effect)

describe('TR-30, #819 : les prises du jour de l’arrêt, données avant l’arrêt, restent comptées', () => {
  describe('« Test » tous les 2 jours à 8 h et 20 h dès le 13 oct. ; 13 et 15 donnés le 13 ; « Arrêter » le 13', () => {
    const test = setting('p1', STOP, TWO_DAYS, H, { stoppedOn: STOP })
    const ofDay13 = H.map((hour) => line('p1', 'given', STOP, hour))
    const ofDay15 = H.map((hour) => ({ ...line('p1', 'given', '2026-10-15', hour), givenOn: STOP }))
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

  it('graine 2001000538 : arrêté le 2 avr., repris le 2 à 8, 14 et 20 h, 20 h du 2 donnée de chaque côté, remplacé le 2 par une posologie dès le 3 : le 2 à 20 h n’est couvert qu’une fois', () => {
    const hours = ['08:00', '14:00', '20:00']
    const stopped = setting('p1', '2026-03-30', DAY, ['20:00'], { stoppedOn: '2026-04-02' })
    const resumed = setting('p2', '2026-04-02', DAY, hours)
    const replacing = setting('p3', '2026-04-03', DAY, hours, { startsOn: '2026-04-02' })
    const lines = [
      line('p1', 'given', '2026-04-02', '20:00'),
      line('p2', 'given', '2026-04-02', '20:00'),
    ]
    const read = view([stopped, resumed, replacing], lines, '2026-04-02')
    expect(effectsOf(read, lines).filter(({ kind }) => kind === 'covers')).toEqual([
      { kind: 'covers', key: '2026-04-02 20:00' },
    ])
  })

  it('#780 : toutes les 2 semaines à 20 h, dose du 13 avr. reportée au 14, toutes les 6 semaines dès le 14, arrêté le 14 : le report reste verrouillé', () => {
    const metacam = setting('m1', '2026-03-30', { value: 2, unit: 'week' }, ['20:00'])
    const report = line('m1', 'postponed', '2026-04-13', '20:00', '2026-04-14')
    const sixWeeks = setting('m2', '2026-04-14', { value: 6, unit: 'week' }, ['06:00', '20:00'], {
      startsOn: '2026-04-02',
    })
    const lines = [line('m1', 'given', '2026-03-30', '20:00'), report]
    const stopped = { ...sixWeeks, stoppedOn: '2026-04-14' }
    expect([
      removalRefusal({ settings: [metacam, sixWeeks], lines, today: '2026-04-14' }, report.id),
      removalRefusal({ settings: [metacam, stopped], lines, today: '2026-04-14' }, report.id),
    ]).toEqual([{ reason: 'not-movable' }, { reason: 'not-movable' }])
  })

  it('ouvert le 13, première dose le 15, arrêté le 13 sans prise : « Arrêté avant la première prise »', () => {
    const later = setting('p1', '2026-10-15', TWO_DAYS, H, { startsOn: STOP, stoppedOn: STOP })
    const read = view([later], [], STOP)
    expect([read.stoppedBeforeFirstDose, read.endedOn]).toEqual([true, STOP])
  })

  describe('mensuel sans heure, dose du 13 oct. donnée le 13, « Arrêter » le 13, « Reprendre »', () => {
    const monthly = setting('p1', '2026-09-13', MONTH, [], { stoppedOn: STOP })
    const given = line('p1', 'given', STOP)

    it.each<[string, string, string, Frequency]>([
      ['le 13, première dose le 13 nov.', STOP, '2026-11-13', MONTH],
      ['le 13, tous les jours dès le 14', STOP, '2026-10-14', DAY],
      ['le 14, première dose le 13 nov.', '2026-10-14', '2026-11-13', MONTH],
    ])('%s : la prise du 13 oct. couvre sa dose', (_, startsOn, firstDueOn, frequency) => {
      const resumed = setting('p2', firstDueOn, frequency, [], { startsOn })
      const read = view([monthly, resumed], [given], STOP)
      expect(effectsOf(read, [given])).toEqual([{ kind: 'covers', key: STOP }])
      expect(keys([read.nextDue!])).toEqual([firstDueOn])
    })
  })

  it('8 h, 14 h et 20 h du 8 données, arrêt le 8, reprise le 8, première dose le 9 : les trois prises couvrent leurs doses', () => {
    const hours = ['08:00', '14:00', '20:00']
    const stopped = setting('p1', '2026-10-05', DAY, hours, { stoppedOn: '2026-10-08' })
    const resumed = setting('p2', '2026-10-09', DAY, hours, { startsOn: '2026-10-08' })
    const ofDay8 = hours.map((hour) => line('p1', 'given', '2026-10-08', hour))
    expect(effectsOf(view([stopped, resumed], ofDay8, '2026-10-08'), ofDay8)).toEqual([
      { kind: 'covers', key: '2026-10-08 08:00' },
      { kind: 'covers', key: '2026-10-08 14:00' },
      { kind: 'covers', key: '2026-10-08 20:00' },
    ])
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

  it('modèle naïf, mensuel arrêté le 13 oct., dose du 13 donnée, repris le 13 avec première dose le 13 nov. : rien à renseigner', () => {
    const monthly = reference.setting('p1', '2026-09-13', reference.MONTH, [], { stoppedOn: STOP })
    const resumed = reference.setting('p2', '2026-11-13', reference.MONTH, [], { startsOn: STOP })
    const lines = ['2026-09-13', STOP].map((day) => reference.line('p1', 'given', day))
    expect(reference.read([monthly, resumed], lines, STOP)).toMatchObject({
      phase: 'upcoming',
      current: ['2026-11-13'],
      unlogged: [],
    })
  })
})
