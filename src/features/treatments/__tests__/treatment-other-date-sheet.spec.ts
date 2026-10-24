import { describe, expect, it } from 'vitest'

import { dose, period, plain, treatment } from './treatment-fixtures'
import { otherDateSheetPlan } from '../logic/treatment-other-date-sheet'
import { treatmentReadingOf } from '../logic/treatment-reading-adapter'
import i18n from '@/core/i18n'
import type { Due } from '@/shared/domain/dose-calendar'

const t = i18n.global.t
const WEEK = { value: 1, unit: 'week' } as const

describe('otherDateSheetPlan — ce que la feuille « Fait à une autre date » montre', () => {
  it('depuis la carte : jours de la carte, aucun jour exclu, la question au lieu du récapitulatif', () => {
    const book = treatment([
      period({
        startsOn: '2026-11-01',
        firstDueOn: '2026-11-01',
        frequency: { value: 3, unit: 'month' },
      }),
    ])
    const due: Due = { settingId: 'p-1', dueOn: '2026-11-01', dueTime: null }
    const plan = otherDateSheetPlan(t, {
      treatment: book,
      reading: treatmentReadingOf(book, '2026-10-24'),
      today: '2026-10-24',
      min: '2020-03-01',
      target: { dueOn: '2026-11-01', dueTime: null },
      due,
      givenOn: '2026-10-24',
      answer: null,
      shifts: true,
    })

    expect(plan.min).toBe('2020-03-01')
    expect(plan.excluded).toEqual([])
    expect(plan.earlierHelp).toBe(false)
    expect(plan.question?.title).toBe('Cette prise')
    expect(plan.recap).toBeNull()
  })

  it('hors de la carte (« À faire », notification) : jours déjà donnés exclus, récapitulatif, pas de question', () => {
    const book = treatment(
      [period({ startsOn: '2026-10-09', firstDueOn: '2026-10-09', frequency: WEEK })],
      [dose('2026-10-09', '2026-10-16')],
    )
    const due: Due = { settingId: 'p-1', dueOn: '2026-10-16', dueTime: null }
    const plan = otherDateSheetPlan(t, {
      treatment: book,
      reading: treatmentReadingOf(book, '2026-10-19'),
      today: '2026-10-19',
      min: '2026-10-10',
      target: null,
      due,
      givenOn: '2026-10-19',
      answer: null,
      shifts: true,
    })

    expect(plan.min).toBe('2026-10-10')
    expect(plan.excluded).toEqual(['2026-10-09'])
    expect(plan.earlierHelp).toBe(false)
    expect(plan.question).toBeNull()
    expect(plain(plan.recap!)).toBe('Dose du vendredi 16 oct., donnée le lundi 19 oct.')
  })
})
