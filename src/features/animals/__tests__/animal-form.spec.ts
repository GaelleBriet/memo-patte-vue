// @vitest-environment node
import { addDays, format } from 'date-fns'
import { afterEach, describe, expect, it } from 'vitest'

import {
  animalFormValuesFrom,
  emptyAnimalFormValues,
  validateAnimalForm,
  type AnimalFormValues,
} from '../logic/animal-form'
import type { Animal } from '../schema/animal.schema'
import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import { KG_PER_LB } from '@/shared/domain/weight-unit'
import { applyWeightUnit } from '@/shared/domain/weight-unit-preference'

const MILO: Animal = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Milo',
  species: 'dog',
  breed: null,
  birthDate: null,
  initialWeightKg: null,
  photoPath: null,
  createdAt: '2026-09-09T09:00:00.000Z',
  updatedAt: '2026-09-09T09:00:00.000Z',
  deletedAt: null,
}

function valeurs(surcharges: Partial<AnimalFormValues> = {}): AnimalFormValues {
  return { ...emptyAnimalFormValues(), name: 'Milo', species: 'dog', ...surcharges }
}

function donnees(surcharges: Partial<AnimalFormValues> = {}) {
  const resultat = validateAnimalForm(valeurs(surcharges))

  if (!resultat.success) throw new Error(`Validation refusée : ${JSON.stringify(resultat.errors)}`)

  return resultat.data
}

function erreurs(surcharges: Partial<AnimalFormValues> = {}) {
  const resultat = validateAnimalForm(valeurs(surcharges))

  if (resultat.success) throw new Error('Validation acceptée alors qu’elle devait échouer')

  return resultat.errors
}

describe('emptyAnimalFormValues', () => {
  it('part de champs vides et d’aucune espèce choisie', () => {
    expect(emptyAnimalFormValues()).toEqual({
      name: '',
      species: null,
      breed: '',
      birthDate: '',
      initialWeightKg: '',
    })
  })
})

describe('animalFormValuesFrom', () => {
  it('pré-remplit les cinq champs depuis un animal, le poids en texte', () => {
    expect(
      animalFormValuesFrom({
        ...MILO,
        breed: 'Labrador',
        birthDate: '2023-03-12',
        initialWeightKg: 8.5,
      }),
    ).toEqual({
      name: 'Milo',
      species: 'dog',
      breed: 'Labrador',
      birthDate: '2023-03-12',
      initialWeightKg: '8.5',
    })
  })

  it('rend un champ optionnel absent comme un champ vide', () => {
    expect(animalFormValuesFrom(MILO)).toEqual({
      name: 'Milo',
      species: 'dog',
      breed: '',
      birthDate: '',
      initialWeightKg: '',
    })
  })

  it('fait l’aller-retour null → champ vide → null sans jamais produire la chaîne vide', () => {
    const resultat = validateAnimalForm(animalFormValuesFrom(MILO))

    if (!resultat.success) throw new Error('Validation refusée')

    expect(resultat.data.breed).toBeNull()
    expect(resultat.data.birthDate).toBeNull()
    expect(resultat.data.initialWeightKg).toBeNull()
  })

  it('conserve les valeurs renseignées au fil de l’aller-retour', () => {
    const resultat = validateAnimalForm(
      animalFormValuesFrom({
        ...MILO,
        breed: 'Labrador',
        birthDate: '2023-03-12',
        initialWeightKg: 8.5,
      }),
    )

    if (!resultat.success) throw new Error('Validation refusée')

    expect(resultat.data).toEqual({
      name: 'Milo',
      species: 'dog',
      breed: 'Labrador',
      birthDate: '2023-03-12',
      initialWeightKg: 8.5,
      photoPath: null,
    })
  })
})

describe('validateAnimalForm — champs optionnels', () => {
  it('rend null, jamais la chaîne vide, pour un champ optionnel laissé vide', () => {
    const data = donnees()

    expect(data.breed).toBeNull()
    expect(data.birthDate).toBeNull()
    expect(data.initialWeightKg).toBeNull()
  })

  it('rend null pour un champ optionnel rempli d’espaces', () => {
    expect(donnees({ breed: '   ' }).breed).toBeNull()
  })

  it('conserve les champs optionnels renseignés', () => {
    const data = donnees({ breed: ' Labrador ', birthDate: '2023-03-12', initialWeightKg: '8.5' })

    expect(data.breed).toBe('Labrador')
    expect(data.birthDate).toBe('2023-03-12')
    expect(data.initialWeightKg).toBe(8.5)
  })

  it('accepte la virgule décimale des claviers français', () => {
    expect(donnees({ initialWeightKg: '4,2' }).initialWeightKg).toBe(4.2)
  })

  it('ne renseigne jamais la photo, hors du périmètre de l’écran', () => {
    expect(donnees().photoPath).toBeNull()
  })
})

