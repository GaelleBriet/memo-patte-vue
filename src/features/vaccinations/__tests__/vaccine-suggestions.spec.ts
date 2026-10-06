import { afterEach, describe, expect, it } from 'vitest'

import {
  carnetVaccineNames,
  labelledCombinations,
  suggestVaccineNames,
  usedForText,
  vaccineCombinationsFor,
} from '../logic/vaccine-suggestions'
import combinationsFile from '../logic/vaccine-combinations.json'
import i18n, { applyLocale } from '@/core/i18n'
import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'

const t = i18n.global.t

const milo = { id: 'milo', name: 'Milo', species: 'dog' as const }
const luna = { id: 'luna', name: 'Luna', species: 'dog' as const }
const pixel = { id: 'pixel', name: 'Pixel', species: 'cat' as const }

describe('vaccineCombinationsFor', () => {
  it('ne propose que les combinaisons de l’espèce, avec leurs sigles', () => {
    const dog = vaccineCombinationsFor('dog')
    const cat = vaccineCombinationsFor('cat')

    expect(dog).toContainEqual({
      diseases: ['distemper', 'hepatitis', 'parvovirus', 'parainfluenza'],
      aliases: ['CHPPi', 'DHPPi'],
    })
    expect(cat).toContainEqual({
      diseases: ['panleukopenia', 'catFlu'],
      aliases: ['RCP', 'CRP', 'CVR', 'HCP'],
    })
    expect(dog.some((combination) => combination.diseases.includes('catFlu'))).toBe(false)
    expect(cat.some((combination) => combination.diseases.includes('distemper'))).toBe(false)
  })
})

describe('labelledCombinations', () => {
  afterEach(() => applyLocale('fr'))

  it('nomme une combinaison par ses maladies, coryza du chat avec ses deux composantes', () => {
    expect(labelledCombinations(t, 'dog').map(({ label }) => label)).toContain(
      'Carré, hépatite, parvovirose, parainfluenza, leptospirose, rage',
    )
    expect(labelledCombinations(t, 'cat').map(({ label }) => label)).toContain(
      'Typhus, coryza (herpèsvirus, calicivirus), leucose',
    )
  })

  it('nomme les maladies en anglais britannique', () => {
    applyLocale('en')

    expect(labelledCombinations(t, 'dog').map(({ label }) => label)).toContain(
      'Distemper, hepatitis, parvovirus, parainfluenza',
    )
    expect(labelledCombinations(t, 'cat').map(({ label }) => label)).toContain(
      'Panleukopenia, cat flu (herpesvirus, calicivirus), feline leukaemia',
    )
  })

  it.each(['fr', 'en'] as const)(
    'donne en %s un libellé enregistrable à chaque combinaison de la liste',
    (locale) => {
      applyLocale(locale)

      for (const species of ['dog', 'cat'] as const) {
        for (const { label } of labelledCombinations(t, species)) {
          expect(label).not.toMatch(/vaccinations\.diseases/)
          expect(label.length).toBeLessThanOrEqual(MAX_NAME_LENGTH)
        }
      }
    },
  )

  it('a des sigles écrits pour chaque combinaison générée', () => {
    expect(combinationsFile.combinations.length).toBeGreaterThan(0)
    for (const { species, diseases } of combinationsFile.combinations) {
      const combination = vaccineCombinationsFor(species as 'dog' | 'cat').find(
        (entry) => entry.diseases.join() === diseases.join(),
      )
      expect(combination, `${species} : ${diseases.join(', ')}`).toBeDefined()
    }
  })
})

