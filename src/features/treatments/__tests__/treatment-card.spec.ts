import { afterEach, describe, expect, it } from 'vitest'

import { dose, missed, period, plain, treatment } from './treatment-fixtures'
import { detailActions, doseCard } from '../logic/treatment-card'
import { treatmentScheduleOf } from '../logic/treatment-schedule'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import i18n, { applyLocale } from '@/core/i18n'

const t = i18n.global.t
const MATIN_ET_SOIR = period({ times: ['08:00', '20:00'], doseQuantity: 0.3, doseUnit: 'ml' })

function card(history: TreatmentWithHistory, today: string) {
  return plain(doseCard(t, history, treatmentScheduleOf(history, today), { animal: 'Luna', today }))
}

afterEach(() => applyLocale('fr'))

describe('doseCard', () => {
  it('donne le rythme et la posologie de la période en cours', () => {
    const history = treatment([
      period({ stoppedOn: '2026-09-21' }),
      { ...MATIN_ET_SOIR, id: 'p-2', startsOn: '2026-09-21', firstDueOn: '2026-09-21' },
    ])

    expect(card(history, '2026-09-28')).toMatchObject({
      rhythm: 'Tous les jours · 8 h et 20 h',
      dosage: '0,3 ml',
    })
  })

  it('dit la dose du jour, sans heure pour un traitement sans heure (critère 1)', () => {
    const history = treatment([period()], [dose('2026-09-02', '2026-09-03')])

    expect(card(history, '2026-09-28')).toEqual({
      rhythm: 'Tous les jours',
      dosage: null,
      entries: [
        {
          due: { periodId: 'p-1', dueOn: '2026-09-28', dueTime: null },
          label: 'Dose du jour',
          value: '28 sept.',
          overdue: false,
          doneLabel: 'C’est fait : noter la prise de Métacam pour Luna',
        },
      ],
      end: null,
    })
  })

  it('à plusieurs heures, donne chaque heure du jour encore sans prise, même passée', () => {
    const history = treatment(
      [MATIN_ET_SOIR],
      [dose('2026-09-27', '2026-09-28', { dueTime: '20:00' })],
    )

    expect(card(history, '2026-09-28').entries).toEqual([
      {
        due: { periodId: 'p-1', dueOn: '2026-09-28', dueTime: '08:00' },
        label: 'Dose du jour',
        value: '28 sept. à 8 h',
        overdue: false,
        doneLabel: 'C’est fait : noter la dose de 8 h du 28 sept. de Métacam pour Luna',
      },
      {
        due: { periodId: 'p-1', dueOn: '2026-09-28', dueTime: '20:00' },
        label: 'Dose du jour',
        value: '28 sept. à 20 h',
        overdue: false,
        doneLabel: 'C’est fait : noter la dose de 20 h du 28 sept. de Métacam pour Luna',
      },
    ])
  })

  it('ne garde que l’heure restante une fois la première notée', () => {
    const history = treatment(
      [MATIN_ET_SOIR],
      [dose('2026-09-28', '2026-09-28', { dueTime: '08:00' })],
    )

    expect(card(history, '2026-09-28').entries.map(({ value }) => value)).toEqual([
      '28 sept. à 20 h',
    ])
  })

  it('après la prise du jour, annonce la prochaine dose, jamais une date passée (critère 2)', () => {
    const history = treatment(
      [period()],
      [dose('2026-09-02', '2026-09-03'), dose('2026-09-28', '2026-09-29')],
    )

    expect(card(history, '2026-09-28').entries).toMatchObject([
      { label: 'Prochaine dose', value: 'demain, 29 sept.', overdue: false },
    ])
  })

  it('annonce « demain » pour une première prise demain (critère 6)', () => {
    const history = treatment([period({ startsOn: '2026-09-29', firstDueOn: '2026-09-29' })])

    expect(card(history, '2026-09-28').entries).toMatchObject([
      { label: 'Prochaine dose', value: 'demain, 29 sept.' },
    ])
  })

  it('un mensuel donné le 2 août puis le 28 sept. a sa prochaine dose le 28 oct. (critère 3)', () => {
    const history = treatment(
      [
        period({
          frequency: { value: 1, unit: 'month' },
          startsOn: '2026-08-02',
          firstDueOn: '2026-08-02',
        }),
      ],
      [
        dose('2026-08-02', '2026-09-02'),
        dose('2026-09-02', '2026-10-28', { givenOn: '2026-09-28' }),
      ],
    )
    const schedule = treatmentScheduleOf(history, '2026-09-28')

    expect(schedule.unloggedDoses).toEqual([])
    expect(card(history, '2026-09-28').entries).toMatchObject([
      { label: 'Prochaine dose', value: '28 oct.' },
    ])
  })

  it('dit le retard d’une dose passée, sans titre', () => {
    const history = treatment(
      [period({ frequency: { value: 1, unit: 'week' } })],
      [dose('2026-09-01', '2026-09-08')],
    )

    expect(card(history, '2026-09-10').entries).toMatchObject([
      { label: null, value: 'en retard depuis le 8 sept.', overdue: true },
    ])
  })

  it('dit la fin du traitement après la date de fin, sans geste', () => {
    const history = treatment(
      [period({ endsOn: '2026-09-03' })],
      [
        dose('2026-09-01', '2026-09-02'),
        missed('2026-09-02', '2026-09-03'),
        dose('2026-09-03', '2026-09-04'),
      ],
    )

    expect(card(history, '2026-09-10')).toMatchObject({
      rhythm: 'Tous les jours · jusqu’au 3 sept.',
      entries: [],
      end: { label: 'Fin du traitement', value: 'Terminé le 3 sept.' },
    })
  })

  it('dit l’arrêt et sa date', () => {
    const history = treatment([period({ stoppedOn: '2026-09-28' })])

    expect(card(history, '2026-10-02')).toMatchObject({
      entries: [],
      end: { label: 'Fin du traitement', value: 'Arrêté le 28 sept.' },
    })
  })

  it('s’écrit en anglais', () => {
    applyLocale('en')
    const history = treatment(
      [MATIN_ET_SOIR],
      [dose('2026-09-28', '2026-09-28', { dueTime: '08:00' })],
    )

    expect(card(history, '2026-09-28')).toMatchObject({
      rhythm: 'Every day · 8 am and 8 pm',
      entries: [
        {
          label: 'Today’s dose',
          value: 'Sep 28 at 8 pm',
          doneLabel: 'Done: log the 8 pm dose of Métacam for Luna, Sep 28',
        },
      ],
    })
  })
})

describe('detailActions', () => {
  it('propose d’arrêter et de modifier un traitement en cours', () => {
    expect(detailActions({ phase: 'today' })).toEqual({
      canEdit: true,
      canStop: true,
      canResume: false,
    })
    expect(detailActions({ phase: 'upcoming' }).canStop).toBe(true)
    expect(detailActions({ phase: 'overdue' }).canStop).toBe(true)
  })

  it('propose de reprendre un traitement arrêté, sans le modifier ni l’arrêter', () => {
    expect(detailActions({ phase: 'stopped' })).toEqual({
      canEdit: false,
      canStop: false,
      canResume: true,
    })
  })

  it('ne propose plus d’arrêter un traitement dont la date de fin est passée', () => {
    expect(detailActions({ phase: 'ended' })).toEqual({
      canEdit: true,
      canStop: false,
      canResume: true,
    })
  })
})
