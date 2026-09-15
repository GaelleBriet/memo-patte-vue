// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'

import i18n from '@/core/i18n'
import { treatmentReminders } from '../treatment-reminders'

const t = i18n.global.t
const ID = '44444444-4444-4444-8444-444444444444'
const LUNA = { name: 'Luna', deletedAt: null }
const MILBEMAX = {
  id: ID,
  name: 'Milbemax',
  type: 'deworming' as const,
  nextDueDate: '2026-10-15',
  deletedAt: null,
}
const NOW = new Date(2026, 8, 15, 12)

afterEach(() => {
  i18n.global.locale.value = 'fr'
})

describe('treatmentReminders', () => {
  it('produit les deux rappels de la prochaine prise avec le type, le nom et l’animal', () => {
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
    ])
  })

  it('traduit les rappels en anglais', () => {
    i18n.global.locale.value = 'en'
    const bravecto = { ...MILBEMAX, name: 'Bravecto', type: 'antiparasitic' as const }

    const [before, due] = treatmentReminders(t, bravecto, LUNA, NOW)

    expect(before?.title).toBe('Flea & tick Bravecto for Luna in 3 days')
    expect(before?.body).toBe('Check you still have a dose on hand.')
    expect(due?.title).toBe('Flea & tick Bravecto for Luna today')
    expect(due?.body).toBe('Log the dose in MémoPatte to schedule the next one.')
  })

  it('suit la prochaine échéance : une prise dépassée ne produit plus rien', () => {
    expect(treatmentReminders(t, { ...MILBEMAX, nextDueDate: '2026-09-10' }, LUNA, NOW)).toEqual([])
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
