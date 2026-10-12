// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  applied,
  dueForDate,
  noteDose,
  redateDose,
  type GestureOutcome,
  type Line,
} from '../domain/dose-calendar'
import { H, line, setting, TWO_DAYS, WEEK } from './dose-calendar.v2.aides'

const vendredi = (extra: Parameters<typeof setting>[4] = {}) =>
  setting('p1', '2026-10-02', WEEK, [], extra)
const due = (dueOn: string, dueTime: string | null = null) => ({ settingId: 'p1', dueOn, dueTime })
const accepted = (result: ReturnType<typeof noteDose>) => {
  if ('refusal' in result) throw new Error(`refusé : ${result.refusal.reason}`)
  return result as GestureOutcome
}
const written = (result: ReturnType<typeof noteDose>) =>
  accepted(result).changes.map((change) =>
    change.action === 'delete'
      ? ['delete', change.id]
      : [change.action, change.line.status, change.line.dueOn, change.line.targetOn],
  )

describe('noter une prise (R5, R6, G19, G20)', () => {
  const given = (lines: Line[], today: string) => ({ settings: [vendredi()], lines, today })

  it('dose du vendredi 16 donnée le lundi 19, case cochée : la prise et un décalage ancré au 19', () => {
    const input = given([line('p1', 'given', '2026-10-09')], '2026-10-19')
    const result = noteDose(input, {
      due: due('2026-10-16'),
      status: 'given',
      givenOn: '2026-10-19',
      shiftsFollowing: true,
    })
    expect(accepted(result).offersShift).toBe(true)
    expect(written(result)).toEqual([
      ['create', 'given', '2026-10-16', null],
      ['create', 'shift', '2026-10-16', '2026-10-19'],
    ])
  })

  it('case décochée : la prise seule ; la dose du jour donnée le jour même : pas de case', () => {
    const input = given([], '2026-10-19')
    const alone = { due: due('2026-10-16'), status: 'given' as const, givenOn: '2026-10-19' }
    expect(written(noteDose(input, { ...alone, shiftsFollowing: false }))).toEqual([
      ['create', 'given', '2026-10-16', null],
    ])
    const sameDay = noteDose(given([], '2026-10-16'), {
      due: due('2026-10-16'),
      status: 'given',
      givenOn: '2026-10-16',
      shiftsFollowing: true,
    })
    expect(accepted(sameDay).offersShift).toBe(false)
  })

  it('R5 : dose du 16 donnée le mercredi 7, un intervalle avant : prise en plus sous sa date réelle', () => {
    const result = noteDose(given([line('p1', 'given', '2026-10-02')], '2026-10-07'), {
      due: due('2026-10-16'),
      status: 'given',
      givenOn: '2026-10-07',
      shiftsFollowing: true,
    })
    expect(written(result)).toEqual([['create', 'extra', '2026-10-07', null]])
  })

  it('R6 : une prise existe plus loin dans le traitement (réglage d’avant compris) : pas de case', () => {
    const p1 = setting('p1', '2026-10-02', WEEK)
    const p2 = setting('p2', '2026-10-16', WEEK, [], { startsOn: '2026-10-10' })
    const later = line('p1', 'given', '2026-10-23')
    const result = noteDose(
      { settings: [p1, p2], lines: [later], today: '2026-10-19' },
      {
        due: { settingId: 'p2', dueOn: '2026-10-16', dueTime: null },
        status: 'given',
        givenOn: '2026-10-19',
        shiftsFollowing: true,
      },
    )
    expect(accepted(result).offersShift).toBe(false)
    expect(accepted(result).changes).toHaveLength(1)
  })

  it('G10 : 8 h et 20 h, la prise de 8 h ne complète pas la journée : pas de case', () => {
    const p1 = setting('p1', '2026-10-01', TWO_DAYS, H)
    const result = noteDose(
      { settings: [p1], lines: [], today: '2026-10-04' },
      {
        due: { settingId: 'p1', dueOn: '2026-10-03', dueTime: '08:00' },
        status: 'given',
        givenOn: '2026-10-04',
        shiftsFollowing: true,
      },
    )
    expect(accepted(result).offersShift).toBe(false)
  })

  it('G19, Q2 a : dose du 26 reportée seule au 30 ; la dose du 16 donnée le 19, cochée, ferait passer le report : refusé', () => {
    const lines = [line('p1', 'postponed', '2026-10-23', null, '2026-10-27')]
    const result = noteDose(given(lines, '2026-10-19'), {
      due: due('2026-10-16'),
      status: 'given',
      givenOn: '2026-10-19',
      shiftsFollowing: true,
    })
    expect(result).toEqual({ refusal: { reason: 'passes-report', on: '2026-10-27' } })
  })

  it('Q2 c (gardée le 2026-10-12) : hebdo du vendredi, dose du 9 reportée seule au 13 ; la dose du 13 donnée le 14 : pas de case, la suite reste au 16', () => {
    const input = {
      settings: [vendredi()],
      lines: [
        line('p1', 'given', '2026-10-02'),
        line('p1', 'postponed', '2026-10-09', null, '2026-10-13'),
      ],
      today: '2026-10-14',
    }
    for (const shiftsFollowing of [true, false]) {
      const result = accepted(
        noteDose(input, {
          due: due('2026-10-13'),
          status: 'given',
          givenOn: '2026-10-14',
          shiftsFollowing,
        }),
      )
      expect(result.offersShift).toBe(false)
      expect(written(result)).toEqual([['create', 'given', '2026-10-13', null]])
    }
  })

  it('#786, R6 : toutes les 6 semaines à 20 h du 27 mars, fin le 10 mai, dose du 8 mai avancée seule au 23 avr. ; le 10 avr., dose du 27 mars donnée le 9, cochée : même refus par « Fait à une autre date » et par « C’est fait » puis « Changer la date »', () => {
    const p1 = setting('p1', '2026-03-27', { value: 6, unit: 'week' }, ['20:00'], {
      endsOn: '2026-05-10',
    })
    const input = {
      settings: [p1],
      lines: [line('p1', 'postponed', '2026-05-08', '20:00', '2026-04-23')],
      today: '2026-04-10',
    }
    const dose = due('2026-03-27', '20:00')
    const direct = noteDose(input, {
      due: dose,
      status: 'given',
      givenOn: '2026-04-09',
      shiftsFollowing: true,
    })
    const tapped = applied(
      input,
      accepted(
        noteDose(input, {
          due: dose,
          status: 'given',
          givenOn: '2026-04-10',
          shiftsFollowing: false,
        }),
      ).changes,
    )
    const prise = tapped.lines.find(({ status }) => status === 'given')!
    const redated = redateDose(tapped, {
      lineId: prise.id,
      givenOn: '2026-04-09',
      shiftsFollowing: true,
    })
    expect(direct).toEqual({ refusal: { reason: 'stuck-report', on: '2026-04-23' } })
    expect(redated).toEqual(direct)
  })

  it('G20, Q4 : fin le 30, dose du 16 donnée le lundi 19, cochée : la dose du 30 ne sera plus prévue', () => {
    const input = { settings: [vendredi({ endsOn: '2026-10-30' })], lines: [], today: '2026-10-19' }
    const result = noteDose(input, {
      due: due('2026-10-16'),
      status: 'given',
      givenOn: '2026-10-19',
      shiftsFollowing: true,
    })
    expect(accepted(result).lostToEnd).toEqual(['2026-10-30'])
  })

  it('G21 : le 28, dose du 23 notée « donnée le 20 » avec décalage : la dose du 27 devient en retard, et seulement elle', () => {
    const input = given([line('p1', 'given', '2026-10-09')], '2026-10-28')
    const result = noteDose(input, {
      due: due('2026-10-23'),
      status: 'given',
      givenOn: '2026-10-20',
      shiftsFollowing: true,
    })
    expect(accepted(result).newlyDue).toEqual([due('2026-10-27')])
  })

  it('TR-13 : une prise notée le 24 vise la dose du 23 ; notée avant toute échéance restante, la prochaine', () => {
    const input = given(
      [line('p1', 'given', '2026-10-02'), line('p1', 'given', '2026-10-09')],
      '2026-10-25',
    )
    expect(dueForDate(input, '2026-10-24', null)).toEqual(due('2026-10-23'))
    const ahead = given([line('p1', 'given', '2026-10-02')], '2026-10-04')
    expect(dueForDate(ahead, '2026-10-04', null)).toEqual(due('2026-10-09'))
    expect(() => dueForDate(ahead, '2026-10-05', null)).toThrow(RangeError)
  })

  it('échéance hors du calendrier (le samedi 3) ou partie avec son report (le 9) : refusée, sans lever', () => {
    const report = line('p1', 'postponed', '2026-10-09', null, '2026-10-10')
    const input = given([report], '2026-10-10')
    const noted = (dueOn: string) =>
      noteDose(input, {
        due: due(dueOn),
        status: 'given',
        givenOn: '2026-10-10',
        shiftsFollowing: false,
      })
    expect(noted('2026-10-03')).toEqual({ refusal: { reason: 'unknown-due' } })
    expect(noted('2026-10-09')).toEqual({ refusal: { reason: 'unknown-due' } })
  })
})
