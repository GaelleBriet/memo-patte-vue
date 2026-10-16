// @vitest-environment node
import { describe, expect, it } from 'vitest'

import type { Line, Setting } from '../domain/dose-calendar/types'
import {
  DAY,
  H,
  keys,
  line,
  MONTH,
  next,
  setting,
  TWO_DAYS,
  view,
  WEEK,
} from './dose-calendar.v2.aides'

describe('R12 : la lecture d’un traitement', () => {
  it('prochaine échéance, échéances à venir dans une fenêtre, dernière journée', () => {
    const p1 = setting('p1', '2026-10-01', DAY, [], { endsOn: '2026-10-10' })
    const read = view([p1], [line('p1', 'given', '2026-10-01')], '2026-10-01')
    expect(keys([read.nextDue!])).toEqual(['2026-10-02'])
    expect(keys(read.upcoming({ from: '2026-10-04', to: '2026-10-06' }))).toEqual([
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
    ])
    expect(keys(read.upcoming({ limit: 2 }))).toEqual(['2026-10-02', '2026-10-03'])
    expect(read.lastDueDay).toBe('2026-10-10')
    expect(view([setting('p1', '2026-10-01', DAY)], [], '2026-10-01').lastDueDay).toBeNull()
  })

  it('reprise dont la première prise est loin : la prochaine dose est lue, pas une fin', () => {
    const p1 = setting('p1', '2026-10-01', DAY, [], { stoppedOn: '2026-10-02' })
    const p2 = setting('p2', '2026-11-20', DAY, [], { startsOn: '2026-10-02' })
    const read = view([p1, p2], [line('p1', 'given', '2026-10-01')], '2026-10-02')
    expect([read.phase, keys(read.currentDoses)]).toEqual(['upcoming', ['2026-11-20']])
  })

  it('arrêté : fini le jour de l’arrêt ; avant toute échéance et sans prise, arrêté avant la première', () => {
    const p1 = setting('p1', '2026-10-05', DAY, [], {
      startsOn: '2026-10-01',
      stoppedOn: '2026-10-03',
    })
    const read = view([p1], [], '2026-10-03')
    expect([read.endedOn, read.stoppedBeforeFirstDose, read.nextDue]).toEqual([
      '2026-10-03',
      true,
      null,
    ])
    const given = view([p1], [line('p1', 'extra', '2026-10-02')], '2026-10-03')
    expect(given.stoppedBeforeFirstDose).toBe(false)
  })

  it('arrêté le jour de sa première échéance : la dose était due, « Arrêté le … » (#594, 2026-10-08)', () => {
    const p1 = setting('p1', '2026-10-07', DAY, [], { stoppedOn: '2026-10-07' })
    const read = view([p1], [], '2026-10-07')
    expect([read.phase, read.stoppedBeforeFirstDose, read.endedOn]).toEqual([
      'stopped',
      false,
      '2026-10-07',
    ])
  })

  it('date de fin atteinte : fini à la date de fin', () => {
    const p1 = setting('p1', '2026-10-01', DAY, [], { endsOn: '2026-10-02' })
    const lines = [line('p1', 'given', '2026-10-01'), line('p1', 'given', '2026-10-02')]
    expect(view([p1], lines, '2026-10-05')).toMatchObject({
      phase: 'ended',
      finished: true,
      endedOn: '2026-10-02',
    })
  })

  it('R11 : l’historique garde chaque ligne, avec son effet ou sans effet', () => {
    const p1 = setting('p1', '2026-10-01', DAY)
    const old = line('p1', 'given', '2026-10-01')
    const note = line('p1', 'missed', '2026-10-01')
    const back = line('p1', 'postponed', '2026-10-02', null, '2026-10-02')
    const history = view([p1], [back, note, old], '2026-10-02').history
    expect(history.map(({ line, effect }) => [line.id, effect])).toEqual([
      [old.id, { kind: 'idle', reason: 'superseded' }],
      [note.id, { kind: 'covers', key: '2026-10-01' }],
      [back.id, { kind: 'idle', reason: 'back-to-date' }],
    ])
  })

  it('état d’une échéance : à donner, donnée, oubliée, déplacée, hors calendrier ; le 3, jour de grille, reçoit 8 h et 20 h du 2 (décision du 16 octobre 2026)', () => {
    const p1 = setting('p1', '2026-10-01', DAY, H)
    const p2 = setting('p2', '2026-10-03', DAY, ['09:00'], { gridOriginOn: null })
    const lines = [
      line('p1', 'given', '2026-10-01', '08:00'),
      line('p1', 'missed', '2026-10-01', '20:00'),
      line('p1', 'postponed', '2026-10-02', '08:00', '2026-10-03'),
      line('p1', 'given', '2026-10-03', '20:00'),
    ]
    const read = view([p1, p2], lines, '2026-10-03')
    const states = [
      ['2026-10-01', '08:00'],
      ['2026-10-01', '20:00'],
      ['2026-10-02', '08:00'],
      ['2026-10-03', '09:00'],
      ['2026-10-04', '09:00'],
      ['2026-10-04', '08:00'],
    ].map(([dueOn, dueTime]) => read.dueState({ dueOn: dueOn!, dueTime: dueTime! }))
    expect(states).toEqual(['given', 'missed', 'moved', 'pending', 'pending', 'removed'])
    expect(read.dueState({ dueOn: '2026-10-03', dueTime: '08:00' })).toBe('pending')
    expect(read.dueState({ dueOn: '2026-10-03', dueTime: '20:00' })).toBe('given')
  })

  it('TR-21, Q33 : déjà notée, par une prise ou par une prise en plus du jour', () => {
    const p1 = setting('p1', '2026-10-02', WEEK)
    const lines = [{ ...line('p1', 'given', '2026-10-02'), givenOn: '2026-10-03' }]
    const read = view([p1], [...lines, line('p1', 'extra', '2026-10-05')], '2026-10-05')
    expect(read.alreadyNotedOn({ dueOn: '2026-10-02', dueTime: null }, '2026-10-05')).toBe(
      '2026-10-03',
    )
    expect(read.alreadyNotedOn({ dueOn: '2026-10-09', dueTime: null }, '2026-10-05')).toBe(
      '2026-10-05',
    )
    expect(read.alreadyNotedOn({ dueOn: '2026-10-09', dueTime: null }, '2026-10-06')).toBeNull()
  })

  it('R5 : une prise un intervalle ou plus avant son échéance est une prise en plus', () => {
    const weekly = view([setting('p1', '2026-10-02', WEEK)], [], '2026-10-02')
    expect(weekly.extraBoundary({ settingId: 'p1', dueOn: '2026-10-16', dueTime: null })).toBe(
      '2026-10-10',
    )
    expect(weekly.extraBoundary({ settingId: 'p1', dueOn: '2026-10-02', dueTime: null })).toBe(
      '2026-10-02',
    )
    const twice = view([setting('p1', '2026-10-02', DAY, H)], [], '2026-10-02')
    expect(twice.extraBoundary({ settingId: 'p1', dueOn: '2026-10-03', dueTime: '08:00' })).toBe(
      null,
    )
  })

  it('le réglage en vigueur un jour donné, et le réglage en cours', () => {
    const p1 = setting('p1', '2026-10-01', DAY)
    const p2 = setting('p2', '2026-10-05', WEEK, [], { startsOn: '2026-10-04' })
    const read = view([p1, p2], [], '2026-10-05')
    expect([read.settingAt('2026-10-03'), read.settingAt('2026-10-04')]).toEqual([p1, p2])
    expect([read.settingAt('2026-09-30'), read.currentSetting]).toEqual([undefined, p2])
  })
})

