// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { moveBounds, moveDose, type GestureOutcome } from '../domain/dose-calendar'
import { line, MONTH, setting, TWO_DAYS, WEEK } from './dose-calendar.v2.aides'

const due = (dueOn: string, dueTime: string | null = null) => ({ settingId: 'p1', dueOn, dueTime })
const changesOf = (result: ReturnType<typeof moveDose>) => {
  if ('refusal' in result) throw new Error(`refusé : ${result.refusal.reason}`)
  return (result as GestureOutcome).changes.map((change) =>
    change.action === 'delete'
      ? ['delete', change.id]
      : [change.action, change.line.status, change.line.dueOn, change.line.targetOn],
  )
}

describe('« Prochaine dose » (R7, G6, G7, G8, Q20, Q25, Q2 a)', () => {
  const hebdo = setting('p1', '2026-10-01', WEEK)

  it('dose du 15 reportée au 17 avec la case : le report et un décalage ancré au 17', () => {
    const input = {
      settings: [hebdo],
      lines: [line('p1', 'given', '2026-10-08')],
      today: '2026-10-09',
    }
    expect(
      changesOf(
        moveDose(input, { due: due('2026-10-15'), to: '2026-10-17', shiftsFollowing: true }),
      ),
    ).toEqual([
      ['create', 'postponed', '2026-10-15', '2026-10-17'],
      ['create', 'shift', '2026-10-15', '2026-10-17'],
    ])
  })

  it('bornes : du lendemain de la dernière prise (G8), au plus tôt un intervalle avant (G6), jamais avant aujourd’hui', () => {
    const input = {
      settings: [hebdo],
      lines: [line('p1', 'given', '2026-10-08')],
      today: '2026-10-09',
    }
    expect(moveBounds(input, due('2026-10-15'), true)).toEqual({
      earliest: '2026-10-09',
      latest: null,
      excluded: [],
    })
    const monthly = setting('p1', '2026-03-30', MONTH)
    const early = {
      settings: [monthly],
      lines: [line('p1', 'given', '2026-03-30')],
      today: '2026-03-31',
    }
    expect(moveBounds(early, due('2026-04-30'), true)).toEqual({
      earliest: '2026-04-01',
      latest: null,
      excluded: [],
    })
  })

  it('Q2 a : seule, la dose va au plus la veille de la suivante ; Q20 : jamais après la date de fin', () => {
    const input = {
      settings: [hebdo],
      lines: [line('p1', 'given', '2026-10-08')],
      today: '2026-10-09',
    }
    expect(moveBounds(input, due('2026-10-15'), false)).toEqual({
      earliest: '2026-10-09',
      latest: '2026-10-21',
      excluded: [],
    })
    const ending = setting('p1', '2026-10-01', WEEK, [], { endsOn: '2026-10-18' })
    const bounded = {
      settings: [ending],
      lines: [line('p1', 'given', '2026-10-08')],
      today: '2026-10-09',
    }
    expect(moveBounds(bounded, due('2026-10-15'), true)).toEqual({
      earliest: '2026-10-09',
      latest: '2026-10-18',
      excluded: [],
    })
    expect(
      moveDose(bounded, { due: due('2026-10-15'), to: '2026-10-19', shiftsFollowing: true }),
    ).toEqual({
      refusal: { reason: 'out-of-bounds', earliest: '2026-10-09', latest: '2026-10-18' },
    })
  })

  it('G7 : une prise ou un report existe plus loin : la dose ne se déplace pas', () => {
    const noted = {
      settings: [hebdo],
      lines: [line('p1', 'given', '2026-10-15')],
      today: '2026-10-09',
    }
    expect(moveBounds(noted, due('2026-10-08'), true)).toEqual({
      refusal: { reason: 'later-dose' },
    })
    const moved = {
      settings: [hebdo],
      lines: [line('p1', 'postponed', '2026-10-15', null, '2026-10-16')],
      today: '2026-10-09',
    }
    expect(moveBounds(moved, due('2026-10-08'), true)).toEqual({
      refusal: { reason: 'later-line' },
    })
  })

  it('Q25 : dose du 15 reportée au 17 et donnée le 17 : le report ne change plus de date', () => {
    const input = {
      settings: [hebdo],
      lines: [
        line('p1', 'postponed', '2026-10-15', null, '2026-10-17'),
        line('p1', 'given', '2026-10-17'),
      ],
      today: '2026-10-18',
    }
    expect(moveBounds(input, due('2026-10-17'), true)).toEqual({
      refusal: { reason: 'arrival-logged' },
    })
  })

  it('G13 : déplacer de nouveau la dose réécrit sa ligne ; la ramener à sa date la supprime avec son décalage', () => {
    const report = line('p1', 'postponed', '2026-10-15', null, '2026-10-17')
    const shift = line('p1', 'shift', '2026-10-15', null, '2026-10-17')
    const input = {
      settings: [hebdo],
      lines: [line('p1', 'given', '2026-10-08'), report, shift],
      today: '2026-10-09',
    }
    expect(
      changesOf(
        moveDose(input, { due: due('2026-10-17'), to: '2026-10-19', shiftsFollowing: true }),
      ),
    ).toEqual([
      ['rewrite', 'postponed', '2026-10-15', '2026-10-19'],
      ['rewrite', 'shift', '2026-10-15', '2026-10-19'],
    ])
    expect(
      changesOf(
        moveDose(input, { due: due('2026-10-17'), to: '2026-10-15', shiftsFollowing: true }),
      ),
    ).toEqual([
      ['delete', report.id],
      ['delete', shift.id],
    ])
    expect(
      changesOf(
        moveDose(input, { due: due('2026-10-17'), to: '2026-10-17', shiftsFollowing: false }),
      ),
    ).toEqual([])
  })

  it('R8, TR-32 : dose du 15 reportée seule au 19, arrêt le 16, reprise le 16 au 19 : la dose du 19 de la reprise se déplace', () => {
    const stopped = setting('p1', '2026-10-01', WEEK, [], { stoppedOn: '2026-10-16' })
    const resumed = setting('p2', '2026-10-19', WEEK, [], { startsOn: '2026-10-16' })
    const input = {
      settings: [stopped, resumed],
      lines: [line('p1', 'postponed', '2026-10-15', null, '2026-10-19')],
      today: '2026-10-16',
    }
    const dose = { settingId: 'p2', dueOn: '2026-10-19', dueTime: null }
    expect(moveBounds(input, dose, true)).toEqual({
      earliest: '2026-10-16',
      latest: null,
      excluded: [],
    })
  })

  it('R8, R7 : un report d’avant l’arrêt n’empêche pas une dose de la reprise d’arriver sur son jour d’origine', () => {
    const times = ['06:00', '12:00', '18:00', '23:00']
    const settings = [
      setting('p1', '2026-03-29', { value: 1, unit: 'day' }, [], { stoppedOn: '2026-03-31' }),
      setting('p2', '2026-04-03', WEEK, times, { startsOn: '2026-03-31' }),
      setting('p3', '2026-03-31', WEEK, times, { gridOriginOn: null, stoppedOn: '2026-03-31' }),
      setting('p4', '2026-04-02', { value: 3, unit: 'day' }, ['08:00', '20:00'], {
        startsOn: '2026-04-01',
      }),
    ]
    const lines = [
      line('p2', 'shift', '2026-04-03', '06:00', '2026-03-31'),
      line('p2', 'postponed', '2026-04-03', '06:00', '2026-03-31'),
    ]
    const dose = { settingId: 'p4', dueOn: '2026-04-02', dueTime: '08:00' }
    const result = moveDose(
      { settings, lines, today: '2026-04-01' },
      { due: dose, to: '2026-04-03', shiftsFollowing: true },
    )
    expect(result).not.toHaveProperty('refusal')
  })

  it('Q21 : 8 h et 20 h, la journée part à partir de sa première heure sans prise', () => {
    const p1 = setting('p1', '2026-10-01', TWO_DAYS, ['08:00', '20:00'])
    const input = { settings: [p1], lines: [], today: '2026-10-02' }
    const result = moveDose(input, {
      due: due('2026-10-03', '20:00'),
      to: '2026-10-04',
      shiftsFollowing: false,
    })
    expect(changesOf(result)).toEqual([['create', 'postponed', '2026-10-03', '2026-10-04']])
  })

  it('arrêté : la dose ne se déplace pas', () => {
    const stopped = setting('p1', '2026-10-01', WEEK, [], { stoppedOn: '2026-10-05' })
    expect(
      moveBounds({ settings: [stopped], lines: [], today: '2026-10-06' }, due('2026-10-08'), true),
    ).toEqual({
      refusal: { reason: 'not-movable' },
    })
  })

  it('échéance hors du calendrier (le 2) ou déjà donnée (le 8) : la dose ne se déplace pas, sans lever', () => {
    const input = {
      settings: [hebdo],
      lines: [line('p1', 'given', '2026-10-08')],
      today: '2026-10-08',
    }
    const moved = (dueOn: string) =>
      moveDose(input, { due: due(dueOn), to: '2026-10-10', shiftsFollowing: false })
    expect(moved('2026-10-02')).toEqual({ refusal: { reason: 'not-movable' } })
    expect(moved('2026-10-08')).toEqual({ refusal: { reason: 'not-movable' } })
  })
})

