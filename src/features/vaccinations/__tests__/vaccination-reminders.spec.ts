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
  it('produit les deux rappels du vaccin avec le nom du vaccin et le prénom de l’animal', () => {
    expect(vaccinationReminders(t, CHPPI, MILO, NOW)).toEqual([
      {
        key: `vaccination:${ID}:before`,
        title: 'Vaccin CHPPi de Milo dans 3 jours',
        body: 'Pense à prendre rendez-vous chez le vétérinaire.',
        at: new Date(2026, 9, 12, 9),
      },
      {
        key: `vaccination:${ID}:due`,
        title: 'Vaccin CHPPi de Milo aujourd’hui',
        body: 'Note l’injection dans MémoPatte une fois faite.',
        at: new Date(2026, 9, 15, 9),
      },
    ])
  })

  it('traduit les rappels en anglais', () => {
    i18n.global.locale.value = 'en'

    const [before, due] = vaccinationReminders(t, CHPPI, MILO, NOW)

    expect(before?.title).toBe('CHPPi vaccine for Milo in 3 days')
    expect(before?.body).toBe('Remember to book a vet appointment.')
    expect(due?.title).toBe('CHPPi vaccine for Milo today')
    expect(due?.body).toBe('Log the shot in MémoPatte once it’s done.')
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
