import { describe, expect, it } from 'vitest'

import { dose, missed, period, treatment, written } from './treatment-fixtures'
import {
  DoseAlreadyLoggedError,
  doseChange,
  type NoteGesture,
} from '../logic/treatment-dose-change'
import { treatmentReadingOf } from '../logic/treatment-reading-adapter'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import type { Due } from '@/shared/domain/dose-calendar'

const OWNER = { treatmentId: 'metacam', animalId: 'luna' }
const TODAY = '2026-09-28'

function note(due: Due, status: 'given' | 'missed'): NoteGesture {
  return { kind: 'note', due, status, givenOn: due.dueOn, shiftsFollowing: false }
}

function given(due: Due): NoteGesture {
  return note(due, 'given')
}

function forgotten(due: Due): NoteGesture {
  return note(due, 'missed')
}

function log(history: TreatmentWithHistory, today: string, gestures: NoteGesture[]) {
  let next = 0
  return doseChange(history, treatmentReadingOf(history, today), { kind: 'log', gestures }, () => {
    next += 1
    return `nouvelle-${next}`
  })
}

function moment(history: TreatmentWithHistory, today: string) {
  const { view } = treatmentReadingOf(history, today)
  return {
    phase: view.phase,
    currentDoses: view.currentDoses,
    nextDue: view.nextDue,
    upcoming: view.upcoming({ limit: 12 }),
  }
}

/** Critère 1 de la spec : dernière prise le 2 sept., fiche ouverte le 28. */
const PANACUR = treatment(
  [period()],
  [dose('2026-09-01', '2026-09-02'), dose('2026-09-02', '2026-09-03')],
)

describe('doseChange — renseigner des doses en un lot', () => {
  it('écrit une prise par dose, donnée à sa date ou oubliée, avec la période de son échéance', () => {
    const [first, second] = treatmentReadingOf(PANACUR, TODAY).view.unloggedDoses as [Due, Due]

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
          targetOn: null,
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
          targetOn: null,
        },
      },
    ])
  })

  it('« Choisir les jours » sur 25 jours, 5 décochés : 20 données et 5 oubliées, plus rien à renseigner', () => {
    const unlogged = treatmentReadingOf(PANACUR, TODAY).view.unloggedDoses
    const gestures = unlogged.map((due, index) => (index < 5 ? forgotten(due) : given(due)))

    const { writes } = log(PANACUR, TODAY, gestures)
    const after = treatmentReadingOf(written(PANACUR, writes), TODAY).view

    expect(unlogged).toHaveLength(25)
    expect(writes).toHaveLength(25)
    expect(after.unloggedDoses).toEqual([])
    expect(after.history.filter(({ line }) => line.status === 'missed')).toHaveLength(5)
    expect(after.history.filter(({ line }) => line.status === 'given')).toHaveLength(22)
  })

  it('n’écrit rien sans dose', () => {
    expect(log(PANACUR, TODAY, []).writes).toEqual([])
  })

  it('refuse tout le lot quand une de ses doses est déjà notée', () => {
    const [first] = treatmentReadingOf(PANACUR, TODAY).view.unloggedDoses as [Due]
    const noted = { settingId: 'p-1', dueOn: '2026-09-02', dueTime: null }

    expect(() => log(PANACUR, TODAY, [given(first), given(noted)])).toThrow(DoseAlreadyLoggedError)
    expect(() => log(PANACUR, TODAY, [forgotten(noted)])).toThrow(DoseAlreadyLoggedError)
  })

  it('refuse une dose notée oubliée entre-temps', () => {
    const history = treatment(
      [period()],
      [dose('2026-09-01', '2026-09-02'), missed('2026-09-02', '2026-09-03')],
    )

    expect(() =>
      log(history, TODAY, [given({ settingId: 'p-1', dueOn: '2026-09-02', dueTime: null })]),
    ).toThrow(DoseAlreadyLoggedError)
  })

  it('accepte avec les doses non renseignées la dose du moment en retard', () => {
    const history = treatment(
      [period({ frequency: { value: 1, unit: 'week' } })],
      [dose('2026-09-01', '2026-09-08')],
    )
    const { view } = treatmentReadingOf(history, '2026-09-24')
    const dues = [...view.unloggedDoses, ...view.currentDoses]

    const { writes } = log(history, '2026-09-24', dues.map(given))
    const after = treatmentReadingOf(written(history, writes), '2026-09-24').view

    expect(dues.map(({ dueOn }) => dueOn)).toEqual(['2026-09-08', '2026-09-15', '2026-09-22'])
    expect(after.unloggedDoses).toEqual([])
    expect(after.currentDoses.map(({ dueOn }) => dueOn)).toEqual(['2026-09-29'])
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
    const unlogged = treatmentReadingOf(history, today).view.unloggedDoses
    const gestures = unlogged.map((due, index) => (index % 3 === 1 ? forgotten(due) : given(due)))

    const { writes } = log(history, today, gestures)
    const after = written(history, writes)

    expect(unlogged.length).toBeGreaterThan(0)
    expect(writes.every((write) => write.action === 'create')).toBe(true)
    expect(treatmentReadingOf(after, today).view.unloggedDoses).toEqual([])
    expect(moment(after, today)).toEqual(before)
  })

  it('une à une, dans le désordre, non plus', () => {
    let history = PANACUR
    const before = moment(history, TODAY)
    const unlogged = [...treatmentReadingOf(history, TODAY).view.unloggedDoses].reverse()

    for (const due of unlogged) {
      history = written(history, log(history, TODAY, [given(due)]).writes)
      expect(moment(history, TODAY)).toEqual(before)
    }
  })
})
