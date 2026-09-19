// @vitest-environment node
import { addDays, format } from 'date-fns'
import { describe, expect, it } from 'vitest'

import { emptyWeightFormValues, validateWeightForm, type WeightFormValues } from '../weight-form'
import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'

const MILO = '11111111-1111-4111-8111-111111111111'

function valeurs(surcharges: Partial<WeightFormValues> = {}): WeightFormValues {
  return { ...emptyWeightFormValues(MILO), weightKg: '24,7', ...surcharges }
}

function donnees(surcharges: Partial<WeightFormValues> = {}) {
  const resultat = validateWeightForm(valeurs(surcharges))

  if (!resultat.success) throw new Error(`Validation refusée : ${JSON.stringify(resultat.errors)}`)

  return resultat.data
}

function erreurs(surcharges: Partial<WeightFormValues> = {}) {
  const resultat = validateWeightForm(valeurs(surcharges))

  if (resultat.success) throw new Error('Validation acceptée alors qu’elle devait échouer')

  return resultat.errors
}

describe('emptyWeightFormValues', () => {
  it('part sans animal, poids vide et date du jour', () => {
    expect(emptyWeightFormValues()).toEqual({
      animalId: null,
      weightKg: '',
      measuredOn: todayIsoDate(),
    })
  })

  it('garde l’animal fourni par le contexte d’ouverture', () => {
    expect(emptyWeightFormValues(MILO).animalId).toBe(MILO)
  })
})

describe('validateWeightForm — données', () => {
  it('rend une entrée prête pour le store, avec l’animal', () => {
    expect(donnees()).toEqual({ animalId: MILO, weightKg: 24.7, measuredOn: todayIsoDate() })
  })

  it('accepte le point comme la virgule décimale', () => {
    expect(donnees({ weightKg: '24.7' }).weightKg).toBe(24.7)
    expect(donnees({ weightKg: ' 4,2 ' }).weightKg).toBe(4.2)
  })

  it('accepte une date passée', () => {
    expect(donnees({ measuredOn: '2020-01-01' }).measuredOn).toBe('2020-01-01')
  })
})

describe('validateWeightForm — animal', () => {
  it('exige un animal choisi', () => {
    expect(erreurs({ animalId: null }).animalId).toBe('weight.form.errors.animalId')
  })
})

describe('validateWeightForm — poids', () => {
  it('refuse un poids vide', () => {
    expect(erreurs({ weightKg: '' }).weightKg).toBe('weight.form.errors.weightKg')
  })

  it('refuse 0 et un poids négatif', () => {
    expect(erreurs({ weightKg: '0' }).weightKg).toBe('weight.form.errors.weightKg')
    expect(erreurs({ weightKg: '-3' }).weightKg).toBe('weight.form.errors.weightKg')
  })

  it('refuse un texte qui n’est pas un nombre', () => {
    expect(erreurs({ weightKg: 'lourd' }).weightKg).toBe('weight.form.errors.weightKg')
  })

  it('refuse un poids au-delà de l’échelle, avec un message distinct', () => {
    expect(erreurs({ weightKg: '2000' }).weightKg).toBe('weight.form.errors.weightKgMax')
  })
})

describe('validateWeightForm — date', () => {
  it('refuse une date effacée', () => {
    expect(erreurs({ measuredOn: '' }).measuredOn).toBe('weight.form.errors.measuredOn')
    expect(erreurs({ measuredOn: '  ' }).measuredOn).toBe('weight.form.errors.measuredOn')
  })

  it('refuse une date dans le futur, avec un message distinct', () => {
    const demain = format(addDays(new Date(), 1), 'yyyy-MM-dd')

    expect(erreurs({ measuredOn: demain }).measuredOn).toBe('weight.form.errors.measuredOnFuture')
  })
})

describe('validateWeightForm — plusieurs erreurs', () => {
  it('signale le poids et la date en même temps', () => {
    expect(erreurs({ weightKg: '0', measuredOn: '' })).toEqual({
      weightKg: 'weight.form.errors.weightKg',
      measuredOn: 'weight.form.errors.measuredOn',
    })
  })

  it('sans animal, ne signale que l’animal : le poids et la date ne sont pas encore saisissables', () => {
    expect(erreurs({ animalId: null, weightKg: '0', measuredOn: '' })).toEqual({
      animalId: 'weight.form.errors.animalId',
    })
  })
})
