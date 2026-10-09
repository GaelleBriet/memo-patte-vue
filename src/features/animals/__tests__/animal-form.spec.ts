// @vitest-environment node
import { addDays, format } from 'date-fns'
import { afterEach, describe, expect, it } from 'vitest'

import {
  animalFormValuesFrom,
  birthDateApproximateHelp,
  canMarkBirthDateApproximate,
  emptyAnimalFormValues,
  validateAnimalForm,
  withBirthDate,
  type AnimalFormValues,
} from '../logic/animal-form'
import type { Animal } from '../schema/animal.schema'
import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import i18n from '@/core/i18n'
import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'
import { KG_PER_LB } from '@/shared/domain/weight-unit'
import { applyWeightUnit } from '@/shared/domain/weight-unit-preference'

const MILO: Animal = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Milo',
  species: 'dog',
  breed: null,
  birthDate: null,
  birthDateApproximate: false,
  photoPath: null,
  createdAt: '2026-09-09T09:00:00.000Z',
  updatedAt: '2026-09-09T09:00:00.000Z',
  deletedAt: null,
  unfollowedOn: null,
  departureReason: null,
  departureDate: null,
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
      birthDateApproximate: false,
      weightKg: '',
    })
  })
})

describe('animalFormValuesFrom', () => {
  it('pré-remplit les champs de l’animal, sans poids : il se corrige par les pesées', () => {
    expect(animalFormValuesFrom({ ...MILO, breed: 'Labrador', birthDate: '2023-03-12' })).toEqual({
      name: 'Milo',
      species: 'dog',
      breed: 'Labrador',
      birthDate: '2023-03-12',
      birthDateApproximate: false,
      weightKg: '',
    })
  })

  it('rend un champ optionnel absent comme un champ vide', () => {
    expect(animalFormValuesFrom(MILO)).toEqual({
      name: 'Milo',
      species: 'dog',
      breed: '',
      birthDate: '',
      birthDateApproximate: false,
      weightKg: '',
    })
  })

  it('fait l’aller-retour null → champ vide → null sans jamais produire la chaîne vide', () => {
    const resultat = validateAnimalForm(animalFormValuesFrom(MILO))

    if (!resultat.success) throw new Error('Validation refusée')

    expect(resultat.data.breed).toBeNull()
    expect(resultat.data.birthDate).toBeNull()
    expect(resultat.data.weightKg).toBeNull()
  })

  it('conserve les valeurs renseignées au fil de l’aller-retour', () => {
    const resultat = validateAnimalForm(
      animalFormValuesFrom({ ...MILO, breed: 'Labrador', birthDate: '2023-03-12' }),
    )

    if (!resultat.success) throw new Error('Validation refusée')

    expect(resultat.data).toEqual({
      name: 'Milo',
      species: 'dog',
      breed: 'Labrador',
      birthDate: '2023-03-12',
      birthDateApproximate: false,
      weightKg: null,
      photoPath: null,
    })
  })

  it('garde la date approximative de l’animal', () => {
    expect(
      animalFormValuesFrom({ ...MILO, birthDate: '2026-07-20', birthDateApproximate: true })
        .birthDateApproximate,
    ).toBe(true)
  })
})

describe('date de naissance approximative', () => {
  const t = i18n.global.t
  const TODAY = '2026-09-28'

  afterEach(() => {
    i18n.global.locale.value = 'fr'
  })

  it('enregistre la case cochée avec sa date', () => {
    expect(
      donnees({ birthDate: '2026-07-20', birthDateApproximate: true }).birthDateApproximate,
    ).toBe(true)
  })

  it('ne garde jamais la case cochée sans date', () => {
    expect(donnees({ birthDate: '', birthDateApproximate: true }).birthDateApproximate).toBe(false)
  })

  it('n’autorise la case qu’une fois la date saisie', () => {
    expect(canMarkBirthDateApproximate(valeurs({ birthDate: '' }))).toBe(false)
    expect(canMarkBirthDateApproximate(valeurs({ birthDate: '2026-07-20' }))).toBe(true)
  })

  it('décoche la case quand la date est effacée', () => {
    const cochee = valeurs({ birthDate: '2026-07-20', birthDateApproximate: true })

    expect(withBirthDate(cochee, '')).toEqual({
      ...cochee,
      birthDate: '',
      birthDateApproximate: false,
    })
  })

  it('garde la case quand la date change', () => {
    const cochee = valeurs({ birthDate: '2026-07-20', birthDateApproximate: true })

    expect(withBirthDate(cochee, '2026-07-21')).toEqual({ ...cochee, birthDate: '2026-07-21' })
  })

  it('explique la case désactivée tant qu’aucune date n’est saisie', () => {
    expect(birthDateApproximateHelp(t, valeurs({ birthDate: '' }), TODAY)).toBe(
      'Disponible une fois la date saisie.',
    )
  })

  it('annonce l’âge affiché une fois la case cochée', () => {
    expect(
      birthDateApproximateHelp(
        t,
        valeurs({ birthDate: '2026-07-20', birthDateApproximate: true }),
        TODAY,
      ),
    ).toBe('L’âge s’affichera «\u00a0environ 10 semaines\u00a0».')
  })

  it('ne dit rien quand la date est exacte', () => {
    expect(birthDateApproximateHelp(t, valeurs({ birthDate: '2026-07-20' }), TODAY)).toBeNull()
  })

  it('parle anglais', () => {
    i18n.global.locale.value = 'en'

    expect(birthDateApproximateHelp(t, valeurs({ birthDate: '' }), TODAY)).toBe(
      'Available once a date is entered.',
    )
    expect(
      birthDateApproximateHelp(
        t,
        valeurs({ birthDate: '2026-07-20', birthDateApproximate: true }),
        TODAY,
      ),
    ).toBe('Age will show as “about 10 weeks”.')
  })
})

