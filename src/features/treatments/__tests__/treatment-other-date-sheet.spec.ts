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
    expect(plan.asked).toBeNull()
  })

  describe('depuis « À faire », Luna, Bravecto tous les 3 mois, première dose le 1er nov., le 24 oct. (Q36)', () => {
    const book = treatment([
      period({
        startsOn: '2026-11-01',
        firstDueOn: '2026-11-01',
        frequency: { value: 3, unit: 'month' },
      }),
    ])
    const due: Due = { settingId: 'p-1', dueOn: '2026-11-01', dueTime: null }
    const planOf = (answer: 'extra' | 'replaces' | null) =>
      otherDateSheetPlan(t, {
        treatment: book,
        reading: treatmentReadingOf(book, '2026-10-24'),
        today: '2026-10-24',
        min: '2026-04-10',
        target: { dueOn: '2026-11-01', dueTime: null },
        due,
        givenOn: '2026-10-24',
        answer,
        shifts: false,
      })

    it('le calendrier de la fiche : sans échéance précédente, tous les jours jusqu’à aujourd’hui', () => {
      expect(planOf(null)).toMatchObject({ min: '2026-04-10', excluded: [], earlierHelp: false })
    })

    it('la même question que depuis la fiche, sans récapitulatif qui parlerait d’une dose couverte', () => {
      const plan = planOf(null)
      expect(plan.question?.title).toBe('Cette prise')
      expect(plan.question?.options.map(({ label }) => plain(label))).toEqual([
        'En plus',
        'Remplace celle du 1er nov.',
      ])
      expect(plan.question?.help).toBeNull()
      expect(plan.recap).toBeNull()
      expect(plan.asked).toBeNull()
    })

    it('après la réponse, l’aide dit ce qui sera écrit', () => {
      expect(plain(planOf('extra').question!.help!)).toBe(
        'Prise en plus le samedi 24 oct. · la prochaine dose reste le 1er nov.',
      )
      expect(planOf('extra').asked).toBe('extra')
      expect(plain(planOf('replaces').question!.help!)).toBe(
        'Donnée le 24 oct. pour la dose du 1er nov. · prochaine dose le 1er févr. 2027',
      )
      expect(planOf('replaces').recap).toBeNull()
    })
  })

  it('« Donnée quand ? », sans question à poser : jours déjà donnés exclus, récapitulatif', () => {
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
    expect(plan.asked).toBeUndefined()
    expect(plain(plan.recap!)).toBe('Dose du vendredi 16 oct., donnée le lundi 19 oct.')
  })
})