describe('relecture du pas 2 : frontières de réglage et historique', () => {
  const MONTH = { value: 1, unit: 'month' } as const
  const effectOf = (read: ReturnType<typeof view>, id: string) =>
    read.history.find(({ line }) => line.id === id)?.effect

  it('R1, R4 : dose du jour donnée, fréquence changée le même jour : la prise garde son échéance', () => {
    const monthly = setting('p1', '2026-09-05', MONTH)
    const today = line('p1', 'given', '2026-10-05')
    const lines = [line('p1', 'given', '2026-09-05'), today]
    const weekly = setting('p2', '2026-10-12', WEEK, [], { startsOn: '2026-10-05' })
    const read = view([monthly, weekly], lines, '2026-10-05')
    expect(keys(read.upcoming({ limit: 2 }))).toEqual(['2026-10-12', '2026-10-19'])
    expect(effectOf(read, today.id)).toEqual({ kind: 'covers', key: '2026-10-05' })
    const daily = setting('p2', '2026-10-06', DAY, [], { startsOn: '2026-10-05' })
    expect(keys([view([monthly, daily], lines, '2026-10-05').nextDue!])).toEqual(['2026-10-06'])
  })

  it('R11 : quotidien 8 h et 20 h, doses du 3 données, hebdo à 9 h à partir du 10 : elles couvrent le 3', () => {
    const p1 = setting('p1', '2026-10-01', DAY, H)
    const morning = line('p1', 'given', '2026-10-03', '08:00')
    const evening = line('p1', 'given', '2026-10-03', '20:00')
    const p2 = setting('p2', '2026-10-10', WEEK, ['09:00'], { startsOn: '2026-10-03' })
    const read = view([p1, p2], [morning, evening], '2026-10-03')
    expect(effectOf(read, morning.id)).toEqual({ kind: 'covers', key: '2026-10-03 08:00' })
    expect(effectOf(read, evening.id)).toEqual({ kind: 'covers', key: '2026-10-03 20:00' })
    expect(keys([read.nextDue!])).toEqual(['2026-10-10 09:00'])
  })

  it('R8, Q-G3 : dose du 5 donnée, arrêt et reprise le 5 : la prise couvre la reprise', () => {
    const p1 = setting('p1', '2026-10-01', DAY, [], { stoppedOn: '2026-10-05' })
    const given = line('p1', 'given', '2026-10-05')
    const p2 = setting('p2', '2026-10-05', DAY)
    const read = view([p1, p2], [given], '2026-10-05')
    expect(effectOf(read, given.id)).toEqual({ kind: 'covers', key: '2026-10-05' })
    expect(read.dueState({ dueOn: '2026-10-05', dueTime: null })).toBe('covered')
  })

  it('R8, Q-G3 : hebdo arrêté le 5, prise du 5 hors de sa grille, reprise quotidienne le 5 : elle couvre le 5', () => {
    const p1 = setting('p1', '2026-10-01', WEEK, [], { stoppedOn: '2026-10-05' })
    const given = line('p1', 'given', '2026-10-05')
    const p2 = setting('p2', '2026-10-05', DAY)
    const read = view([p1, p2], [given], '2026-10-05')
    expect(effectOf(read, given.id)).toEqual({ kind: 'covers', key: '2026-10-05' })
  })

  describe('R8, Q-G3, #784 : reprise le 23 mars, hebdo à 8, 14 et 20 h dès le 24, 20 h du 24 avancée au 23, prise d’avant l’arrêt notée le 23 à 20 h', () => {
    const p1 = setting('p1', '2026-03-20', DAY, ['08:00', '14:00', '20:00'], {
      stoppedOn: '2026-03-23',
    })
    const before = line('p1', 'given', '2026-03-23', '20:00')
    const p2 = setting('p2', '2026-03-24', WEEK, ['08:00', '14:00', '20:00'], {
      startsOn: '2026-03-23',
    })
    const advanced = line('p2', 'postponed', '2026-03-24', '20:00', '2026-03-23')
    const dosage = setting('p3', '2026-03-23', WEEK, ['08:00', '14:00', '20:00'], {
      startsOn: '2026-03-23',
      gridOriginOn: null,
    })

    it.each([
      ['sans posologie', [p1, p2]],
      ['posologie écrite le 23', [p1, p2, dosage]],
    ])('%s : la prise couvre la dose avancée au 23, rien à redonner le 23', (_, settings) => {
      const read = view(settings, [before, advanced], '2026-03-23')
      expect(read.dueState({ dueOn: '2026-03-23', dueTime: '20:00' })).toBe('covered')
      expect(effectOf(read, before.id)).toEqual({ kind: 'covers', key: '2026-03-23 20:00' })
      expect(keys(read.currentDoses)).toEqual(['2026-03-24 08:00'])
    })
  })

  it('R8 : prise d’avance au-delà de l’arrêt, report du même jour : la reprise qui note cette échéance est seule à la couvrir', () => {
    const p1 = setting('p1', '2026-10-01', DAY, H, { stoppedOn: '2026-10-03' })
    const ahead = line('p1', 'given', '2026-10-06', '20:00')
    const report = line('p1', 'postponed', '2026-10-06', '08:00', '2026-10-08')
    const p2 = setting('p2', '2026-10-04', TWO_DAYS, ['20:00'], { startsOn: '2026-10-03' })
    const resumed = line('p2', 'given', '2026-10-06', '20:00')
    const read = view([p1, p2], [ahead, report, resumed], '2026-10-06')
    expect(effectOf(read, ahead.id)).toEqual({ kind: 'idle', reason: 'nothing-to-cover' })
    expect(effectOf(read, resumed.id)).toEqual({ kind: 'covers', key: '2026-10-06 20:00' })
  })

  it('R4, R8 : posologie ouverte puis arrêtée le 8, doses de 14 h et 20 h du 8 données d’avance, reprise le 8 à 20 h : les deux prises restent comptées, la dose de 20 h de la reprise une seule fois (R8, #819)', () => {
    const p1 = setting('p1', '2026-10-05', DAY, ['08:00', '14:00', '20:00'])
    const p2 = setting('p2', '2026-10-08', DAY, ['08:00', '14:00', '20:00'], {
      stoppedOn: '2026-10-08',
    })
    const afternoon = { ...line('p2', 'given', '2026-10-08', '14:00'), givenOn: '2026-10-02' }
    const evening = { ...line('p2', 'given', '2026-10-08', '20:00'), givenOn: '2026-10-05' }
    const p3 = setting('p3', '2026-10-08', { value: 3, unit: 'day' }, ['20:00'])
    const read = view([p1, p2, p3], [afternoon, evening], '2026-10-08')
    const effects = [effectOf(read, afternoon.id), effectOf(read, evening.id)]
    expect(effects).toEqual([
      { kind: 'covers', key: '2026-10-08 14:00' },
      { kind: 'covers', key: '2026-10-08 20:00' },
    ])
    expect(read.slots('2026-10-08', '2026-10-08').map(({ state }) => state)).toEqual(['covered'])
  })

  it('R4 : heures changées, les prises du jour couvrent les nouvelles heures dans l’ordre des heures', () => {
    const p1 = setting('p1', '2026-10-01', DAY, H)
    const evening = line('p1', 'given', '2026-10-03', '20:00')
    const morning = line('p1', 'given', '2026-10-03', '08:00')
    const p2 = setting('p2', '2026-10-03', DAY, ['09:00', '21:00'])
    const read = view([p1, p2], [evening, morning], '2026-10-03')
    expect(effectOf(read, morning.id)).toEqual({ kind: 'covers', key: '2026-10-03 09:00' })
    expect(effectOf(read, evening.id)).toEqual({ kind: 'covers', key: '2026-10-03 21:00' })
  })

  it('R1, R4 : deux réglages qui cèdent la place le même jour : la journée se lit avec le dernier, traduction comprise', () => {
    const morning = line('p1', 'given', '2026-10-03', '06:00')
    const evening = line('p2', 'given', '2026-10-03', '20:00')
    const settings = [
      setting('p1', '2026-10-01', DAY, ['06:00']),
      setting('p2', '2026-10-03', DAY, ['20:00']),
      setting('p3', '2026-10-10', WEEK, ['09:00'], { startsOn: '2026-10-03' }),
    ]
    const read = view(settings, [morning, evening], '2026-10-03')
    expect(effectOf(read, morning.id)).toEqual({ kind: 'idle', reason: 'nothing-to-cover' })
    expect(effectOf(read, evening.id)).toEqual({ kind: 'covers', key: '2026-10-03 20:00' })
  })

  it('R4, décision du 16 octobre 2026 : heures changées par deux réglages le même jour : la prise de 20 h de l’ancien réglage couvre la première heure du nouveau, 9 h', () => {
    const settings = [
      setting('p1', '2026-10-01', DAY, H),
      setting('p2', '2026-10-03', DAY, ['09:00', '21:00']),
      setting('p3', '2026-10-03', DAY, ['09:00', '21:00']),
    ]
    const lines = [
      line('p1', 'given', '2026-10-03', '20:00'),
      line('p2', 'missed', '2026-10-05', '09:00'),
    ]
    const read = view(settings, lines, '2026-10-03')
    expect(read.dueState({ dueOn: '2026-10-03', dueTime: '09:00' })).toBe('covered')
    expect(read.dueState({ dueOn: '2026-10-03', dueTime: '21:00' })).toBe('pending')
  })

  it('Q41 : une dose oubliée n’est pas « déjà notée »', () => {
    const p1 = setting('p1', '2026-10-02', WEEK)
    const read = view([p1], [line('p1', 'missed', '2026-10-02')], '2026-10-09')
    expect(read.alreadyNotedOn({ dueOn: '2026-10-02', dueTime: null }, '2026-10-09')).toBeNull()
  })

  it('les échéances d’un intervalle de jours, avec leur état et la prise qui les couvre', () => {
    const p1 = setting('p1', '2026-10-01', TWO_DAYS, H)
    const given = line('p1', 'given', '2026-10-01', '08:00')
    const moved = line('p1', 'postponed', '2026-10-03', '08:00', '2026-10-04')
    const read = view([p1], [given, moved], '2026-10-02')
    expect(
      read
        .slots('2026-10-01', '2026-10-05')
        .map(({ due, state, by }) => [keys([due])[0], state, by?.id ?? null]),
    ).toEqual([
      ['2026-10-01 08:00', 'given', given.id],
      ['2026-10-01 20:00', 'pending', null],
      ['2026-10-04 08:00', 'pending', null],
      ['2026-10-04 20:00', 'pending', null],
      ['2026-10-05 08:00', 'pending', null],
      ['2026-10-05 20:00', 'pending', null],
    ])
  })
})