describe('validateAnimalForm — nom', () => {
  it('supprime les espaces autour du nom', () => {
    expect(donnees({ name: '  Milo  ' }).name).toBe('Milo')
  })

  it('refuse un nom vide', () => {
    expect(erreurs({ name: '' }).name).toBe('animals.form.errors.name')
  })

  it('refuse un nom fait d’espaces', () => {
    expect(erreurs({ name: '   ' }).name).toBe('animals.form.errors.name')
  })
})

describe('validateAnimalForm — espèce', () => {
  it('accepte les deux seules espèces du schéma', () => {
    expect(donnees({ species: 'dog' }).species).toBe('dog')
    expect(donnees({ species: 'cat' }).species).toBe('cat')
  })

  it('refuse l’absence d’espèce', () => {
    expect(erreurs({ species: null }).species).toBe('animals.form.errors.species')
  })
})

describe('validateAnimalForm — poids initial', () => {
  it('refuse 0, qui n’est pas un champ vide', () => {
    expect(erreurs({ initialWeightKg: '0' }).initialWeightKg).toBe(
      'animals.form.errors.initialWeightKg',
    )
  })

  it('refuse un poids négatif', () => {
    expect(erreurs({ initialWeightKg: '-1' }).initialWeightKg).toBe(
      'animals.form.errors.initialWeightKg',
    )
  })

  it('refuse un poids illisible', () => {
    expect(erreurs({ initialWeightKg: 'lourd' }).initialWeightKg).toBe(
      'animals.form.errors.initialWeightKg',
    )
  })

  it('refuse un poids au-delà de l’échelle, avec un message distinct', () => {
    expect(erreurs({ initialWeightKg: '2000' }).initialWeightKg).toBe(
      'animals.form.errors.initialWeightKgMax',
    )
  })
})

describe('validateAnimalForm — date de naissance', () => {
  it('refuse une date dans le futur', () => {
    const demain = format(addDays(new Date(), 1), 'yyyy-MM-dd')

    expect(erreurs({ birthDate: demain }).birthDate).toBe('animals.form.errors.birthDate')
  })

  it('accepte la date du jour', () => {
    expect(donnees({ birthDate: todayIsoDate() }).birthDate).toBe(todayIsoDate())
  })
})

describe('validateAnimalForm — plusieurs erreurs', () => {
  it('signale le nom vide et le poids à 0 en même temps (état F3)', () => {
    expect(erreurs({ name: '', initialWeightKg: '0' })).toEqual({
      name: 'animals.form.errors.name',
      initialWeightKg: 'animals.form.errors.initialWeightKg',
    })
  })
})

describe('poids initial en livres', () => {
  afterEach(() => applyWeightUnit('kg'))

  it('enregistre en kg un poids initial saisi en livres', () => {
    applyWeightUnit('lb')

    expect(donnees({ initialWeightKg: '18.7' }).initialWeightKg).toBe(18.7 * KG_PER_LB)
  })

  it('refuse au-delà de la borne convertie', () => {
    applyWeightUnit('lb')

    expect(erreurs({ initialWeightKg: '441' }).initialWeightKg).toBe(
      'animals.form.errors.initialWeightKgMax',
    )
    expect(donnees({ initialWeightKg: '440.9' }).initialWeightKg).toBeLessThanOrEqual(200)
  })

  it('propose le poids initial en livres, au centième', () => {
    applyWeightUnit('lb')

    expect(animalFormValuesFrom({ ...MILO, initialWeightKg: 8.5 }).initialWeightKg).toBe('18.74')
  })

  it('rend le poids initial enregistré tel quel quand la valeur proposée n’a pas bougé', () => {
    applyWeightUnit('lb')
    const milo = { ...MILO, initialWeightKg: 8.5 }

    const resultat = validateAnimalForm(animalFormValuesFrom(milo), milo.initialWeightKg)

    expect(resultat.success && resultat.data.initialWeightKg).toBe(8.5)
  })
})