describe('carnetVaccineNames', () => {
  it('reprend les noms des animaux de la même espèce, fusionnés sans tenir compte de la casse ni des accents', () => {
    const names = carnetVaccineNames(
      [
        { name: 'CHPPi', animalId: 'milo' },
        { name: 'chppi', animalId: 'luna' },
        { name: 'Leptospirose', animalId: 'luna' },
        { name: 'Typhus', animalId: 'pixel' },
        { name: 'Rage', animalId: 'supprime' },
      ],
      [milo, luna, pixel],
      'dog',
    )

    expect(names).toEqual([
      { name: 'CHPPi', animalNames: ['Milo', 'Luna'] },
      { name: 'Leptospirose', animalNames: ['Luna'] },
    ])
  })

  it('ne répète pas un animal qui a deux vaccins du même nom', () => {
    const names = carnetVaccineNames(
      [
        { name: 'Rage', animalId: 'milo' },
        { name: 'RAGE', animalId: 'milo' },
      ],
      [milo],
      'dog',
    )

    expect(names).toEqual([{ name: 'Rage', animalNames: ['Milo'] }])
  })
})

describe('usedForText', () => {
  afterEach(() => applyLocale('fr'))

  it('nomme les animaux qui ont déjà ce vaccin', () => {
    expect(usedForText(t, ['Milo'])).toBe('Déjà utilisé pour Milo')
    expect(usedForText(t, ['Milo', 'Luna'])).toBe('Déjà utilisé pour Milo et Luna')

    applyLocale('en')

    expect(usedForText(t, ['Milo', 'Luna'])).toBe('Already used for Milo and Luna')
  })
})

describe('suggestVaccineNames', () => {
  const combinations = labelledCombinations(t, 'dog')
  const carnet = [{ name: 'CHPPi', animalNames: ['Milo'] }]

  it('ne propose rien tant que rien n’est tapé', () => {
    expect(suggestVaccineNames('  ', carnet, combinations)).toEqual({
      carnet: [],
      combinations: [],
      typed: null,
    })
  })

  it('retrouve les combinaisons par leurs sigles, la correspondance exacte d’abord', () => {
    const suggestions = suggestVaccineNames('chp', carnet, combinations)

    expect(suggestions.carnet).toEqual(carnet)
    expect(suggestions.combinations.map(({ label }) => label)).toEqual([
      'Carré, hépatite, parvovirose',
      'Carré, hépatite, parvovirose, leptospirose',
      'Carré, hépatite, parvovirose, parainfluenza',
      'Carré, hépatite, parvovirose, parainfluenza, leptospirose',
      'Carré, hépatite, parvovirose, parainfluenza, leptospirose, rage',
    ])
    expect(suggestions.typed).toBe('chp')
  })

  it('retrouve les combinaisons par leurs maladies, sans tenir compte des accents', () => {
    const labels = suggestVaccineNames('hepatite', [], combinations).combinations.map(
      ({ label }) => label,
    )

    expect(labels[0]).toBe('Carré, hépatite, parvovirose')
    expect(labels).toHaveLength(5)
  })

  it('met en tête la maladie seule qui correspond exactement', () => {
    const labels = suggestVaccineNames('Rage', [], combinations).combinations.map(
      ({ label }) => label,
    )

    expect(labels).toEqual([
      'Rage',
      'Carré, hépatite, parvovirose, parainfluenza, leptospirose, rage',
    ])
  })

  it('ne répète pas une combinaison déjà dans le carnet, ni le texte tapé qui en est une', () => {
    const suggestions = suggestVaccineNames(
      'rage',
      [{ name: 'rage', animalNames: ['Milo'] }],
      combinations,
    )

    expect(suggestions.carnet).toEqual([{ name: 'rage', animalNames: ['Milo'] }])
    expect(suggestions.combinations.map(({ label }) => label)).toEqual([
      'Carré, hépatite, parvovirose, parainfluenza, leptospirose, rage',
    ])
    expect(suggestions.typed).toBeNull()
  })

  it('garde le texte tapé quand rien ne lui correspond', () => {
    expect(suggestVaccineNames('Vaccin maison', carnet, combinations)).toEqual({
      carnet: [],
      combinations: [],
      typed: 'Vaccin maison',
    })
  })
})