describe('R3, R10 : un changement de réglage fait avant la première dose (décision du 2026-10-11)', () => {
  const THREE_DAYS = { value: 3, unit: 'day' as const }
  const read = (settings: Setting[], lines: Line[], today: string, count = 3) => {
    const shown = view(settings, lines, today)
    const dues = [...shown.currentDoses, ...shown.upcoming()]
    return {
      current: shown.currentSetting?.id,
      dues: [...new Set(dues.map((due) => `${keys([due])[0]} ${due.settingId}`))].slice(0, count),
    }
  }

  it('graine 640000526 : tous les 3 jours à 20 h du 6 avr., posologie le 5 (première échéance le 8, arrivée d’un report supprimé depuis) : la posologie remplace la création, 6, 9, 12', () => {
    const p1 = setting('p1', '2026-04-06', THREE_DAYS, ['20:00'])
    const p2 = setting('p2', '2026-04-08', THREE_DAYS, ['20:00'], {
      startsOn: '2026-04-05',
      gridOriginOn: null,
    })
    expect(read([p1, p2], [], '2026-04-06')).toEqual({
      current: 'p2',
      dues: ['2026-04-06 20:00 p2', '2026-04-09 20:00 p2', '2026-04-12 20:00 p2'],
    })
    const p3 = setting('p3', '2026-04-06', THREE_DAYS, ['20:00'], {
      startsOn: '2026-04-06',
      gridOriginOn: null,
    })
    expect(read([p1, p2, p3], [], '2026-04-06')).toEqual({
      current: 'p3',
      dues: ['2026-04-06 20:00 p3', '2026-04-09 20:00 p3', '2026-04-12 20:00 p3'],
    })
  })

  it('créé le 1er avr., première dose le 6, dose du 6 reportée au 8 sous la création, posologie le 4 (première échéance le 8), report supprimé : 6, 9, 12', () => {
    const p1 = setting('p1', '2026-04-06', THREE_DAYS, ['20:00'], { startsOn: '2026-04-01' })
    const p2 = setting('p2', '2026-04-08', THREE_DAYS, ['20:00'], {
      startsOn: '2026-04-04',
      gridOriginOn: null,
    })
    const report = line('p1', 'postponed', '2026-04-06', '20:00', '2026-04-08')
    expect(read([p1, p2], [report], '2026-04-05').dues).toEqual([
      '2026-04-08 20:00 p2',
      '2026-04-09 20:00 p2',
      '2026-04-12 20:00 p2',
    ])
    expect(read([p1, p2], [], '2026-04-05').dues).toEqual([
      '2026-04-06 20:00 p2',
      '2026-04-09 20:00 p2',
      '2026-04-12 20:00 p2',
    ])
  })

  it('graine 640001351 : toutes les 6 semaines du 22 mars, décalage du 22 au 23, posologie le 20 (première échéance le 23) : 22 mars, puis 4 mai, sous la posologie', () => {
    const SIX_WEEKS = { value: 6, unit: 'week' as const }
    const p1 = setting('p1', '2026-03-22', SIX_WEEKS)
    const p2 = setting('p2', '2026-03-23', SIX_WEEKS, [], {
      startsOn: '2026-03-20',
      gridOriginOn: null,
    })
    const shift = line('p1', 'shift', '2026-03-22', null, '2026-03-23')
    expect(read([p1, p2], [shift], '2026-03-20', 2)).toEqual({
      current: 'p2',
      dues: ['2026-03-22 p2', '2026-05-04 p2'],
    })
  })
})

