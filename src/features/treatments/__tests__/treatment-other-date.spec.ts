import { afterEach, describe, expect, it } from 'vitest'

import { dose, missed, period, plain, treatment } from './treatment-fixtures'
import {
  givenDays,
  isDayNoted,
  momentDue,
  otherDatePlan,
  otherDateTexts,
  sheetHours,
} from '../logic/treatment-other-date'
import { treatmentScheduleOf } from '../logic/treatment-schedule'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import i18n, { applyLocale } from '@/core/i18n'

const t = i18n.global.t
const MATIN_ET_SOIR = period({ times: ['20:00', '08:00'] })
const NEUF_HEURES = period({
  startsOn: '2026-09-20',
  firstDueOn: '2026-09-20',
  times: ['09:00'],
})
const PUIS_MATIN_ET_SOIR = period({
  id: 'p-2',
  startsOn: '2026-09-28',
  firstDueOn: '2026-09-28',
  times: ['08:00', '20:00'],
  createdAt: '2026-09-28T08:00:00.000Z',
})

function plan(book: TreatmentWithHistory, today: string, givenOn: string) {
  return plain(otherDatePlan(t, treatmentScheduleOf(book, today), givenOn))
}

afterEach(() => applyLocale('fr'))

describe('otherDatePlan — « À quelle heure ? » (planche A · V3 ter ter)', () => {
  it('propose chaque heure du jour, dans l’ordre, avec l’échéance qu’elle vise', () => {
    const book = treatment(
      [MATIN_ET_SOIR],
      [dose('2026-09-27', '2026-09-28', { dueTime: '20:00' })],
    )

    expect(plan(book, '2026-09-28', '2026-09-28')).toEqual({
      due: null,
      hours: [
        {
          time: '08:00',
          label: '8 h',
          detail: 'Dose de 8 h · pas encore notée',
          due: { periodId: 'p-1', dueOn: '2026-09-28', dueTime: '08:00' },
        },
        {
          time: '20:00',
          label: '20 h',
          detail: 'Dose de 20 h · pas encore notée',
          due: { periodId: 'p-1', dueOn: '2026-09-28', dueTime: '20:00' },
        },
      ],
    })
  })

  it('ne propose pas de noter une heure déjà donnée ce jour-là (TR-21)', () => {
    const book = treatment(
      [MATIN_ET_SOIR],
      [
        dose('2026-09-27', '2026-09-27', { dueTime: '08:00' }),
        missed('2026-09-27', '2026-09-28', { dueTime: '20:00' }),
      ],
    )

    expect(plan(book, '2026-09-28', '2026-09-27').hours).toEqual([
      { time: '08:00', label: '8 h', detail: 'Dose de 8 h · déjà notée', due: null },
      {
        time: '20:00',
        label: '20 h',
        detail: 'Dose de 20 h · notée oubliée',
        due: { periodId: 'p-1', dueOn: '2026-09-27', dueTime: '20:00' },
      },
    ])
  })

  it('propose les heures de la période qui couvre le jour choisi, pas celles de la période en cours', () => {
    const book = treatment([NEUF_HEURES, PUIS_MATIN_ET_SOIR])

    expect(plan(book, '2026-09-29', '2026-09-24')).toEqual({
      hours: [],
      due: { periodId: 'p-1', dueOn: '2026-09-24', dueTime: '09:00' },
    })
    expect(plan(book, '2026-09-29', '2026-09-28').hours.map(({ due }) => due)).toEqual([
      { periodId: 'p-2', dueOn: '2026-09-28', dueTime: '08:00' },
      { periodId: 'p-2', dueOn: '2026-09-28', dueTime: '20:00' },
    ])
  })

  it('ne présente jamais comme dose du jour choisi une échéance d’un autre jour', () => {
    const unJourSurDeux = treatment([
      period({ frequency: { value: 2, unit: 'day' }, times: ['08:00', '20:00'] }),
    ])

    expect(plan(unJourSurDeux, '2026-09-04', '2026-09-04')).toEqual({
      hours: [],
      due: { periodId: 'p-1', dueOn: '2026-09-03', dueTime: '20:00' },
    })
  })

  it('sans échéance ce jour-là, une prise en avance vise la prochaine (TR-13)', () => {
    const mensuel = treatment(
      [period({ frequency: { value: 1, unit: 'month' } })],
      [dose('2026-09-01', '2026-10-01')],
    )

    expect(plan(mensuel, '2026-09-20', '2026-09-20')).toEqual({
      hours: [],
      due: { periodId: 'p-1', dueOn: '2026-10-01', dueTime: null },
    })
  })

  it('ne note rien pour un jour dont la seule échéance est déjà donnée', () => {
    const book = treatment([period()], [dose('2026-09-01', '2026-09-02')])

    expect(plan(book, '2026-09-02', '2026-09-01')).toEqual({ hours: [], due: null })
  })
})

