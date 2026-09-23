import { describe, expect, it } from 'vitest'

import { currentAnimalId } from '../logic/current-animal'

const MILO = '11111111-1111-4111-8111-111111111111'
const LUNA = '33333333-3333-4333-8333-333333333333'

describe('currentAnimalId — animal courant de l’accueil', () => {
  it('fait du seul animal du foyer l’animal courant, que sa chip soit sélectionnée ou non', () => {
    expect(currentAnimalId({ selectedId: null, animalIds: [MILO] })).toBe(MILO)
    expect(currentAnimalId({ selectedId: MILO, animalIds: [MILO] })).toBe(MILO)
  })

  it('prend la chip sélectionnée parmi plusieurs animaux', () => {
    expect(currentAnimalId({ selectedId: LUNA, animalIds: [MILO, LUNA] })).toBe(LUNA)
  })

  it('reste sur « tous » quand plusieurs animaux et aucune chip sélectionnée', () => {
    expect(currentAnimalId({ selectedId: null, animalIds: [MILO, LUNA] })).toBeNull()
  })

  it('n’a aucun animal courant quand le foyer est vide', () => {
    expect(currentAnimalId({ selectedId: null, animalIds: [] })).toBeNull()
  })

  it('ignore une sélection qui n’est plus dans le foyer', () => {
    expect(currentAnimalId({ selectedId: LUNA, animalIds: [MILO] })).toBe(MILO)
    expect(currentAnimalId({ selectedId: 'disparu', animalIds: [MILO, LUNA] })).toBeNull()
  })
})