describe('R7, R9 : la journée d’arrivée devenue première échéance d’une posologie (décision du 2026-10-11)', () => {
  it('graine 620002762 : chaque semaine à 8, 14, 20 h du 24 mars, 14 h reportée au 12 avr. avec décalage, posologies le 25 et le 28 : le 12 ne reçoit que 14 h', () => {
    const times = ['08:00', '14:00', '20:00']
    const endsOn = '2026-04-25'
    const p1 = setting('p1', '2026-03-24', WEEK, times, { endsOn })
    const p2 = setting('p2', '2026-04-13', WEEK, times, {
      startsOn: '2026-03-25',
      gridOriginOn: null,
      endsOn,
    })
    const p3 = setting('p3', '2026-04-12', WEEK, times, {
      startsOn: '2026-03-28',
      gridOriginOn: null,
      endsOn,
    })
    const lines = [
      line('p1', 'given', '2026-03-24', '08:00'),
      line('p1', 'missed', '2026-03-24', '20:00'),
      line('p1', 'postponed', '2026-03-24', '14:00', '2026-04-12'),
      line('p1', 'shift', '2026-03-24', '14:00', '2026-04-12'),
    ]
    const upcoming = (settings: Setting[]) =>
      keys(view(settings, lines, '2026-03-28').upcoming({ to: '2026-04-19' }))
    const expected = [
      '2026-04-12 14:00',
      '2026-04-19 08:00',
      '2026-04-19 14:00',
      '2026-04-19 20:00',
    ]
    expect(upcoming([p1, p2])).toEqual(expected)
    expect(upcoming([p1, p2, p3])).toEqual(expected)
  })
})