describe('givenDays', () => {
  it('rend les jours dont toutes les échéances sont données', () => {
    const book = treatment(
      [period()],
      [
        dose('2026-09-01', '2026-09-02'),
        missed('2026-09-02', '2026-09-03'),
        dose('2026-09-03', '2026-09-04', { givenOn: '2026-09-04' }),
      ],
    )

    expect(givenDays(treatmentScheduleOf(book, '2026-09-04'))).toEqual(['2026-09-01', '2026-09-03'])
  })

  it('garde un jour d’une ancienne période à plusieurs heures dont une seule est donnée', () => {
    const book = treatment(
      [
        period({ times: ['08:00', '20:00'] }),
        period({
          id: 'p-2',
          startsOn: '2026-09-03',
          firstDueOn: '2026-09-03',
          times: ['09:00'],
          createdAt: '2026-09-03T08:00:00.000Z',
        }),
      ],
      [
        dose('2026-09-01', '2026-09-01', { dueTime: '08:00' }),
        dose('2026-09-02', '2026-09-02', { dueTime: '08:00' }),
        dose('2026-09-02', '2026-09-03', { dueTime: '20:00' }),
      ],
    )

    expect(givenDays(treatmentScheduleOf(book, '2026-09-04'))).toEqual(['2026-09-02'])
  })
})

describe('momentDue — ce que notent la feuille « À faire » et une notification', () => {
  const due = (book: TreatmentWithHistory, today: string, givenOn = today) =>
    momentDue(treatmentScheduleOf(book, today), givenOn, today)

  it('à plusieurs heures, la première heure du jour encore sans prise', () => {
    const book = treatment([MATIN_ET_SOIR])

    expect(due(book, '2026-09-01')).toEqual({
      due: { periodId: 'p-1', dueOn: '2026-09-01', dueTime: '08:00' },
    })
    expect(
      due(
        treatment([MATIN_ET_SOIR], [dose('2026-09-01', '2026-09-01', { dueTime: '08:00' })]),
        '2026-09-01',
      ),
    ).toEqual({ due: { periodId: 'p-1', dueOn: '2026-09-01', dueTime: '20:00' } })
  })

  it('aujourd’hui, ne vise que des échéances sans prise : une oubliée ne repasse jamais en donnée', () => {
    const matinOublie = treatment(
      [MATIN_ET_SOIR],
      [missed('2026-09-01', '2026-09-01', { dueTime: '08:00' })],
    )
    const soirDonne = treatment(
      [MATIN_ET_SOIR],
      [
        missed('2026-09-01', '2026-09-01', { dueTime: '08:00' }),
        dose('2026-09-01', '2026-09-02', { dueTime: '20:00' }),
      ],
    )
    const toutOublie = treatment(
      [MATIN_ET_SOIR],
      [
        missed('2026-09-01', '2026-09-01', { dueTime: '08:00' }),
        missed('2026-09-01', '2026-09-02', { dueTime: '20:00' }),
      ],
    )

    expect(due(matinOublie, '2026-09-01')).toEqual({
      due: { periodId: 'p-1', dueOn: '2026-09-01', dueTime: '20:00' },
    })
    expect(due(soirDonne, '2026-09-01')).toEqual({ alreadyGivenOn: '2026-09-01' })
    expect(due(toutOublie, '2026-09-01')).toEqual({ dayNoted: true })
  })

  it('un autre jour, choisi dans la feuille, un oubli repasse en donnée (TR-22)', () => {
    const oublie = treatment([period()], [missed('2026-09-01', '2026-09-02')])

    expect(due(oublie, '2026-09-03', '2026-09-01')).toEqual({
      due: { periodId: 'p-1', dueOn: '2026-09-01', dueTime: null },
    })
  })

  it('la dose en retard, pas le jour de la prise', () => {
    const hebdo = treatment([
      period({
        frequency: { value: 1, unit: 'week' },
        startsOn: '2026-09-25',
        firstDueOn: '2026-09-25',
      }),
    ])

    expect(due(hebdo, '2026-10-01')).toEqual({
      due: { periodId: 'p-1', dueOn: '2026-09-25', dueTime: null },
    })
  })

  it('dit « déjà notée » quand tout le jour est donné, sans viser la dose suivante', () => {
    const book = treatment([period()], [dose('2026-09-01', '2026-09-02')])

    expect(due(book, '2026-09-01')).toEqual({ alreadyGivenOn: '2026-09-01' })
    expect(due(book, '2026-09-02', '2026-09-01')).toEqual({ alreadyGivenOn: '2026-09-01' })
  })

  it('une autre date vise la première échéance sans prise de ce jour, sinon la règle sans heure', () => {
    const book = treatment(
      [MATIN_ET_SOIR],
      [dose('2026-09-01', '2026-09-02', { dueTime: '20:00' })],
    )

    expect(due(book, '2026-09-03', '2026-09-01')).toEqual({
      due: { periodId: 'p-1', dueOn: '2026-09-01', dueTime: '08:00' },
    })
  })

  it('ne note pas la dose suivante en avance quand une prise a déjà été donnée aujourd’hui', () => {
    const hebdo = treatment(
      [
        period({
          frequency: { value: 1, unit: 'week' },
          startsOn: '2026-09-25',
          firstDueOn: '2026-09-25',
        }),
      ],
      [dose('2026-09-25', '2026-10-08', { givenOn: '2026-10-01' })],
    )

    expect(due(hebdo, '2026-10-01')).toEqual({ alreadyGivenOn: '2026-10-01' })
    expect(due(hebdo, '2026-10-02')).toEqual({
      due: { periodId: 'p-1', dueOn: '2026-10-08', dueTime: null },
    })
  })

  it('dit si une prise de la journée d’une notification est déjà notée', () => {
    const book = treatment(
      [MATIN_ET_SOIR],
      [missed('2026-09-01', '2026-09-01', { dueTime: '08:00' })],
    )
    const schedule = treatmentScheduleOf(book, '2026-09-02')

    expect(isDayNoted(schedule, '2026-09-01')).toBe(true)
    expect(isDayNoted(schedule, '2026-09-02')).toBe(false)
  })

  it('ne vise rien pour un traitement fini', () => {
    const fini = treatment([period({ stoppedOn: '2026-09-01' })])

    expect(due(fini, '2026-09-05')).toBeNull()
  })
})

