import { describe, expect, it } from 'vitest'

import { dose, missed, period, postponed, treatment, written } from './treatment-fixtures'
import { DoseAlreadyLoggedError, doseChange } from '../logic/treatment-dose-writes'
import { treatmentScheduleOf } from '../logic/treatment-schedule'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import type { DoseGesture, Due } from '@/shared/domain/treatment-schedule'

const OWNER = { treatmentId: 'metacam', animalId: 'luna' }
const TODAY = '2026-09-28'

function given(due: Due): DoseGesture {
  return { kind: 'given', due, givenOn: due.dueOn }
}

function forgotten(due: Due): DoseGesture {
  return { kind: 'missed', due }
}

function log(history: TreatmentWithHistory, today: string, gestures: DoseGesture[]) {
  let next = 0
  return doseChange(history, treatmentScheduleOf(history, today), { kind: 'log', gestures }, () => {
    next += 1
    return `nouvelle-${next}`
  })
}

function moment(history: TreatmentWithHistory, today: string) {
  const schedule = treatmentScheduleOf(history, today)
  return {
    phase: schedule.phase,
    currentDoses: schedule.currentDoses,
    nextDue: schedule.nextDue,
    upcoming: schedule.upcoming(12),
  }
}

/** Critère 1 de la spec : dernière prise le 2 sept., fiche ouverte le 28. */
const PANACUR = treatment(
  [period()],
  [dose('2026-09-01', '2026-09-02'), dose('2026-09-02', '2026-09-03')],
)

describe('doseChange — renseigner des doses en un lot', () => {
  it('écrit une prise par dose, donnée à sa date ou oubliée, avec la période de son échéance', () => {
    const [first, second] = treatmentScheduleOf(PANACUR, TODAY).unloggedDoses as [Due, Due]

    const { writes, alreadyGivenOn } = log(PANACUR, TODAY, [given(first), forgotten(second)])

    expect(alreadyGivenOn).toBeNull()
    expect(writes).toEqual([
      {
        action: 'create',
        id: 'nouvelle-1',
        ...OWNER,
        dose: {
          periodId: 'p-1',
          dueOn: '2026-09-03',
          dueTime: null,
          givenOn: '2026-09-03',
          status: 'given',
          nextDueDate: '2026-09-04',
        },
      },
      {
        action: 'create',
        id: 'nouvelle-2',
        ...OWNER,
        dose: {
          periodId: 'p-1',
          dueOn: '2026-09-04',
          dueTime: null,
          givenOn: null,
          status: 'missed',
          nextDueDate: '2026-09-05',
        },
      },
    ])
  })

  it('« Choisir les jours » sur 25 jours, 5 décochés : 20 données et 5 oubliées, plus rien à renseigner', () => {
    const unlogged = treatmentScheduleOf(PANACUR, TODAY).unloggedDoses
    const gestures = unlogged.map((due, index) => (index < 5 ? forgotten(due) : given(due)))

    const { writes } = log(PANACUR, TODAY, gestures)
    const after = treatmentScheduleOf(written(PANACUR, writes), TODAY)

    expect(unlogged).toHaveLength(25)
    expect(writes).toHaveLength(25)
    expect(after.unloggedDoses).toEqual([])
    expect(after.doses.filter(({ status }) => status === 'missed')).toHaveLength(5)
    expect(after.doses.filter(({ status }) => status === 'given')).toHaveLength(22)
  })

  it('n’écrit rien sans dose', () => {
    expect(log(PANACUR, TODAY, []).writes).toEqual([])
  })

  it('refuse tout le lot quand une de ses doses est déjà notée', () => {
    const [first] = treatmentScheduleOf(PANACUR, TODAY).unloggedDoses as [Due]
    const noted = { periodId: 'p-1', dueOn: '2026-09-02', dueTime: null }

    expect(() => log(PANACUR, TODAY, [given(first), given(noted)])).toThrow(DoseAlreadyLoggedError)
    expect(() => log(PANACUR, TODAY, [forgotten(noted)])).toThrow(DoseAlreadyLoggedError)
  })

  it('refuse une dose notée oubliée entre-temps', () => {
    const history = treatment(
      [period()],
      [dose('2026-09-01', '2026-09-02'), missed('2026-09-02', '2026-09-03')],
    )

    expect(() =>
      log(history, TODAY, [given({ periodId: 'p-1', dueOn: '2026-09-02', dueTime: null })]),
    ).toThrow(DoseAlreadyLoggedError)
  })

  it('accepte avec les doses non renseignées la dose du moment en retard', () => {
    const history = treatment(
      [period({ frequency: { value: 1, unit: 'week' } })],
      [dose('2026-09-01', '2026-09-08')],
    )
    const schedule = treatmentScheduleOf(history, '2026-09-24')
    const dues = [...schedule.unloggedDoses, ...schedule.currentDoses]

    const { writes } = log(history, '2026-09-24', dues.map(given))
    const after = treatmentScheduleOf(written(history, writes), '2026-09-24')

    expect(dues.map(({ dueOn }) => dueOn)).toEqual(['2026-09-08', '2026-09-15', '2026-09-22'])
    expect(after.unloggedDoses).toEqual([])
    expect(after.currentDoses.map(({ dueOn }) => dueOn)).toEqual(['2026-09-29'])
  })

  it('emporte les lignes sans effet avec l’écriture', () => {
    const weekly = period({ frequency: { value: 1, unit: 'week' } })
    const history = treatment(
      [weekly],
      [
        dose('2026-09-01', '2026-09-08'),
        postponed('2026-09-22', '2026-09-22', { id: 'sans-effet' }),
      ],
    )
    const schedule = treatmentScheduleOf(history, TODAY)

    const { writes } = log(history, TODAY, schedule.unloggedDoses.map(given))

    expect(schedule.staleDoseIds).toEqual(['sans-effet'])
    expect(writes.at(-1)).toEqual({ action: 'delete', id: 'sans-effet' })
    expect(treatmentScheduleOf(written(history, writes), TODAY).unloggedDoses).toEqual([])
  })
})