describe('R7, R9.2 : la dose avancée dont l’arrivée devient la première échéance d’un nouveau rythme (relecture du pas 3)', () => {
  const H4 = ['06:00', '12:00', '18:00', '23:00']
  const TWO_WEEKS = { value: 2, unit: 'week' as const }
  const SIX_WEEKS = { value: 6, unit: 'week' as const }

  it.each([
    ['avancée au 12', '2026-04-12', ['2026-04-12 20:00', '2026-05-24 06:00']],
    ['reportée au 14', '2026-04-14', ['2026-04-14 20:00', '2026-05-26 06:00']],
  ])(
    'Métacam toutes les 2 semaines à 20 h du 30 mars, dose du 13 %s le 2 avr., puis toutes les 6 semaines à 6, 12, 18, 23 h : la journée d’arrivée garde la dose reportée à 20 h (décision du 15 octobre 2026)',
    (_, arrival, expected) => {
      const p1 = setting('p1', '2026-03-30', TWO_WEEKS, ['20:00'])
      const p2 = setting('p2', arrival, SIX_WEEKS, H4, { startsOn: '2026-04-02' })
      const lines = [
        line('p1', 'given', '2026-03-30', '20:00'),
        line('p1', 'postponed', '2026-04-13', '20:00', arrival),
      ]
      expect(keys(view([p1, p2], lines, '2026-04-02').upcoming({ limit: 2 }))).toEqual(expected)
    },
  )
})

