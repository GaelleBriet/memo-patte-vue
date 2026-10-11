// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { DAY, H, keys, line, setting, TWO_DAYS, view, WEEK } from './dose-calendar.v2.aides'

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

  it('état d’une échéance : à donner, donnée, oubliée, couverte, déplacée, hors calendrier', () => {
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
    expect(states).toEqual(['given', 'missed', 'moved', 'covered', 'pending', 'removed'])
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

  it('R4 : heures changées, les prises du jour couvrent les nouvelles heures dans l’ordre des heures', () => {
    const p1 = setting('p1', '2026-10-01', DAY, H)
    const evening = line('p1', 'given', '2026-10-03', '20:00')
    const morning = line('p1', 'given', '2026-10-03', '08:00')
    const p2 = setting('p2', '2026-10-03', DAY, ['09:00', '21:00'])
    const read = view([p1, p2], [evening, morning], '2026-10-03')
    expect(effectOf(read, morning.id)).toEqual({ kind: 'covers', key: '2026-10-03 09:00' })
    expect(effectOf(read, evening.id)).toEqual({ kind: 'covers', key: '2026-10-03 21:00' })
  })

  it('R1, R4 : deux réglages qui cèdent la place le même jour : chaque prise garde son échéance', () => {
    const morning = line('p1', 'given', '2026-10-03', '06:00')
    const evening = line('p2', 'given', '2026-10-03', '20:00')
    const settings = [
      setting('p1', '2026-10-01', DAY, ['06:00']),
      setting('p2', '2026-10-03', DAY, ['20:00']),
      setting('p3', '2026-10-10', WEEK, ['09:00'], { startsOn: '2026-10-03' }),
    ]
    const read = view(settings, [morning, evening], '2026-10-03')
    expect(effectOf(read, morning.id)).toEqual({ kind: 'covers', key: '2026-10-03 06:00' })
    expect(effectOf(read, evening.id)).toEqual({ kind: 'covers', key: '2026-10-03 20:00' })
  })

  it('R4 : heures changées par deux réglages le même jour : la prise de l’ancien réglage couvre la première heure', () => {
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
