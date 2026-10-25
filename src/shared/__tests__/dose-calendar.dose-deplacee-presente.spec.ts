// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  moveDose,
  noteDose,
  treatmentView,
  type Due,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { moved, on, recorded } from './dose-calendar.reglage-corrige.aides'
import { H, keys, line, setting } from './dose-calendar.v2.aides'

// #1274 : Milo, tous les 3 jours à 8 h et 20 h dès le 1er mars, les doses du 1er données. Le 4, 20 h
// reportée au 6 sans la case, puis 8 h marquée « Fait » le 3 avec la case : le 6 à 8 h et 20 h.
function milo(): TreatmentViewInput {
  const start: TreatmentViewInput = {
    settings: [setting('p1', '2026-03-01', { value: 3, unit: 'day' }, H)],
    lines: [line('p1', 'given', '2026-03-01', '08:00'), line('p1', 'given', '2026-03-01', '20:00')],
    today: '2026-03-04',
  }
  const reported = moved(start, '2026-03-04', '20:00', '2026-03-06', false)
  const due: Due = { settingId: 'p1', dueOn: '2026-03-04', dueTime: '08:00' }
  const result = noteDose(reported, {
    due,
    status: 'given',
    givenOn: '2026-03-03',
    shiftsFollowing: true,
  })
  if ('refusal' in result) throw new Error(JSON.stringify(result))
  return on(recorded(reported, result.changes), '2026-03-06')
}

const sixAt = (dueTime: string): Due => ({ settingId: 'p1', dueOn: '2026-03-06', dueTime })

function movedTo(dueTime: string, shiftsFollowing: boolean) {
  const input = milo()
  const result = moveDose(input, { due: sixAt(dueTime), to: '2026-03-07', shiftsFollowing })
  if ('refusal' in result) throw new Error(JSON.stringify(result))
  return { input, after: recorded(input, result.changes) }
}

const calendar = (input: TreatmentViewInput) =>
  keys(
    treatmentView(input)
      .slots('2026-03-05', '2026-03-13')
      .map(({ due }) => due),
  )

const shiftOfPrise = (input: TreatmentViewInput) =>
  input.lines
    .filter(({ status, dueOn }) => status === 'shift' && dueOn === '2026-03-04')
    .map(({ dueTime, targetOn }) => [dueTime, targetOn])

describe('« Prochaine dose » sur une journée qui reçoit aussi un report : la journée part entière (R7, Q50, #1274)', () => {
  it('le 6, la fiche montre 8 h et 20 h, puis le 9 et le 12', () => {
    const view = treatmentView(milo())

    expect(keys(view.currentDoses)).toEqual(['2026-03-06 08:00', '2026-03-06 20:00'])
    expect(keys(view.upcoming({ to: '2026-03-12' }))).toEqual([
      '2026-03-06 08:00',
      '2026-03-06 20:00',
      '2026-03-09 08:00',
      '2026-03-09 20:00',
      '2026-03-12 08:00',
      '2026-03-12 20:00',
    ])
  })

  it('8 h du 6 au 7 avec la case : le 7 à 8 h et 20 h, puis le 10 et le 13 ; le décalage du 4 reste à la prise de 8 h', () => {
    const { after } = movedTo('08:00', true)

    expect(calendar(after)).toEqual([
      '2026-03-07 08:00',
      '2026-03-07 20:00',
      '2026-03-10 08:00',
      '2026-03-10 20:00',
      '2026-03-13 08:00',
      '2026-03-13 20:00',
    ])
    expect(shiftOfPrise(after)).toEqual([['08:00', '2026-03-03']])
    expect(
      after.lines
        .filter(({ status }) => status === 'postponed')
        .map(({ dueOn, dueTime, targetOn }) => [dueOn, dueTime, targetOn]),
    ).toEqual([
      ['2026-03-04', '20:00', '2026-03-07'],
      ['2026-03-06', '08:00', '2026-03-07'],
    ])
  })

  it('8 h du 6 au 7 sans la case : le 7 à 8 h et 20 h, puis le 9 et le 12', () => {
    const { input, after } = movedTo('08:00', false)

    expect(calendar(after)).toEqual([
      '2026-03-07 08:00',
      '2026-03-07 20:00',
      '2026-03-09 08:00',
      '2026-03-09 20:00',
      '2026-03-12 08:00',
      '2026-03-12 20:00',
    ])
    expect(shiftOfPrise(after)).toEqual(shiftOfPrise(input))
  })

  it('20 h du 6 au 7 avec la case : le 6 garde 8 h, le 7 à 20 h, puis le 10 et le 13', () => {
    const { after } = movedTo('20:00', true)

    expect(calendar(after)).toEqual([
      '2026-03-06 08:00',
      '2026-03-07 20:00',
      '2026-03-10 08:00',
      '2026-03-10 20:00',
      '2026-03-13 08:00',
      '2026-03-13 20:00',
    ])
    expect(shiftOfPrise(after)).toEqual([['08:00', '2026-03-03']])
  })
})