describe('R9 : un réglage écrit avant la première dose, fréquence changée (relecture du pas 3)', () => {
  const tuesday = setting('p1', '2026-10-06', WEEK)
  const report = line('p1', 'postponed', '2026-10-06', null, '2026-10-08')

  it.each([
    [
      'tous les jours, prochaine dose le 3',
      DAY,
      '2026-10-03',
      ['2026-10-03', '2026-10-04', '2026-10-05'],
    ],
    [
      'tous les 3 jours, prochaine dose le 5',
      { value: 3, unit: 'day' as const },
      '2026-10-05',
      ['2026-10-05', '2026-10-08', '2026-10-11'],
    ],
  ])(
    'vermifuge hebdomadaire, première dose le mardi 6, reportée au 8 ; le 3, %s : la date choisie est la première échéance',
    (_, frequency, firstDueOn, expected) => {
      const changed = setting('p2', firstDueOn, frequency, [], { startsOn: '2026-10-03' })
      expect(next([tuesday, changed], [report], '2026-10-03')).toEqual(expected)
    },
  )
})

describe('R7, R9.2 : un rythme qui ne part plus de l’arrivée d’un report n’en efface pas les heures (relecture du pas 3)', () => {
  const p1 = setting('p1', '2026-04-06', WEEK, ['20:00'])

  it('hebdo à 20 h, doses des 6 et 13 avr. données, dose du 20 avancée au 16 ; le 14, tous les 2 jours dès le 16 ; le 15, tous les jours à 8 et 20 h : le 16, jour d’arrivée et de grille, garde 8 h et y reçoit 20 h (décision du 16 octobre 2026)', () => {
    const p2 = setting('p2', '2026-04-16', TWO_DAYS, ['20:00'], { startsOn: '2026-04-14' })
    const p3 = setting('p3', '2026-04-15', DAY, H, { startsOn: '2026-04-15' })
    const lines = [
      line('p1', 'given', '2026-04-06', '20:00'),
      line('p1', 'given', '2026-04-13', '20:00'),
      line('p1', 'postponed', '2026-04-20', '20:00', '2026-04-16'),
    ]
    expect(next([p1, p2, p3], lines, '2026-04-15', 5)).toEqual([
      '2026-04-15 08:00',
      '2026-04-15 20:00',
      '2026-04-16 08:00',
      '2026-04-16 20:00',
      '2026-04-17 08:00',
    ])
  })

  it.each([
    [
      'tous les 3 jours à 20 h dès le 17',
      '2026-04-17',
      ['20:00'],
      ['2026-04-15 20:00', '2026-04-17 20:00'],
    ],
    [
      'tous les 3 jours à 8 et 20 h dès le 12',
      '2026-04-12',
      H,
      ['2026-04-15 08:00', '2026-04-15 20:00'],
    ],
  ])(
    'hebdo à 20 h, dose du 13 avr. reportée au 15 ; le 8, tous les 2 jours dès le 15 ; le 9, %s : le report ne fait partir aucun rythme, le 15 garde les doses de sa grille et y reçoit 20 h (décision du 16 octobre 2026)',
    (_, firstDueOn, times, expected) => {
      const p2 = setting('p2', '2026-04-15', TWO_DAYS, ['20:00'], { startsOn: '2026-04-08' })
      const p3 = setting('p3', firstDueOn, { value: 3, unit: 'day' }, times, {
        startsOn: '2026-04-09',
      })
      const report = line('p1', 'postponed', '2026-04-13', '20:00', '2026-04-15')
      const read = view(
        [p1, p2, p3],
        [line('p1', 'given', '2026-04-06', '20:00'), report],
        '2026-04-09',
      )
      expect(keys(read.upcoming({ from: '2026-04-15', limit: 2 }))).toEqual(expected)
      expect(read.history.find(({ line }) => line.id === report.id)?.effect).not.toHaveProperty(
        'opensRhythm',
      )
    },
  )
})

