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

function actionsOf(book: TreatmentWithPeriods, today: string, id: string): DoseLineAction[] {
  const history = treatmentHistory(t, book, treatmentReadingOf(book, today), today)
  const lines = history.periods.flatMap(({ lines }) => lines)
  const rows = lines.flatMap((line) => (line.kind === 'missed' ? line.rows : [line]))
  return history.menuOf(rows.find((row) => row.dose.id === id)!)
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
