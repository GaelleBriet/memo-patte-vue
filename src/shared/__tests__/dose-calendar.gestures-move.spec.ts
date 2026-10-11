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
})
