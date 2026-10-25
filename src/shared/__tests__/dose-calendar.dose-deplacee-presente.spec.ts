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

const shownOn = (input: TreatmentViewInput, day: string) =>
  keys(
    treatmentView(input)
      .slots(day, day)
      .map(({ due }) => due),
  )

describe('« Prochaine dose » sur une journée qui reçoit aussi un report : aucune dose ne disparaît (R7, R11, #1274)', () => {
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

  // Trou connu : le report du 4 et le décalage de la prise de 8 h du 4 sont réécrits vers le 7.
  it.fails('8 h du 6 au 7 avec la case : 8 h et 20 h arrivent le 7, ou le geste est refusé', () => {
    const input = milo()
    const result = moveDose(input, { due: sixAt('08:00'), to: '2026-03-07', shiftsFollowing: true })

    const after =
      'refusal' in result ? 'refusé' : shownOn(recorded(input, result.changes), '2026-03-07')
    expect([['2026-03-07 08:00', '2026-03-07 20:00'], 'refusé']).toContainEqual(after)
  })

  it.fails('20 h du 6 au 7 avec la case : le 6 garde 8 h, ou le geste est refusé', () => {
    const input = milo()
    const result = moveDose(input, { due: sixAt('20:00'), to: '2026-03-07', shiftsFollowing: true })

    const after =
      'refusal' in result ? 'refusé' : shownOn(recorded(input, result.changes), '2026-03-06')
    expect([['2026-03-06 08:00'], 'refusé']).toContainEqual(after)
  })
})
