// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'

import i18n from '@/core/i18n'
import { vaccinationReminders } from '../vaccination-reminders'

const t = i18n.global.t
const ID = '22222222-2222-4222-8222-222222222222'
const MILO = { name: 'Milo', deletedAt: null }
const CHPPI = { id: ID, name: 'CHPPi', dueDate: '2026-10-15', deletedAt: null }
const NOW = new Date(2026, 8, 15, 12)

afterEach(() => {
  i18n.global.locale.value = 'fr'
})

describe('vaccinationReminders', () => {
  it('produit les trois rappels du vaccin avec son nom seul et le prénom de l’animal', () => {
    expect(vaccinationReminders(t, CHPPI, MILO, NOW)).toEqual([
      {
        key: `vaccination:${ID}:2026-10-15:before`,
        title: 'CHPPi de Milo dans 3 jours',
        body: 'Pense à prendre rendez-vous chez le vétérinaire.',
        at: new Date(2026, 9, 12, 9),
      },
      {
        key: `vaccination:${ID}:2026-10-15:due`,
        title: 'CHPPi de Milo aujourd’hui',
        body: 'Note le vaccin dans MémoPatte une fois fait.',
        at: new Date(2026, 9, 15, 9),
      },
      {
        key: `vaccination:${ID}:2026-10-15:overdue`,
        title: 'CHPPi de Milo en retard de 3 jours',
        body: 'Prends rendez-vous chez le vétérinaire, puis note le vaccin dans MémoPatte.',
        at: new Date(2026, 9, 18, 9),
      },
    ])
  })

  it('traduit les rappels en anglais', () => {
    i18n.global.locale.value = 'en'

    const [before, due, overdue] = vaccinationReminders(t, CHPPI, MILO, NOW)

    expect(before?.title).toBe('CHPPi for Milo in 3 days')
    expect(before?.body).toBe('Remember to book a vet appointment.')
    expect(due?.title).toBe('CHPPi for Milo today')
    expect(due?.body).toBe('Log the vaccine in MémoPatte once it’s done.')
    expect(overdue?.title).toBe('CHPPi for Milo is 3 days overdue')
    expect(overdue?.body).toBe('Book a vet appointment, then log the vaccine in MémoPatte.')
  })

  it('ne se répète pas : une fois la relance passée, plus rien pour cette échéance', () => {
    expect(vaccinationReminders(t, { ...CHPPI, dueDate: '2026-09-12' }, MILO, NOW)).toEqual([])
  })

  it('ne produit rien pour un vaccin sans rappel', () => {
    expect(vaccinationReminders(t, { ...CHPPI, dueDate: null }, MILO, NOW)).toEqual([])
  })

  it('ne produit rien pour un vaccin supprimé', () => {
    const deleted = { ...CHPPI, deletedAt: '2026-09-15T08:00:00.000Z' }

    expect(vaccinationReminders(t, deleted, MILO, NOW)).toEqual([])
  })

  it('ne produit rien quand l’animal est supprimé ou introuvable', () => {
    const deleted = { ...MILO, deletedAt: '2026-09-15T08:00:00.000Z' }

    expect(vaccinationReminders(t, CHPPI, deleted, NOW)).toEqual([])
    expect(vaccinationReminders(t, CHPPI, null, NOW)).toEqual([])
  })
})