describe('validateAnimalForm — champs optionnels', () => {
  it('rend null, jamais la chaîne vide, pour un champ optionnel laissé vide', () => {
    const data = donnees()

    expect(data.breed).toBeNull()
    expect(data.birthDate).toBeNull()
    expect(data.weightKg).toBeNull()
  })

  it('rend null pour un champ optionnel rempli d’espaces', () => {
    expect(donnees({ breed: '   ' }).breed).toBeNull()
  })

  it('conserve les champs optionnels renseignés', () => {
    const data = donnees({ breed: ' Labrador ', birthDate: '2023-03-12', weightKg: '8.5' })

    expect(data.breed).toBe('Labrador')
    expect(data.birthDate).toBe('2023-03-12')
    expect(data.weightKg).toBe(8.5)
  })

  it('accepte la virgule décimale des claviers français', () => {
    expect(donnees({ weightKg: '4,2' }).weightKg).toBe(4.2)
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

  it('accepte 80 caractères, refuse 81 avec un message distinct', () => {
    const limite = 'a'.repeat(MAX_NAME_LENGTH)

    expect(donnees({ name: limite }).name).toBe(limite)
    expect(erreurs({ name: `${limite}a` }).name).toBe('animals.form.errors.nameMax')
  })
})

describe('validateAnimalForm — race', () => {
  it('accepte 80 caractères, refuse 81 avec son propre message', () => {
    const limite = 'a'.repeat(MAX_NAME_LENGTH)

    expect(donnees({ breed: limite }).breed).toBe(limite)
    expect(erreurs({ breed: `${limite}a` })).toEqual({ breed: 'animals.form.errors.breedMax' })
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

describe('validateAnimalForm — poids saisi à la création', () => {
  it('refuse 0, qui n’est pas un champ vide', () => {
    expect(erreurs({ weightKg: '0' }).weightKg).toBe('animals.form.errors.initialWeightKg')
  })

  it('refuse un poids négatif', () => {
    expect(erreurs({ weightKg: '-1' }).weightKg).toBe('animals.form.errors.initialWeightKg')
  })

  it('refuse un poids illisible', () => {
    expect(erreurs({ weightKg: 'lourd' }).weightKg).toBe('animals.form.errors.initialWeightKg')
  })

  it('refuse un poids au-delà de l’échelle, avec un message distinct', () => {
    expect(erreurs({ weightKg: '2000' }).weightKg).toBe('animals.form.errors.initialWeightKgMax')
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
    expect(erreurs({ name: '', weightKg: '0' })).toEqual({
      name: 'animals.form.errors.name',
      weightKg: 'animals.form.errors.initialWeightKg',
    })
  })
})

describe('poids saisi en livres', () => {
  afterEach(() => applyWeightUnit('kg'))

  it('l’enregistre en kg', () => {
    applyWeightUnit('lb')

    expect(donnees({ weightKg: '18.7' }).weightKg).toBe(18.7 * KG_PER_LB)
  })

  it('refuse au-delà de la borne convertie', () => {
    applyWeightUnit('lb')

    expect(erreurs({ weightKg: '441' }).weightKg).toBe('animals.form.errors.initialWeightKgMax')
    expect(donnees({ weightKg: '440.9' }).weightKg).toBeLessThanOrEqual(200)
    expect(erreurs({ weightKg: '440.92' }).weightKg).toBe('animals.form.errors.initialWeightKgMax')
  })
})