describe('R9, Q-retard : une dose en retard reste la dose du moment à fréquence gardée (décision du 2026-10-11)', () => {
  const monday = setting('p1', '2026-10-05', WEEK)
  const given = line('p1', 'given', '2026-10-05')

  it('hebdo du lundi, dose du lundi 12 non donnée, posologie changée le mercredi 14 : le 12 reste en retard', () => {
    const posology = setting('p2', '2026-10-12', WEEK, [], {
      startsOn: '2026-10-14',
      gridOriginOn: null,
    })
    const read = view([monday, posology], [given], '2026-10-14')
    expect([read.phase, keys(read.currentDoses), keys(read.unloggedDoses)]).toEqual([
      'overdue',
      ['2026-10-12'],
      [],
    ])
  })

  it('heures seules changées le 14 : le 12 reste en retard, à l’ancienne heure', () => {
    const hours = setting('p2', '2026-10-12', WEEK, ['09:00'], {
      startsOn: '2026-10-14',
      gridOriginOn: null,
    })
    const read = view([monday, hours], [given], '2026-10-14')
    expect([read.phase, keys(read.currentDoses), keys(read.unloggedDoses)]).toEqual([
      'overdue',
      ['2026-10-12'],
      [],
    ])
  })

  it('fréquence changée le 14 (toutes les 2 semaines dès le 19) : le 12 est à renseigner', () => {
    const rhythm = setting('p2', '2026-10-19', { value: 2, unit: 'week' }, [], {
      startsOn: '2026-10-14',
    })
    const read = view([monday, rhythm], [given], '2026-10-14')
    expect([read.phase, keys(read.currentDoses), keys(read.unloggedDoses)]).toEqual([
      'upcoming',
      ['2026-10-19'],
      ['2026-10-12'],
    ])
  })
})

describe('R3, R10 : un réglage remplacé le jour même transmet sa grille au réglage de même fréquence (#781)', () => {
  const weekly = setting('s1', '2026-10-01', WEEK)
  const lines = [
    line('s1', 'given', '2026-10-01'),
    line('s1', 'postponed', '2026-10-08', null, '2026-10-12'),
  ]
  const fortnightly = setting('s2', '2026-10-14', { value: 2, unit: 'week' }, [], {
    startsOn: '2026-10-10',
  })

  it('hebdo, dose du 8 reportée seule au 12 ; le 10, toutes les 2 semaines dès le 14, puis posologie le même jour : 12, 14, 28', () => {
    const posology = setting('s3', '2026-10-12', { value: 2, unit: 'week' }, [], {
      startsOn: '2026-10-10',
      gridOriginOn: null,
    })
    expect(next([weekly, fortnightly, posology], lines, '2026-10-10')).toEqual(
      next([weekly, fortnightly], lines, '2026-10-10'),
    )
    expect(next([weekly, fortnightly, posology], lines, '2026-10-10')).toEqual([
      '2026-10-12',
      '2026-10-14',
      '2026-10-28',
    ])
  })

  it('le même jour, un réglage hebdomadaire reçu d’un autre appareil remplace le premier et garde la grille du lundi : 12, 15, 22', () => {
    const other = setting('s3', '2026-10-12', WEEK, [], {
      startsOn: '2026-10-10',
      gridOriginOn: null,
    })
    expect(next([weekly, fortnightly, other], lines, '2026-10-10')).toEqual([
      '2026-10-12',
      '2026-10-15',
      '2026-10-22',
    ])
  })
})

describe('R3, R6 : un décalage écrit avant un changement de fréquence reste dépassé sous une posologie', () => {
  const s1 = setting('s1', '2026-03-13', { value: 3, unit: 'day' }, ['20:00'])
  const s2 = setting('s2', '2026-03-15', { value: 2, unit: 'week' }, ['20:00'], {
    startsOn: '2026-03-14',
  })
  const lines = [
    line('s1', 'postponed', '2026-03-13', '20:00', '2026-03-15'),
    { ...line('s1', 'given', '2026-03-15', '20:00'), givenOn: '2026-03-14' },
    line('s1', 'shift', '2026-03-15', '20:00', '2026-03-14'),
  ]

  it('tous les 3 jours à 20 h, dose du 13 reportée seule au 15 et donnée le 14 avec décalage ; le 14, toutes les 2 semaines dès le 15 ; le 15, posologie : 29 mars, 12 et 26 avr.', () => {
    const s3 = setting('s3', '2026-03-29', { value: 2, unit: 'week' }, ['20:00'], {
      startsOn: '2026-03-15',
      gridOriginOn: null,
    })
    const expected = ['2026-03-29 20:00', '2026-04-12 20:00', '2026-04-26 20:00']
    expect(next([s1, s2], lines, '2026-03-15')).toEqual(expected)
    expect(next([s1, s2, s3], lines, '2026-03-15')).toEqual(expected)
  })
})