describe('G7, G8 : une dose avancée se juge à son arrivée (décision du 2026-10-11, R12)', () => {
  const H2 = ['08:00', '20:00']
  const mensuel = setting('p1', '2026-03-28', MONTH, ['20:00'])
  const tousLes2Jours = setting('p2', '2026-04-05', TWO_DAYS, H2, { startsOn: '2026-04-02' })
  const avancee = [
    line('p1', 'postponed', '2026-05-02', '20:00', '2026-04-03'),
    line('p1', 'shift', '2026-05-02', '20:00', '2026-04-03'),
    { ...line('p1', 'given', '2026-04-03', '20:00'), givenOn: '2026-04-02' },
    { ...line('p2', 'given', '2026-04-05', '08:00'), givenOn: '2026-04-02' },
  ]
  const input = { settings: [mensuel, tousLes2Jours], lines: avancee, today: '2026-04-02' }
  const dose = { settingId: 'p2', dueOn: '2026-04-05', dueTime: '20:00' }

  it('graine 530000395 : dose du 2 mai avancée au 3 avr. et donnée, tous les 2 jours dès le 5 : la dose de 20 h du 5 se reporte seule au 6', () => {
    expect(moveBounds(input, dose, false)).toEqual({
      earliest: '2026-04-06',
      latest: '2026-04-06',
      excluded: [],
    })
    expect(
      moveDose(input, { due: dose, to: '2026-04-06', shiftsFollowing: false }),
    ).not.toHaveProperty('refusal')
  })

  it('graine 530000118 : toutes les 6 semaines, doses du 17 avr. avancée au 12 mars et du 23 avr. avancée au 20 avr. : la seconde se reporte dès le 13 mars, sauf le 17 avr., jour d’origine de la première (R7, G9)', () => {
    const SIX_WEEKS = { value: 6, unit: 'week' as const }
    const p2 = setting('p2', '2026-03-06', SIX_WEEKS)
    const p3 = setting('p3', '2026-04-20', SIX_WEEKS, [], {
      startsOn: '2026-03-10',
      gridOriginOn: null,
    })
    const lines = [
      line('p2', 'given', '2026-03-06'),
      { ...line('p2', 'given', '2026-03-12'), givenOn: '2026-03-06' },
      line('p2', 'shift', '2026-04-17', null, '2026-03-12'),
      line('p2', 'postponed', '2026-04-17', null, '2026-03-12'),
      line('p2', 'shift', '2026-04-23', null, '2026-04-20'),
      line('p2', 'postponed', '2026-04-23', null, '2026-04-20'),
    ]
    const carnet = { settings: [p2, p3], lines, today: '2026-03-11' }
    const seconde = { settingId: 'p3', dueOn: '2026-04-20', dueTime: null }
    expect(moveBounds(carnet, seconde, true)).toEqual({
      earliest: '2026-03-13',
      latest: null,
      excluded: ['2026-04-17'],
    })
    expect(
      moveDose(carnet, { due: seconde, to: '2026-03-15', shiftsFollowing: true }),
    ).not.toHaveProperty('refusal')
    expect(moveDose(carnet, { due: seconde, to: '2026-04-17', shiftsFollowing: true })).toEqual({
      refusal: { reason: 'report-loop' },
    })
  })

  it('graine 530000019 : la prise de 8 h du 1er juil. tient par le report de 14 h ; réécrire ce report vers la dose du 30 juil. la perdrait : refusé dès les bornes (G13)', () => {
    const p1 = setting('p1', '2026-03-29', MONTH, H2)
    const p2 = setting(
      'p2',
      '2026-07-01',
      { value: 2, unit: 'week' },
      ['08:00', '14:00', '20:00'],
      {
        startsOn: '2026-04-01',
        gridOriginOn: '2026-06-17',
        endsOn: '2026-08-07',
      },
    )
    const p3 = setting('p3', '2026-07-30', MONTH, ['20:00'], { startsOn: '2026-04-05' })
    const lines = [
      { ...line('p1', 'given', '2026-07-01', '08:00'), givenOn: '2026-04-01' },
      line('p2', 'shift', '2026-07-01', '14:00', '2026-07-30'),
      line('p2', 'postponed', '2026-07-01', '14:00', '2026-07-30'),
    ]
    const carnet = { settings: [p1, p2, p3], lines, today: '2026-04-05' }
    const dose = { settingId: 'p3', dueOn: '2026-07-30', dueTime: '20:00' }
    for (const shiftsFollowing of [true, false]) {
      expect(moveBounds(carnet, dose, shiftsFollowing)).toEqual({
        refusal: { reason: 'later-dose' },
      })
    }
  })

  it('graine 530000046 : tous les 3 jours à 8, 14, 20 h, dose du 7 avr. avancée au 5 et 8 h du 5 donnée : 14 h du 5 se reporte seule jusqu’au 9, sauf le 7 (G9), pas avec la case (R6 : le décalage déplacerait la grille sous le 7)', () => {
    const p1 = setting('p1', '2026-04-02', { value: 3, unit: 'day' }, ['08:00', '14:00', '20:00'])
    const lines = [
      { ...line('p1', 'given', '2026-04-02', '08:00'), givenOn: '2026-04-01' },
      line('p1', 'missed', '2026-04-02', '14:00'),
      line('p1', 'shift', '2026-04-02', '20:00', '2026-04-04'),
      line('p1', 'given', '2026-04-02', '20:00'),
      line('p1', 'postponed', '2026-04-07', '08:00', '2026-04-05'),
      { ...line('p1', 'given', '2026-04-05', '08:00'), givenOn: '2026-04-04' },
    ]
    const carnet = { settings: [p1], lines, today: '2026-04-04' }
    const dose = { settingId: 'p1', dueOn: '2026-04-05', dueTime: '14:00' }
    expect(moveBounds(carnet, dose, true)).toEqual({ refusal: { reason: 'later-line' } })
    expect(moveBounds(carnet, dose, false)).toEqual({
      earliest: '2026-04-06',
      latest: '2026-04-09',
      excluded: ['2026-04-07'],
    })
    expect(
      moveDose(carnet, { due: dose, to: '2026-04-08', shiftsFollowing: false }),
    ).not.toHaveProperty('refusal')
  })
})