describe('renseigner ne déplace ni la dose du moment ni les échéances à venir (TR-18)', () => {
  const MATIN_ET_SOIR = period({ times: ['08:00', '20:00'] })
  const HEBDO = period({ frequency: { value: 1, unit: 'week' } })
  const cases: [string, TreatmentWithHistory, string][] = [
    ['quotidien, 25 jours sans prise', PANACUR, TODAY],
    ['jamais noté', treatment([period()]), TODAY],
    [
      'deux heures par jour',
      treatment([MATIN_ET_SOIR], [dose('2026-09-01', '2026-09-01', { dueTime: '08:00' })]),
      TODAY,
    ],
    [
      'fréquence changée entre deux prises',
      treatment(
        [
          period({ ...HEBDO, id: 'p-1', startsOn: '2026-07-07', firstDueOn: '2026-07-07' }),
          period({
            id: 'p-2',
            startsOn: '2026-09-29',
            firstDueOn: '2026-09-29',
            frequency: { value: 15, unit: 'day' },
            createdAt: '2026-09-29T08:00:00.000Z',
          }),
        ],
        [dose('2026-07-07', '2026-07-14'), dose('2026-09-08', '2026-09-15')],
      ),
      '2026-10-20',
    ],
    [
      'hebdomadaire, dose du moment en retard',
      treatment([HEBDO], [dose('2026-09-01', '2026-09-08')]),
      '2026-09-24',
    ],
    [
      'mensuel démarré un 31',
      treatment(
        [
          period({
            frequency: { value: 1, unit: 'month' },
            startsOn: '2026-01-31',
            firstDueOn: '2026-01-31',
          }),
        ],
        [dose('2026-01-31', '2026-02-28')],
      ),
      '2026-09-10',
    ],
    [
      'tous les 2 jours à deux heures, une prise au milieu',
      treatment(
        [period({ times: ['08:00', '20:00'], frequency: { value: 2, unit: 'day' } })],
        [dose('2026-09-11', '2026-09-11', { dueTime: '08:00' })],
      ),
      TODAY,
    ],
    [
      'arrêté',
      treatment([period({ stoppedOn: '2026-09-20' })], [dose('2026-09-01', '2026-09-02')]),
      TODAY,
    ],
    [
      'date de fin passée',
      treatment([period({ endsOn: '2026-09-10' })], [dose('2026-09-01', '2026-09-02')]),
      TODAY,
    ],
  ]

  it.each(cases)('%s', (_, history, today) => {
    const before = moment(history, today)
    const unlogged = treatmentScheduleOf(history, today).unloggedDoses
    const gestures = unlogged.map((due, index) => (index % 3 === 1 ? forgotten(due) : given(due)))

    const { writes } = log(history, today, gestures)
    const after = written(history, writes)

    expect(unlogged.length).toBeGreaterThan(0)
    expect(writes.every((write) => write.action === 'create')).toBe(true)
    expect(treatmentScheduleOf(after, today).unloggedDoses).toEqual([])
    expect(moment(after, today)).toEqual(before)
  })

  it('une à une, dans le désordre, non plus', () => {
    let history = PANACUR
    const before = moment(history, TODAY)
    const unlogged = [...treatmentScheduleOf(history, TODAY).unloggedDoses].reverse()

    for (const due of unlogged) {
      history = written(history, log(history, TODAY, [given(due)]).writes)
      expect(moment(history, TODAY)).toEqual(before)
    }
  })
})
