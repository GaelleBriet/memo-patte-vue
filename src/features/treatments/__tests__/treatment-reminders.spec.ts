// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

import i18n from '@/core/i18n'
import type { TreatmentFrequency } from '../treatment.schema'
import { addFrequency } from '../treatment-frequency'
import type * as TreatmentFrequencyModule from '../treatment-frequency'
import { treatmentReminders } from '../treatment-reminders'

vi.mock('../treatment-frequency', async (importOriginal) => {
  const original = await importOriginal<typeof TreatmentFrequencyModule>()
  return { addFrequency: vi.fn<typeof original.addFrequency>(original.addFrequency) }
})

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

/** `yyyy-MM-dd:moment` de chaque rappel programmé. */
function slots(nextDueDate: string, now: Date, frequency: TreatmentFrequency = MONTHLY): string[] {
  return treatmentReminders(t, { ...MILBEMAX, nextDueDate, frequency }, LUNA, now).map(({ key }) =>
    key.slice(`treatment:${ID}:`.length),
  )
}

describe('treatmentReminders', () => {
  it('produit les rappels de l’échéance avec le type, le nom et l’animal', () => {
    expect(treatmentReminders(t, MILBEMAX, LUNA, NOW).slice(0, 3)).toEqual([
      {
        key: `treatment:${ID}:2026-10-15:before`,
        title: 'Vermifuge Milbemax de Luna dans 3 jours',
        body: 'Vérifie qu’il te reste une dose.',
        at: new Date(2026, 9, 12, 9),
      },
      {
        key: `treatment:${ID}:2026-10-15:due`,
        title: 'Vermifuge Milbemax de Luna aujourd’hui',
        body: 'Note la prise dans MémoPatte pour programmer la suivante.',
        at: new Date(2026, 9, 15, 9),
      },
      {
        key: `treatment:${ID}:2026-10-15:overdue`,
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

    expect(before?.title).toBe('Bravecto (Parasite control) for Luna in 3 days')
    expect(before?.body).toBe('Check you still have a dose on hand.')
    expect(due?.title).toBe('Bravecto (Parasite control) for Luna today')
    expect(due?.body).toBe('Log the dose in MémoPatte to schedule the next one.')
    expect(overdue?.title).toBe('Bravecto (Parasite control) for Luna is 3 days overdue')
    expect(overdue?.body).toBe('Remember to give the dose, then log it in MémoPatte.')
  })

  it('programme tous les cycles qui tombent dans les 60 jours', () => {
    expect(slots('2026-10-15', NOW)).toEqual([
      '2026-10-15:before',
      '2026-10-15:due',
      '2026-10-15:overdue',
      '2026-11-15:before',
    ])
  })

  it('programme toutes les semaines d’un traitement hebdomadaire sur 60 jours', () => {
    const result = slots('2026-09-16', NOW, { value: 1, unit: 'week' })

    expect(result.filter((slot) => slot.endsWith(':due'))).toEqual([
      '2026-09-16:due',
      '2026-09-23:due',
      '2026-09-30:due',
      '2026-10-07:due',
      '2026-10-14:due',
      '2026-10-21:due',
      '2026-10-28:due',
      '2026-11-04:due',
      '2026-11-11:due',
    ])
    expect(result).toHaveLength(26)
    expect(result.at(-1)).toBe('2026-11-11:overdue')
  })

  it('programme le premier cycle d’un traitement toutes les 12 semaines, au-delà de 60 jours', () => {
    expect(slots('2026-12-08', NOW, { value: 12, unit: 'week' })).toEqual([
      '2026-12-08:before',
      '2026-12-08:due',
      '2026-12-08:overdue',
    ])
  })

  it('ne programme pas une relance qui tomberait après la prise suivante, tous les deux jours', () => {
    const result = slots('2026-09-16', NOW, { value: 2, unit: 'day' })

    expect(result.every((slot) => slot.endsWith(':due'))).toBe(true)
    expect(result).toHaveLength(30)
  })

  it('saute directement au premier cycle utile d’un traitement oublié depuis des années', () => {
    vi.mocked(addFrequency).mockClear()

    const result = slots('2016-09-15', NOW, { value: 1, unit: 'day' })

    expect(result[0]).toBe('2026-09-16:due')
    expect(vi.mocked(addFrequency).mock.calls.length).toBeLessThan(80)
  })

  it('passe aux rappels de juin quand la prise de mai n’est pas notée', () => {
    expect(slots('2026-05-15', new Date(2026, 4, 20, 12)).slice(0, 3)).toEqual([
      '2026-06-15:before',
      '2026-06-15:due',
      '2026-06-15:overdue',
    ])
  })

  it('relance d’abord la prise manquée tant que ses trois jours de retard sont à venir', () => {
    expect(slots('2026-05-15', new Date(2026, 4, 16, 12)).slice(0, 2)).toEqual([
      '2026-05-15:overdue',
      '2026-06-15:before',
    ])
  })

  it('rattrape plusieurs cycles manqués sans dériver en fin de mois', () => {
    expect(slots('2026-01-31', new Date(2026, 4, 2, 12))).toEqual([
      '2026-04-30:overdue',
      '2026-05-31:before',
      '2026-05-31:due',
      '2026-05-31:overdue',
      '2026-06-30:before',
      '2026-06-30:due',
    ])
  })

  it('cale une échéance du 31 sur le 30 du mois suivant', () => {
    expect(slots('2026-05-31', new Date(2026, 5, 1, 12))).toContain('2026-06-30:due')
  })

  it('ne sonne qu’une fois par jour pour un traitement quotidien', () => {
    const result = treatmentReminders(
      t,
      { ...MILBEMAX, nextDueDate: '2026-09-16', frequency: { value: 1, unit: 'day' } },
      LUNA,
      NOW,
    )

    expect(result).toHaveLength(60)
    expect(result.every(({ key }) => key.endsWith(':due'))).toBe(true)
    expect(new Set(result.map(({ at }) => at.getTime())).size).toBe(60)
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
