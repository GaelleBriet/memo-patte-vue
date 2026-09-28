// @vitest-environment node
import { addDays, format } from 'date-fns'
import { afterEach, describe, expect, it } from 'vitest'

import {
  emptyWeightFormValues,
  validateWeightForm,
  weightFormValuesFrom,
  type WeightFormValues,
} from '../logic/weight-form'
import type { WeightEntry } from '../schema/weight.schema'
import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import { KG_PER_LB } from '@/shared/domain/weight-unit'
import { applyWeightUnit } from '@/shared/domain/weight-unit-preference'

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

const PESEE: WeightEntry = {
  id: '22222222-2222-4222-8222-222222222222',
  animalId: MILO,
  weightKg: 24.55,
  measuredOn: '2026-08-25',
  createdAt: '2026-09-09T09:00:00.000Z',
  updatedAt: '2026-09-09T09:00:00.000Z',
  deletedAt: null,
}

describe('weightFormValuesFrom', () => {
  it('pré-remplit la pesée à corriger, poids écrit sans arrondi', () => {
    expect(weightFormValuesFrom(PESEE)).toEqual({
      animalId: MILO,
      weightKg: '24,55',
      measuredOn: '2026-08-25',
    })
  })

  it('rend à l’identique une pesée enregistrée sans rien changer', () => {
    expect(donnees(weightFormValuesFrom(PESEE))).toEqual({
      animalId: MILO,
      weightKg: 24.55,
      measuredOn: '2026-08-25',
    })
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

describe('pesée saisie en livres, corrigée en kilos', () => {
  const EN_LIVRES: WeightEntry = { ...PESEE, weightKg: 54.1 * KG_PER_LB }

  it('propose le poids au centième, sans décimales parasites', () => {
    expect(weightFormValuesFrom(EN_LIVRES).weightKg).toBe('24,54')
  })

  it('garde le poids enregistré tel quel quand la valeur proposée n’a pas bougé', () => {
    const resultat = validateWeightForm(weightFormValuesFrom(EN_LIVRES), EN_LIVRES.weightKg)

    expect(resultat.success && resultat.data.weightKg).toBe(EN_LIVRES.weightKg)
  })
})

describe('en livres', () => {
  afterEach(() => applyWeightUnit('kg'))

  it('enregistre en kg un poids saisi en livres', () => {
    applyWeightUnit('lb')

    expect(donnees({ weightKg: '54' }).weightKg).toBe(54 * KG_PER_LB)
  })

  it('refuse 0 lb et dit la borne haute convertie', () => {
    applyWeightUnit('lb')

    expect(erreurs({ weightKg: '0' }).weightKg).toBe('weight.form.errors.weightKg')
    expect(erreurs({ weightKg: '441' }).weightKg).toBe('weight.form.errors.weightKgMax')
    expect(donnees({ weightKg: '440,9' }).weightKg).toBeLessThanOrEqual(200)
  })

  it('refuse au-delà du dixième annoncé, même sous 200 kg', () => {
    applyWeightUnit('lb')

    expect(erreurs({ weightKg: '440,92' })).toEqual({ weightKg: 'weight.form.errors.weightKgMax' })
    expect(erreurs({ weightKg: '440,92', measuredOn: '' })).toEqual({
      weightKg: 'weight.form.errors.weightKgMax',
      measuredOn: 'weight.form.errors.measuredOn',
    })
  })

  it('garde une pesée enregistrée à 200 kg quand son poids proposé n’a pas bougé', () => {
    applyWeightUnit('lb')
    const lourde: WeightEntry = { ...PESEE, weightKg: 200 }

    const resultat = validateWeightForm(weightFormValuesFrom(lourde), lourde.weightKg)

    expect(resultat.success && resultat.data.weightKg).toBe(200)
  })

  it('propose la pesée à corriger en livres, au centième', () => {
    applyWeightUnit('lb')

    expect(weightFormValuesFrom(PESEE).weightKg).toBe('54,12')
  })

  it('rend le poids enregistré tel quel quand la valeur proposée n’a pas bougé', () => {
    applyWeightUnit('lb')

    const resultat = validateWeightForm(weightFormValuesFrom(PESEE), PESEE.weightKg)

    expect(resultat.success && resultat.data.weightKg).toBe(24.55)
  })

  it('enregistre la nouvelle valeur dès qu’elle change', () => {
    applyWeightUnit('lb')

    const resultat = validateWeightForm(
      { ...weightFormValuesFrom(PESEE), weightKg: '54,2' },
      PESEE.weightKg,
    )

    expect(resultat.success && resultat.data.weightKg).toBe(54.2 * KG_PER_LB)
  })
})
