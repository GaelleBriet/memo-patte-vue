// @vitest-environment node
import { addDays, format } from 'date-fns'
import { describe, expect, it } from 'vitest'

import {
  emptyTreatmentFormValues,
  nextDoseDate,
  treatmentFormValuesFrom,
  validateTreatmentForm,
  type TreatmentFormValues,
} from '../logic/treatment-form'
import type { Treatment } from '../schema/treatment.schema'
import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'

const BRAVECTO: Treatment = {
  id: '22222222-2222-4222-8222-222222222222',
  animalId: '11111111-1111-4111-8111-111111111111',
  name: 'Bravecto',
  type: 'antiparasitic',
  frequency: { value: 3, unit: 'month' },
  lastDoseDate: '2026-06-24',
  nextDueDate: '2026-09-24',
  createdAt: '2026-09-09T09:00:00.000Z',
  updatedAt: '2026-09-09T09:00:00.000Z',
  deletedAt: null,
}

function valeurs(surcharges: Partial<TreatmentFormValues> = {}): TreatmentFormValues {
  return {
    ...emptyTreatmentFormValues(),
    name: 'Bravecto',
    type: 'antiparasitic',
    frequencyValue: '3',
    frequencyUnit: 'month',
    lastDoseDate: '2026-06-24',
    ...surcharges,
  }
}

function donnees(surcharges: Partial<TreatmentFormValues> = {}) {
  const resultat = validateTreatmentForm(valeurs(surcharges))

  if (!resultat.success) throw new Error(`Validation refusée : ${JSON.stringify(resultat.errors)}`)

  return resultat.data
}

function erreurs(surcharges: Partial<TreatmentFormValues> = {}) {
  const resultat = validateTreatmentForm(valeurs(surcharges))

  if (resultat.success) throw new Error('Validation acceptée alors qu’elle devait échouer')

  return resultat.errors
}

describe('emptyTreatmentFormValues', () => {
  it('part de champs vides, sans type choisi, l’unité au mois', () => {
    expect(emptyTreatmentFormValues()).toEqual({
      name: '',
      type: null,
      frequencyValue: '',
      frequencyUnit: 'month',
      lastDoseDate: '',
    })
  })
})

describe('treatmentFormValuesFrom', () => {
  it('pré-remplit les champs depuis un traitement, sans y glisser l’animal ni l’échéance', () => {
    expect(treatmentFormValuesFrom(BRAVECTO)).toEqual({
      name: 'Bravecto',
      type: 'antiparasitic',
      frequencyValue: '3',
      frequencyUnit: 'month',
      lastDoseDate: '2026-06-24',
    })
  })
})

describe('validateTreatmentForm — données', () => {
  it('ne contient jamais d’animal : il vient de la route ou du traitement existant', () => {
    expect(donnees()).not.toHaveProperty('animalId')
  })

  it('rend la fréquence en couple valeur entière + unité', () => {
    expect(donnees()).toEqual({
      name: 'Bravecto',
      type: 'antiparasitic',
      frequency: { value: 3, unit: 'month' },
      lastDoseDate: '2026-06-24',
    })
  })

  it('supprime les espaces autour du nom et de la valeur de fréquence', () => {
    expect(donnees({ name: '  Bravecto  ', frequencyValue: ' 2 ' })).toMatchObject({
      name: 'Bravecto',
      frequency: { value: 2 },
    })
  })
})

describe('validateTreatmentForm — nom et type', () => {
  it('refuse un nom vide ou fait d’espaces', () => {
    expect(erreurs({ name: '' }).name).toBe('treatments.form.errors.name')
    expect(erreurs({ name: '   ' }).name).toBe('treatments.form.errors.name')
  })

  it('refuse un type non choisi', () => {
    expect(erreurs({ type: null }).type).toBe('treatments.form.errors.type')
  })
})

describe('validateTreatmentForm — fréquence', () => {
  it('refuse une valeur absente', () => {
    expect(erreurs({ frequencyValue: '' }).frequency).toBe('treatments.form.errors.frequency')
  })

  it('refuse zéro, un négatif, un décimal ou du texte', () => {
    for (const frequencyValue of ['0', '-1', '1.5', 'abc']) {
      expect(erreurs({ frequencyValue }).frequency).toBe('treatments.form.errors.frequency')
    }
  })

  it('dit le plafond quand la valeur le dépasse, au lieu de la croire absente', () => {
    expect(erreurs({ frequencyValue: '10000000' }).frequency).toBe(
      'treatments.form.errors.frequencyMax',
    )
    expect(erreurs({ frequencyValue: '366' }).frequency).toBe('treatments.form.errors.frequencyMax')
  })

  it('accepte chaque unité', () => {
    expect(donnees({ frequencyUnit: 'day' }).frequency.unit).toBe('day')
    expect(donnees({ frequencyUnit: 'week' }).frequency.unit).toBe('week')
  })
})

describe('validateTreatmentForm — date de la dernière prise', () => {
  it('refuse une date absente', () => {
    expect(erreurs({ lastDoseDate: '' }).lastDoseDate).toBe('treatments.form.errors.lastDoseDate')
  })

  it('refuse une date dans le futur, avec un message distinct', () => {
    const demain = format(addDays(new Date(), 1), 'yyyy-MM-dd')

    expect(erreurs({ lastDoseDate: demain }).lastDoseDate).toBe(
      'treatments.form.errors.lastDoseDateFuture',
    )
  })

  it('accepte la date du jour', () => {
    expect(donnees({ lastDoseDate: todayIsoDate() }).lastDoseDate).toBe(todayIsoDate())
  })
})

describe('validateTreatmentForm — plusieurs erreurs', () => {
  it('signale tous les champs vides en même temps', () => {
    expect(erreurs(emptyTreatmentFormValues())).toEqual({
      name: 'treatments.form.errors.name',
      type: 'treatments.form.errors.type',
      frequency: 'treatments.form.errors.frequency',
      lastDoseDate: 'treatments.form.errors.lastDoseDate',
    })
  })
})

describe('nextDoseDate — aperçu en direct', () => {
  it('calcule la prochaine dose dès que fréquence et date sont valides, sans le reste', () => {
    expect(nextDoseDate(valeurs({ name: '', type: null }))).toBe('2026-09-24')
    expect(nextDoseDate(valeurs({ frequencyValue: '2', frequencyUnit: 'week' }))).toBe('2026-07-08')
  })

  it('ne rend rien tant que la fréquence ou la date manque ou est invalide', () => {
    expect(nextDoseDate(valeurs({ frequencyValue: '' }))).toBeNull()
    expect(nextDoseDate(valeurs({ frequencyValue: '0' }))).toBeNull()
    expect(nextDoseDate(valeurs({ lastDoseDate: '' }))).toBeNull()
    expect(nextDoseDate(valeurs({ lastDoseDate: '2999-01-01' }))).toBeNull()
  })
})