describe('sheetHours — heures que la feuille « À faire » demande avant d’écrire', () => {
  const hours = (book: TreatmentWithHistory, today: string, givenOn = today) =>
    plain(sheetHours(t, treatmentScheduleOf(book, today), givenOn, today)).map(({ time, due }) => [
      time,
      due?.dueOn ?? null,
    ])

  it('propose les heures du jour, même quand une seule reste sans prise', () => {
    const book = treatment(
      [MATIN_ET_SOIR],
      [dose('2026-09-01', '2026-09-01', { dueTime: '08:00' })],
    )

    expect(hours(book, '2026-09-01')).toEqual([
      ['08:00', null],
      ['20:00', '2026-09-01'],
    ])
  })

  it('aujourd’hui, ne laisse pas corriger une heure notée oubliée ; un autre jour, si', () => {
    const book = treatment(
      [MATIN_ET_SOIR],
      [missed('2026-09-01', '2026-09-01', { dueTime: '08:00' })],
    )

    expect(hours(book, '2026-09-01')).toEqual([
      ['08:00', null],
      ['20:00', '2026-09-01'],
    ])
    expect(hours(book, '2026-09-02', '2026-09-01')).toEqual([
      ['08:00', '2026-09-01'],
      ['20:00', '2026-09-01'],
    ])
  })

  it('propose les heures de la journée en retard quand aucune dose ne tombe aujourd’hui', () => {
    const unJourSurDeux = treatment([
      period({ frequency: { value: 2, unit: 'day' }, times: ['08:00', '20:00'] }),
    ])

    expect(hours(unJourSurDeux, '2026-09-02')).toEqual([
      ['08:00', '2026-09-01'],
      ['20:00', '2026-09-01'],
    ])
  })

  it('ne demande rien sans heures multiples, ni quand il n’y a rien à noter', () => {
    const toutNote = treatment(
      [MATIN_ET_SOIR],
      [
        dose('2026-09-01', '2026-09-01', { dueTime: '08:00' }),
        dose('2026-09-01', '2026-09-02', { dueTime: '20:00' }),
      ],
    )

    expect(hours(treatment([period()]), '2026-09-01')).toEqual([])
    expect(hours(treatment([period({ times: ['20:00'] })]), '2026-09-01')).toEqual([])
    expect(hours(toutNote, '2026-09-01')).toEqual([])
  })
})

describe('otherDateTexts', () => {
  const NAMED = { name: 'Métacam', animal: 'Luna', today: '2026-09-28' }

  it('annonce le jour choisi sur le bouton, ou « Suivant » à plusieurs heures', () => {
    expect(otherDateTexts(t, NAMED, '2026-09-26', false).submit).toBe('Noter la prise du 26 sept.')
    expect(otherDateTexts(t, NAMED, '2026-09-28', false).submit).toBe(
      'Noter la prise d’aujourd’hui',
    )
    expect(otherDateTexts(t, NAMED, '2026-09-26', true).submit).toBe('Suivant')
  })

  it('rappelle le traitement, l’animal et le jour', () => {
    expect(plain(otherDateTexts(t, NAMED, '2026-09-26', true))).toMatchObject({
      daySubtitle: 'Métacam · Luna',
      hourTitle: 'À quelle heure ?',
      hourSubtitle: 'Métacam · Luna · 26 sept.',
    })
  })

  it('s’écrit en anglais', () => {
    applyLocale('en')

    expect(otherDateTexts(t, NAMED, '2026-09-26', true)).toMatchObject({
      submit: 'Next',
      hourTitle: 'At what time?',
    })
  })
})
