// @vitest-environment node
import { addDays, format } from 'date-fns'
import { describe, expect, it } from 'vitest'

import {
  emptyVaccinationFormValues,
  todayIsoDate,
  validateVaccinationForm,
  vaccinationFormValuesFrom,
  type VaccinationFormValues,
} from '../vaccination-form'
import type { Vaccination } from '../vaccination.schema'

function valeurs(surcharges: Partial<VaccinationFormValues> = {}): VaccinationFormValues {
  return {
    ...emptyVaccinationFormValues(),
    name: 'Rage',
    lastInjectionDate: '2026-03-12',
    ...surcharges,
  }
}

function donnees(surcharges: Partial<VaccinationFormValues> = {}) {
  const resultat = validateVaccinationForm(valeurs(surcharges))

  if (!resultat.success) throw new Error(`Validation refusée : ${JSON.stringify(resultat.errors)}`)

  return resultat.data
}

function erreurs(surcharges: Partial<VaccinationFormValues> = {}) {
  const resultat = validateVaccinationForm(valeurs(surcharges))

  if (resultat.success) throw new Error('Validation acceptée alors qu’elle devait échouer')

  return resultat.errors
}

describe('emptyVaccinationFormValues', () => {
  it('part de trois champs vides, sans animal', () => {
    expect(emptyVaccinationFormValues()).toEqual({ name: '', lastInjectionDate: '', dueDate: '' })
  })
})

describe('vaccinationFormValuesFrom', () => {
  const rage: Vaccination = {
    id: '22222222-2222-4222-8222-222222222222',
    animalId: '11111111-1111-4111-8111-111111111111',
    name: 'Rage',
    lastInjectionDate: '2026-03-12',
    dueDate: null,
    createdAt: '2026-09-09T09:00:00.000Z',
    updatedAt: '2026-09-09T09:00:00.000Z',
    deletedAt: null,
  }

  it('pré-remplit les champs depuis un vaccin, sans y glisser l’animal', () => {
    expect(vaccinationFormValuesFrom({ ...rage, dueDate: '2027-03-12' })).toEqual({
      name: 'Rage',
      lastInjectionDate: '2026-03-12',
      dueDate: '2027-03-12',
    })
  })

  it('rend une échéance absente comme un champ vide', () => {
    expect(vaccinationFormValuesFrom(rage).dueDate).toBe('')
  })
})

describe('todayIsoDate', () => {
  it('rend la date du jour au format du champ date natif', () => {
    expect(todayIsoDate()).toBe(format(new Date(), 'yyyy-MM-dd'))
  })
})

describe('validateVaccinationForm — données', () => {
  it('ne contient jamais d’animal : il vient de la route ou du vaccin existant', () => {
    expect(donnees()).not.toHaveProperty('animalId')
  })

  it('supprime les espaces autour du nom', () => {
    expect(donnees({ name: '  Rage  ' }).name).toBe('Rage')
  })

  it('rend null, jamais la chaîne vide, pour une échéance laissée vide', () => {
    expect(donnees().dueDate).toBeNull()
    expect(donnees({ dueDate: '   ' }).dueDate).toBeNull()
  })

  it('conserve une échéance renseignée', () => {
    expect(donnees({ dueDate: '2027-03-12' }).dueDate).toBe('2027-03-12')
  })

  it('accepte une échéance déjà passée : un vaccin peut être consigné en retard', () => {
    expect(donnees({ dueDate: '2020-01-01' }).dueDate).toBe('2020-01-01')
  })
})

describe('validateVaccinationForm — nom', () => {
  it('refuse un nom vide', () => {
    expect(erreurs({ name: '' }).name).toBe('vaccinations.form.errors.name')
  })

  it('refuse un nom fait d’espaces', () => {
    expect(erreurs({ name: '   ' }).name).toBe('vaccinations.form.errors.name')
  })
})

describe('validateVaccinationForm — date d’injection', () => {
  it('refuse une date absente', () => {
    expect(erreurs({ lastInjectionDate: '' }).lastInjectionDate).toBe(
      'vaccinations.form.errors.lastInjectionDate',
    )
  })

  it('refuse une date dans le futur, avec un message distinct', () => {
    const demain = format(addDays(new Date(), 1), 'yyyy-MM-dd')

    expect(erreurs({ lastInjectionDate: demain }).lastInjectionDate).toBe(
      'vaccinations.form.errors.lastInjectionDateFuture',
    )
  })

  it('accepte la date du jour', () => {
    expect(donnees({ lastInjectionDate: todayIsoDate() }).lastInjectionDate).toBe(todayIsoDate())
  })
})

describe('validateVaccinationForm — plusieurs erreurs', () => {
  it('signale le nom vide et la date absente en même temps', () => {
    expect(erreurs({ name: '', lastInjectionDate: '' })).toEqual({
      name: 'vaccinations.form.errors.name',
      lastInjectionDate: 'vaccinations.form.errors.lastInjectionDate',
    })
  })
})
