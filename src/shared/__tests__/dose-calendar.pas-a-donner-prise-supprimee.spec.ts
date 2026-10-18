// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { treatmentView, type TreatmentViewInput } from '../domain/dose-calendar'
import { referenceReading } from '../domain/dose-calendar/reference-model'
import {
  edited,
  given,
  givenAsShown,
  moved,
  on,
  readings,
  removed,
} from './dose-calendar.reglage-corrige.aides'
import { WEEK, setting } from './dose-calendar.v2.aides'
import cases from './fixtures/dose-calendar-pas-a-donner-prise-supprimee.json'

type Case = { name: string; back: string; carnet: TreatmentViewInput }

const key = (due: { dueOn: string; dueTime: string | null }) =>
  due.dueTime === null ? due.dueOn : `${due.dueOn} ${due.dueTime}`

describe('C2 : une journée ne sort en entier que si toutes ses doses portent une ligne « pas à donner »', () => {
  it('Milo : la prise du 11 à 8 h supprimée, la dose revient en retard ; 20 h, listée, reste retirée ; le report du 9 reste en vigueur', () => {
    const start = {
      settings: [
        setting('s1', '2026-03-02', WEEK, ['08:00', '20:00'], {
          createdAt: '2026-02-01T00:00:00.000Z',
        }),
      ],
      lines: [],
      today: '2026-03-02',
    }
    let carnet: TreatmentViewInput = given(
      given(start, '2026-03-02', '08:00'),
      '2026-03-02',
      '20:00',
    )
    carnet = moved(on(carnet, '2026-03-08'), '2026-03-09', '08:00', '2026-03-11', false)
    carnet = edited(on(carnet, '2026-03-10'), {
      frequency: WEEK,
      times: ['09:00', '21:00'],
      endsOn: null,
    })
    carnet = givenAsShown(on(carnet, '2026-03-11'), '2026-03-11', '08:00')
    carnet = edited(
      on(carnet, '2026-03-13'),
      { frequency: WEEK, times: ['10:00', '22:00'], endsOn: null },
      'correct',
    )
    carnet = removed(on(carnet, '2026-03-14'), '2026-03-11', '08:00')

    const expected = {
      phase: 'overdue',
      moment: ['2026-03-11 08:00'],
      aRenseigner: [],
      ensuite: ['2026-03-16 10:00', '2026-03-16 22:00', '2026-03-23 10:00'],
    }
    expect(readings(carnet)).toEqual({ moteur: expected, reference: expected })
    const report = treatmentView(carnet).history.find(({ line }) => line.status === 'postponed')!
    expect(report.effect.kind).not.toBe('idle')
  })

  it.each((cases as Case[]).map((each) => [each.name, each.back, each.carnet] as const))(
    'graine %s : la prise du %s supprimée, sa dose revient à donner',
    (_, back, carnet) => {
      const view = treatmentView(carnet)
      const reference = referenceReading({ ...carnet, until: '2026-06-30' })
      expect([...view.unloggedDoses, ...view.currentDoses].map(key)).toContain(back)
      expect(view.unloggedDoses.map(key)).toEqual(reference.unlogged)
      expect(view.currentDoses.map(key)).toEqual(reference.current)
    },
  )
})