describe('R3 : une date choisie sur la grille d’un décalage à venir continue le rythme', () => {
  const s1 = setting('s1', '2026-03-20', MONTH, ['20:00'])
  const lines = [
    { ...line('s1', 'given', '2026-04-20', '20:00'), givenOn: '2026-03-25' },
    line('s1', 'shift', '2026-04-20', '20:00', '2026-03-25'),
  ]
  const s2 = setting('s2', '2026-06-25', MONTH, ['20:00'], { startsOn: '2026-03-27' })

  it('mensuel du 20 mars à 20 h, dose du 20 avr. donnée le 25 mars avec décalage ; le 27, première dose le 25 juin ; le 29, posologie : la même suite', () => {
    const s3 = setting('s3', '2026-04-25', MONTH, ['20:00'], {
      startsOn: '2026-03-29',
      gridOriginOn: null,
    })
    expect(next([s1, s2, s3], lines, '2026-03-29', 4)).toEqual(
      next([s1, s2], lines, '2026-03-29', 4),
    )
  })
})

describe('R9, Q-retard : un traitement fini avant la modification garde ses doses à renseigner', () => {
  it('tous les 3 mois à 20 h du 7 mars, fin le 16, dose du 7 non donnée ; le 18, sans heure, première dose le 7 juin : le 7 mars à renseigner', () => {
    const ended = setting('p1', '2026-03-07', { value: 3, unit: 'month' }, ['20:00'], {
      endsOn: '2026-03-16',
    })
    const after = setting('p2', '2026-06-07', { value: 3, unit: 'month' }, [], {
      startsOn: '2026-03-18',
      gridOriginOn: null,
    })
    const read = view([ended, after], [], '2026-03-18')
    expect([read.phase, keys(read.currentDoses), keys(read.unloggedDoses)]).toEqual([
      'upcoming',
      ['2026-06-07'],
      ['2026-03-07 20:00'],
    ])
  })
})

describe('R3, R9 : une date choisie se juge sur la grille en vigueur ce jour-là', () => {
  it('tous les 3 mois à 20 h, première dose le 2 avr., décalage ancré au 31 mars qui vaut à partir du 2 ; le 31, première dose choisie le 31 : 31 mars, 30 juin, 30 sept.', () => {
    const s1 = setting('s1', '2026-04-02', { value: 3, unit: 'month' }, ['20:00'], {
      startsOn: '2026-03-30',
    })
    const s2 = setting('s2', '2026-03-31', { value: 3, unit: 'month' }, ['20:00'], {
      startsOn: '2026-03-31',
    })
    const lines = [line('s1', 'shift', '2026-04-02', '20:00', '2026-03-31')]
    expect(next([s1, s2], lines, '2026-03-31')).toEqual([
      '2026-03-31 20:00',
      '2026-06-30 20:00',
      '2026-09-30 20:00',
    ])
  })
})

describe('arrêté avant la première prise (TR-30, #594, 2026-10-08)', () => {
  const stopped = (extra: Partial<Setting> = {}) =>
    setting('p1', '2026-10-07', DAY, [], { stoppedOn: '2026-10-06', ...extra })

  it('vrai sans aucune prise ni dose due, un décalage seul compris', () => {
    expect(view([stopped()], [], '2026-10-06').stoppedBeforeFirstDose).toBe(true)
    const shift = line('p1', 'shift', '2026-10-07', null, '2026-10-09')
    expect(view([stopped()], [shift], '2026-10-06').stoppedBeforeFirstDose).toBe(true)
  })

  it('faux après la première échéance, ou sans arrêt', () => {
    expect(
      view([stopped({ stoppedOn: '2026-10-08' })], [], '2026-10-08').stoppedBeforeFirstDose,
    ).toBe(false)
    expect(view([stopped({ stoppedOn: null })], [], '2026-10-06').stoppedBeforeFirstDose).toBe(
      false,
    )
  })

  it('faux dès qu’une dose a été donnée, oubliée ou prise en plus', () => {
    for (const status of ['given', 'missed', 'extra'] as const) {
      const read = view([stopped()], [line('p1', status, '2026-10-05')], '2026-10-06')
      expect(read.stoppedBeforeFirstDose).toBe(false)
    }
  })

  it('faux quand une période précédente a eu des doses dues, jamais renseignées', () => {
    const first = setting('p0', '2026-09-01', DAY, [], { stoppedOn: '2026-09-05' })
    const resumed = setting('p1', '2026-10-11', DAY, [], {
      startsOn: '2026-10-08',
      stoppedOn: '2026-10-08',
    })
    expect(view([first, resumed], [], '2026-10-08').stoppedBeforeFirstDose).toBe(false)
  })

  it('vrai quand chaque période s’est close avant sa première échéance', () => {
    const replaced = setting('p0', '2026-09-10', DAY, [], { startsOn: '2026-09-01' })
    const next = setting('p1', '2026-09-20', DAY, [], {
      startsOn: '2026-09-05',
      stoppedOn: '2026-09-12',
    })
    expect(view([replaced, next], [], '2026-09-12').stoppedBeforeFirstDose).toBe(true)
  })
})
