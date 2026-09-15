// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'

import i18n from '@/core/i18n'
import type { TreatmentFrequency } from '../treatment.schema'
import { treatmentReminders } from '../treatment-reminders'

const t = i18n.global.t
const ID = '44444444-4444-4444-8444-444444444444'
const LUNA = { name: 'Luna', deletedAt: null }
const MONTHLY: TreatmentFrequency = { value: 1, unit: 'month' }
const MILBEMAX = {
  id: ID,
  name: 'Milbemax',
  type: 'deworming' as const,
  frequency: MONTHLY,
  nextDueDate: '2026-10-15',
  deletedAt: null,
}
const NOW = new Date(2026, 8, 15, 12)

afterEach(() => {
  i18n.global.locale.value = 'fr'
})

function planned(
  nextDueDate: string,
  now: Date,
  frequency: TreatmentFrequency = MONTHLY,
): [string, Date][] {
  return treatmentReminders(t, { ...MILBEMAX, nextDueDate, frequency }, LUNA, now).map(
    ({ key, at }) => [key.split(':')[2]!, at],
  )
}

describe('treatmentReminders', () => {
  it('produit les trois rappels de la prochaine prise avec le type, le nom et l’animal', () => {
    expect(treatmentReminders(t, MILBEMAX, LUNA, NOW)).toEqual([
      {
        key: `treatment:${ID}:before`,
        title: 'Vermifuge Milbemax de Luna dans 3 jours',
        body: 'Vérifie qu’il te reste une dose.',
        at: new Date(2026, 9, 12, 9),
      },
      {
        key: `treatment:${ID}:due`,
        title: 'Vermifuge Milbemax de Luna aujourd’hui',
        body: 'Note la prise dans MémoPatte pour programmer la suivante.',
        at: new Date(2026, 9, 15, 9),
      },
      {
        key: `treatment:${ID}:overdue`,
        title: 'Vermifuge Milbemax de Luna en retard de 3 jours',
        body: 'Pense à donner la dose, puis note la prise dans MémoPatte.',
        at: new Date(2026, 9, 18, 9),
      },
    ])
  })

  it('traduit les rappels en anglais', () => {
    i18n.global.locale.value = 'en'
    const bravecto = { ...MILBEMAX, name: 'Bravecto', type: 'antiparasitic' as const }

    const [before, due, overdue] = treatmentReminders(t, bravecto, LUNA, NOW)

    expect(before?.title).toBe('Flea & tick Bravecto for Luna in 3 days')
    expect(before?.body).toBe('Check you still have a dose on hand.')
    expect(due?.title).toBe('Flea & tick Bravecto for Luna today')
    expect(due?.body).toBe('Log the dose in MémoPatte to schedule the next one.')
    expect(overdue?.title).toBe('Flea & tick Bravecto for Luna is 3 days overdue')
    expect(overdue?.body).toBe('Remember to give the dose, then log it in MémoPatte.')
  })

  it('passe aux rappels de juin quand la prise de mai n’est pas notée', () => {
    expect(planned('2026-05-15', new Date(2026, 4, 20, 12))).toEqual([
      ['before', new Date(2026, 5, 12, 9)],
      ['due', new Date(2026, 5, 15, 9)],
      ['overdue', new Date(2026, 5, 18, 9)],
    ])
  })

  it('relance d’abord la prise manquée tant que ses trois jours de retard sont à venir', () => {
    expect(planned('2026-05-15', new Date(2026, 4, 16, 12))).toEqual([
      ['overdue', new Date(2026, 4, 18, 9)],
      ['before', new Date(2026, 5, 12, 9)],
      ['due', new Date(2026, 5, 15, 9)],
    ])
  })

  it('traite une prise du jour passée 9 h comme manquée', () => {
    expect(planned('2026-05-15', new Date(2026, 4, 15, 10))[0]).toEqual([
      'overdue',
      new Date(2026, 4, 18, 9),
    ])
  })

  it('rattrape plusieurs cycles manqués sans dériver en fin de mois', () => {
    expect(planned('2026-01-31', new Date(2026, 4, 2, 12))).toEqual([
      ['overdue', new Date(2026, 4, 3, 9)],
      ['before', new Date(2026, 4, 28, 9)],
      ['due', new Date(2026, 4, 31, 9)],
    ])
  })

  it('cale une échéance du 31 sur le 30 du mois suivant', () => {
    expect(planned('2026-05-31', new Date(2026, 5, 1, 12))).toEqual([
      ['overdue', new Date(2026, 5, 3, 9)],
      ['before', new Date(2026, 5, 27, 9)],
      ['due', new Date(2026, 5, 30, 9)],
    ])
  })

  it('suit une fréquence en jours', () => {
    expect(planned('2026-09-01', NOW, { value: 10, unit: 'day' })).toEqual([
      ['before', new Date(2026, 8, 18, 9)],
      ['due', new Date(2026, 8, 21, 9)],
      ['overdue', new Date(2026, 8, 24, 9)],
    ])
  })

  it('suit une fréquence en semaines', () => {
    expect(planned('2026-09-01', new Date(2026, 8, 16, 12), { value: 2, unit: 'week' })).toEqual([
      ['overdue', new Date(2026, 8, 18, 9)],
      ['before', new Date(2026, 8, 26, 9)],
      ['due', new Date(2026, 8, 29, 9)],
    ])
  })

  it('ne produit rien pour un traitement supprimé', () => {
    const deleted = { ...MILBEMAX, deletedAt: '2026-09-15T08:00:00.000Z' }

    expect(treatmentReminders(t, deleted, LUNA, NOW)).toEqual([])
  })

  it('ne produit rien quand l’animal est supprimé ou introuvable', () => {
    const deleted = { ...LUNA, deletedAt: '2026-09-15T08:00:00.000Z' }

    expect(treatmentReminders(t, MILBEMAX, deleted, NOW)).toEqual([])
    expect(treatmentReminders(t, MILBEMAX, null, NOW)).toEqual([])
  })
})
