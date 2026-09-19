import { describe, expect, it } from 'vitest'

import { quickActionAnimalId } from '../logic/quick-actions'

const MILO = '11111111-1111-4111-8111-111111111111'
const LUNA = '33333333-3333-4333-8333-333333333333'

describe('quickActionAnimalId — animal visé par une action rapide', () => {
  it('prend l’animal de la chip sélectionnée', () => {
    expect(quickActionAnimalId({ selectedId: LUNA, animalIds: [MILO, LUNA] })).toBe(LUNA)
  })

  it('prend le seul animal du foyer quand aucune chip n’est sélectionnée', () => {
    expect(quickActionAnimalId({ selectedId: null, animalIds: [MILO] })).toBe(MILO)
  })

  it('laisse le choix quand plusieurs animaux et aucune sélection', () => {
    expect(quickActionAnimalId({ selectedId: null, animalIds: [MILO, LUNA] })).toBeNull()
  })

  it('laisse le choix quand le foyer est vide', () => {
    expect(quickActionAnimalId({ selectedId: null, animalIds: [] })).toBeNull()
  })

  it('passe à la règle suivante quand la sélection n’est plus dans le foyer', () => {
    expect(quickActionAnimalId({ selectedId: LUNA, animalIds: [MILO] })).toBe(MILO)
    expect(quickActionAnimalId({ selectedId: 'disparu', animalIds: [MILO, LUNA] })).toBeNull()
  })
})
