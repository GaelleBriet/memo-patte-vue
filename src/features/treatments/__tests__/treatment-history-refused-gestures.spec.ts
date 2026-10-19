import { describe, expect, it } from 'vitest'

import { dose, missed, period, postponed, shifted, treatment } from './treatment-fixtures'
import { treatmentHistory, type DoseLineAction } from '../logic/treatment-history'
import { lineAction } from '../logic/treatment-line-actions'
import { treatmentReadingOf } from '../logic/treatment-reading-adapter'
import type { TreatmentWithPeriods } from '../schema/treatment-with-periods.schema'
import { play } from '@/shared/domain/dose-calendar'
import i18n from '@/core/i18n'

const t = i18n.global.t

const at = (second: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString()

function choicesOf(book: TreatmentWithPeriods, today: string, id: string) {
  const history = treatmentHistory(t, book, treatmentReadingOf(book, today), today)
  const lines = history.periods.flatMap(({ lines }) => lines)
  const rows = lines.flatMap((line) => (line.kind === 'missed' ? line.rows : [line]))
  return history.menuOf(rows.find((row) => row.dose.id === id)!)
}

function actionsOf(book: TreatmentWithPeriods, today: string, id: string): DoseLineAction[] {
  return choicesOf(book, today, id).map(({ action }) => action)
}

function removalOf(book: TreatmentWithPeriods, today: string, id: string) {
  const result = play(treatmentReadingOf(book, today).input, { kind: 'remove', lineId: id })
  return 'refusal' in result ? result.refusal.reason : null
}

function refusalOf(book: TreatmentWithPeriods, today: string, id: string, choice: DoseLineAction) {
  const action = lineAction(
    book.doses.find((line) => line.id === id)!,
    choice,
    today,
  )
  if (action?.kind !== 'note') throw new Error(`Pas un geste de note : ${choice}`)
  const result = play(treatmentReadingOf(book, today).input, action.gesture)
  return 'refusal' in result ? result.refusal.reason : null
}

describe('historique : jamais un geste que le moteur refusera (#947)', () => {
  // Graine 977001278 : toutes les 2 semaines à 8 h, 14 h et 20 h depuis le 16 mars, passé à 8 h et 20 h le 16.
  const TOUS_LES_15_JOURS = period({
    startsOn: '2026-03-16',
    firstDueOn: '2026-03-16',
    frequency: { value: 2, unit: 'week' },
    times: ['08:00', '14:00', '20:00'],
    createdAt: at(0),
    updatedAt: at(0),
  })
  const A_8H_ET_20H = period({
    id: 'p-2',
    startsOn: '2026-03-16',
    firstDueOn: '2026-03-16',
    gridOriginOn: null,
    frequency: { value: 2, unit: 'week' },
    times: ['08:00', '20:00'],
    createdAt: at(16),
    updatedAt: at(16),
  })
  const MILO = treatment(
    [TOUS_LES_15_JOURS, A_8H_ET_20H],
    [
      dose('2026-03-16', '2026-03-16', { dueTime: '08:00', updatedAt: at(11) }),
      dose('2026-03-16', '2026-03-16', { dueTime: '14:00', updatedAt: at(6) }),
      missed('2026-03-16', '2026-03-16', { dueTime: '20:00', updatedAt: at(3) }),
      postponed('2026-03-30', '2026-03-29', { dueTime: '08:00', updatedAt: at(12) }),
      shifted('2026-03-30', '2026-03-29', { dueTime: '08:00', updatedAt: at(13) }),
      dose('2026-03-29', '2026-03-29', {
        dueTime: '08:00',
        givenOn: '2026-03-16',
        updatedAt: at(14),
      }),
      postponed('2026-03-29', '2026-04-06', {
        id: 'report 2026-03-29 14:00',
        dueTime: '14:00',
        updatedAt: at(15),
      }),
    ],
  )

  it('Milo, le 16 mars : la prise du 16 à 8 h ne propose pas « Marquer comme oubliée », que le moteur refuse (la dose du 29 donnée d’avance resterait sans échéance)', () => {
    expect(refusalOf(MILO, '2026-03-16', '2026-03-16 08:00', 'mark-missed')).toBe('later-dose')
    expect(actionsOf(MILO, '2026-03-16', '2026-03-16 08:00')).toEqual(['change-date', 'remove'])
  })

  it('sans la dose du 29 donnée d’avance, la prise du 16 à 8 h garde « Marquer comme oubliée »', () => {
    const book = treatment(
      [TOUS_LES_15_JOURS],
      [dose('2026-03-16', '2026-03-16', { dueTime: '08:00', updatedAt: at(11) })],
    )

    expect(refusalOf(book, '2026-03-16', '2026-03-16 08:00', 'mark-missed')).toBeNull()
    expect(actionsOf(book, '2026-03-16', '2026-03-16 08:00')).toEqual([
      'change-date',
      'mark-missed',
      'remove',
    ])
  })

  // Graine 977003652 : tous les 3 jours à 8 h et 20 h depuis le 5 avril ; le 7, un réglage tous les
  // 2 jours à 8 h, 14 h et 20 h, dont la dose du 8 à 8 h est avancée au 7, puis arrêté et repris.
  it('l’oubli du 7 avril à 20 h ne propose pas « Marquer comme donnée », que le moteur refuse', () => {
    const tousLes3Jours = period({
      startsOn: '2026-04-05',
      firstDueOn: '2026-04-05',
      frequency: { value: 3, unit: 'day' },
      times: ['08:00', '20:00'],
      createdAt: at(0),
      updatedAt: at(0),
    })
    const tousLes2Jours = period({
      id: 'p-2',
      startsOn: '2026-04-07',
      firstDueOn: '2026-04-08',
      endsOn: '2026-04-14',
      stoppedOn: '2026-04-07',
      frequency: { value: 2, unit: 'day' },
      times: ['08:00', '14:00', '20:00'],
      createdAt: at(3),
      updatedAt: at(5),
      settingsWrittenAt: at(5),
    })
    const repris = period({
      id: 'p-3',
      startsOn: '2026-04-07',
      firstDueOn: '2026-04-07',
      endsOn: '2026-04-21',
      frequency: { value: 1, unit: 'week' },
      times: ['08:00', '14:00', '20:00'],
      createdAt: at(10),
      updatedAt: at(10),
    })
    const book = treatment(
      [tousLes3Jours, tousLes2Jours, repris],
      [
        postponed('2026-04-05', '2026-04-06', { dueTime: '08:00', updatedAt: at(1) }),
        dose('2026-04-06', '2026-04-06', {
          dueTime: '08:00',
          givenOn: '2026-03-31',
          updatedAt: at(7),
        }),
        postponed('2026-04-08', '2026-04-07', {
          periodId: 'p-2',
          dueTime: '08:00',
          updatedAt: at(8),
        }),
        missed('2026-04-07', '2026-04-07', { periodId: 'p-2', dueTime: '20:00', updatedAt: at(9) }),
      ],
    )

    expect(refusalOf(book, '2026-04-07', '2026-04-07 20:00', 'mark-given')).toBe('later-dose')
    expect(actionsOf(book, '2026-04-07', '2026-04-07 20:00')).toEqual(['remove'])
  })
})

describe('#961 : « Supprimer » grisé avec son aide quand le moteur le refuse, jamais proposé puis refusé', () => {
  const LATER_DOSE = 'Une dose plus lointaine est déjà notée.'

  // Graine 9600000163, réduite.
  it('Milo, chaque semaine à 8 h, 14 h et 20 h depuis le 16 mars, le 14 h du 16 reporté au 25 avec le décalage ; le 20, 8 h et 20 h à partir du 25, et le 25 à 8 h donné d’avance : « Supprimer ce décalage » est grisé', () => {
    const chaqueSemaine = period({
      startsOn: '2026-03-16',
      firstDueOn: '2026-03-16',
      frequency: { value: 1, unit: 'week' },
      times: ['08:00', '14:00', '20:00'],
      createdAt: at(0),
      updatedAt: at(0),
    })
    const a8hEt20h = period({
      id: 'p-2',
      startsOn: '2026-03-20',
      firstDueOn: '2026-03-25',
      firstDueChosen: false,
      endsOn: '2026-04-13',
      frequency: { value: 1, unit: 'week' },
      times: ['08:00', '20:00'],
      createdAt: at(11),
      updatedAt: at(11),
    })
    const book = treatment(
      [chaqueSemaine, a8hEt20h],
      [
        postponed('2026-03-16', '2026-03-25', { dueTime: '14:00', updatedAt: at(3) }),
        shifted('2026-03-16', '2026-03-25', { dueTime: '14:00', updatedAt: at(4) }),
        dose('2026-03-25', '2026-03-25', {
          dueTime: '08:00',
          givenOn: '2026-03-20',
          updatedAt: at(14),
        }),
      ],
    )

    expect(removalOf(book, '2026-03-20', 'décalage 2026-03-16')).toBe('later-dose')
    expect(choicesOf(book, '2026-03-20', 'décalage 2026-03-16')).toEqual([
      { action: 'remove-shift', hint: LATER_DOSE },
    ])
  })

  // Graine 9600000951.
  it('Milo, le 12 mars à 8 h et 20 h, passé le jour même de toutes les 2 semaines à tous les jours ; 20 h donnée d’avance le 11 : « Supprimer » de la prise de 8 h est grisé', () => {
    const tousLes15Jours = period({
      startsOn: '2026-03-12',
      firstDueOn: '2026-03-12',
      stoppedOn: '2026-03-12',
      frequency: { value: 2, unit: 'week' },
      times: ['08:00', '20:00'],
      createdAt: at(0),
      updatedAt: at(0),
    })
    const tousLesJours = period({
      id: 'p-2',
      startsOn: '2026-03-12',
      firstDueOn: '2026-03-12',
      frequency: { value: 1, unit: 'day' },
      times: ['08:00', '20:00'],
      createdAt: at(4),
      updatedAt: at(4),
    })
    const book = treatment(
      [tousLes15Jours, tousLesJours],
      [
        dose('2026-03-12', '2026-03-12', { dueTime: '08:00', updatedAt: at(1) }),
        dose('2026-03-12', '2026-03-12', {
          dueTime: '20:00',
          givenOn: '2026-03-11',
          updatedAt: at(3),
        }),
      ],
    )

    expect(removalOf(book, '2026-03-12', '2026-03-12 08:00')).toBe('later-dose')
    expect(choicesOf(book, '2026-03-12', '2026-03-12 08:00')).toContainEqual({
      action: 'remove',
      hint: LATER_DOSE,
    })
  })

  it('sans la prise de 20 h, « Supprimer » de la prise de 8 h reste actif', () => {
    const book = treatment(
      [
        period({
          startsOn: '2026-03-12',
          firstDueOn: '2026-03-12',
          frequency: { value: 1, unit: 'day' },
          times: ['08:00', '20:00'],
          createdAt: at(0),
          updatedAt: at(0),
        }),
      ],
      [dose('2026-03-12', '2026-03-12', { dueTime: '08:00', updatedAt: at(1) })],
    )

    expect(removalOf(book, '2026-03-12', '2026-03-12 08:00')).toBeNull()
    expect(choicesOf(book, '2026-03-12', '2026-03-12 08:00')).toContainEqual({ action: 'remove' })
  })

  // Graine 9600001479, réduite.
  it('Milo, chaque mois ; le 23 mai à 14 h reporté au 8 juin, le 8 juin à 20 h reporté au 12, le 12 à 20 h donné d’avance le 9 avril : « Supprimer ce report » du 23 mai est grisé', () => {
    const chaqueMois = period({
      startsOn: '2026-03-18',
      firstDueOn: '2026-04-18',
      gridOriginOn: '2026-03-18',
      firstDueChosen: false,
      fallenDosesAnswer: 'not-due',
      frequency: { value: 1, unit: 'month' },
      times: ['08:00', '14:00', '20:00'],
      createdAt: at(0),
      updatedAt: at(1),
      settingsWrittenAt: at(1),
    })
    const le23 = period({
      id: 'p-2',
      startsOn: '2026-03-25',
      firstDueOn: '2026-05-23',
      frequency: { value: 1, unit: 'month' },
      times: ['08:00', '14:00', '20:00'],
      createdAt: at(4),
      updatedAt: at(4),
    })
    const repris = period({
      id: 'p-3',
      startsOn: '2026-03-29',
      firstDueOn: '2026-05-23',
      gridOriginOn: null,
      frequency: { value: 1, unit: 'month' },
      times: ['08:00', '14:00', '20:00'],
      createdAt: at(9),
      updatedAt: at(9),
    })
    const book = treatment(
      [chaqueMois, le23, repris],
      [
        postponed('2026-05-23', '2026-06-08', {
          periodId: 'p-3',
          dueTime: '14:00',
          updatedAt: at(13),
        }),
        postponed('2026-06-08', '2026-06-12', {
          periodId: 'p-3',
          dueTime: '20:00',
          updatedAt: at(17),
        }),
        dose('2026-06-12', '2026-06-12', {
          periodId: 'p-3',
          dueTime: '20:00',
          givenOn: '2026-04-09',
          updatedAt: at(19),
        }),
      ],
    )

    expect(removalOf(book, '2026-04-09', 'report 2026-05-23')).toBe('later-dose')
    expect(choicesOf(book, '2026-04-09', 'report 2026-05-23')).toContainEqual({
      action: 'remove-move',
      hint: LATER_DOSE,
    })
  })
})
