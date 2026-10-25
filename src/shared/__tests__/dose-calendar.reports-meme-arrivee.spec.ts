// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  moveBounds,
  moveDose,
  noteDose,
  removalRefusal,
  treatmentView,
  type Due,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { given, moved, on, recorded } from './dose-calendar.reglage-corrige.aides'
import { keys, line, setting } from './dose-calendar.v2.aides'

// Q51 (#1274) : Milo, tous les 3 jours dès le 1er mars, les doses du 1er données ; le 4, une dose
// reportée au 6 sans la case, puis 8 h donnée le 3 avec la case : le 6 est aussi une journée de la grille.
function milo(times: string[], reportedAt: string, givenFirst: string[] = []): TreatmentViewInput {
  let input: TreatmentViewInput = {
    settings: [setting('p1', '2026-03-01', { value: 3, unit: 'day' }, times)],
    lines: times.map((time) => line('p1', 'given', '2026-03-01', time)),
    today: '2026-03-04',
  }
  for (const time of givenFirst) input = given(input, '2026-03-04', time)
  input = moved(input, '2026-03-04', reportedAt, '2026-03-06', false)
  const due: Due = { settingId: 'p1', dueOn: '2026-03-04', dueTime: '08:00' }
  const result = noteDose(input, {
    due,
    status: 'given',
    givenOn: '2026-03-03',
    shiftsFollowing: true,
  })
  if ('refusal' in result) throw new Error(JSON.stringify(result))
  return on(recorded(input, result.changes), '2026-03-06')
}

const at = (dueOn: string, dueTime: string): Due => ({ settingId: 'p1', dueOn, dueTime })

function played(input: TreatmentViewInput, due: Due, to: string, shiftsFollowing: boolean) {
  const result = moveDose(input, { due, to, shiftsFollowing })
  if ('refusal' in result) throw new Error(JSON.stringify(result))
  return recorded(input, result.changes)
}

const reportFrom = (input: TreatmentViewInput, dueOn: string) =>
  input.lines.find((each) => each.status === 'postponed' && each.dueOn === dueOn)!.id

const calendar = (input: TreatmentViewInput) =>
  keys(
    treatmentView(input)
      .slots('2026-03-05', '2026-03-13')
      .map(({ due }) => due),
  )

const SHARED = { refusal: { reason: 'arrival-shared', on: '2026-03-04' } }

describe('deux reports arrivés le même jour ne se séparent pas (Q51, C1)', () => {
  const twoAt7 = played(
    milo(['08:00', '20:00'], '20:00'),
    at('2026-03-06', '08:00'),
    '2026-03-07',
    true,
  )

  it('8 h du 6 au 7 avec la case : le 7 à 8 h et 20 h, puis le 10 et le 13', () => {
    expect(calendar(twoAt7)).toEqual([
      '2026-03-07 08:00',
      '2026-03-07 20:00',
      '2026-03-10 08:00',
      '2026-03-10 20:00',
      '2026-03-13 08:00',
      '2026-03-13 20:00',
    ])
  })

  it('« Supprimer » le report du 6 est refusé : « Supprime d’abord le report du 4. » ; celui du 4 de même', () => {
    expect(removalRefusal(twoAt7, reportFrom(twoAt7, '2026-03-06'))).toEqual(SHARED.refusal)
    expect(removalRefusal(twoAt7, reportFrom(twoAt7, '2026-03-04'))).toEqual({
      reason: 'arrival-shared',
      on: '2026-03-06',
    })
  })

  const twoAt8 = played(
    milo(['08:00', '20:00'], '20:00'),
    at('2026-03-06', '08:00'),
    '2026-03-08',
    false,
  )

  it('8 h du 6 au 8 sans la case, puis « Changer la date » de 8 h du 8 vers le 7, le 6 ou le 9 : refusé', () => {
    expect(calendar(twoAt8).slice(0, 2)).toEqual(['2026-03-08 08:00', '2026-03-08 20:00'])
    for (const to of ['2026-03-07', '2026-03-06', '2026-03-09']) {
      for (const shiftsFollowing of [false, true]) {
        expect(moveDose(twoAt8, { due: at('2026-03-08', '08:00'), to, shiftsFollowing })).toEqual({
          refusal: { reason: 'arrival-shared', on: '2026-03-04' },
        })
      }
    }
    expect(moveBounds(twoAt8, at('2026-03-08', '20:00'), true)).toEqual({
      refusal: { reason: 'arrival-shared', on: '2026-03-04' },
    })
  })
})

describe('le report qui arrive ne suit la journée que s’il n’apporte aucune heure plus tôt que l’heure touchée (Q51, C2)', () => {
  const H3 = ['08:00', '14:00', '20:00']

  it('14 h du 4 reportée au 6 (14 h et 20 h) : le 6 à 8 h, 14 h et 20 h ; 20 h du 6 au 7 est refusé, avec ou sans la case', () => {
    const input = milo(H3, '14:00')

    expect(calendar(input).slice(0, 3)).toEqual([
      '2026-03-06 08:00',
      '2026-03-06 14:00',
      '2026-03-06 20:00',
    ])
    for (const shiftsFollowing of [true, false]) {
      expect(
        moveDose(input, { due: at('2026-03-06', '20:00'), to: '2026-03-07', shiftsFollowing }),
      ).toEqual(SHARED)
    }
  })

  it('14 h du 6 au 7 avec la case : le 6 garde 8 h, le 7 à 14 h et 20 h ; 8 h du 6 : le 7 à 8 h, 14 h et 20 h', () => {
    const input = milo(H3, '14:00')

    expect(calendar(played(input, at('2026-03-06', '14:00'), '2026-03-07', true))).toEqual([
      '2026-03-06 08:00',
      '2026-03-07 14:00',
      '2026-03-07 20:00',
      '2026-03-10 08:00',
      '2026-03-10 14:00',
      '2026-03-10 20:00',
      '2026-03-13 08:00',
      '2026-03-13 14:00',
      '2026-03-13 20:00',
    ])
    expect(calendar(played(input, at('2026-03-06', '08:00'), '2026-03-07', true))).toEqual([
      '2026-03-07 08:00',
      '2026-03-07 14:00',
      '2026-03-07 20:00',
      '2026-03-10 08:00',
      '2026-03-10 14:00',
      '2026-03-10 20:00',
      '2026-03-13 08:00',
      '2026-03-13 14:00',
      '2026-03-13 20:00',
    ])
  })

  it('variante : 20 h du 4 donnée avant le report, qui n’emporte que 14 h : 20 h du 6 au 7 est refusé', () => {
    const input = milo(H3, '14:00', ['20:00'])

    expect(calendar(input).slice(0, 3)).toEqual([
      '2026-03-06 08:00',
      '2026-03-06 14:00',
      '2026-03-06 20:00',
    ])
    expect(
      moveDose(input, { due: at('2026-03-06', '20:00'), to: '2026-03-07', shiftsFollowing: true }),
    ).toEqual(SHARED)
  })
})
