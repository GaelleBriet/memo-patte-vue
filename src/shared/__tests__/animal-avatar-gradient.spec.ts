import { describe, it, expect } from 'vitest'

import {
  ANIMAL_AVATAR_GRADIENTS,
  animalAvatarGradient,
  animalAvatarGradientCss,
} from '../animal-avatar-gradient'

describe('animalAvatarGradient', () => {
  it('rend le même dégradé pour un même identifiant', () => {
    const premier = animalAvatarGradient('4f7f1f2e-1f0c-4a3e-9d0a-3d2b1c0e9f8a')
    const second = animalAvatarGradient('4f7f1f2e-1f0c-4a3e-9d0a-3d2b1c0e9f8a')

    expect(second).toEqual(premier)
  })

  it('ne rend que des dégradés de la palette', () => {
    const identifiants = Array.from({ length: 50 }, (_, index) => `animal-${index}`)

    for (const identifiant of identifiants) {
      expect(ANIMAL_AVATAR_GRADIENTS).toContainEqual(animalAvatarGradient(identifiant))
    }
  })

  it('répartit les animaux sur toute la palette', () => {
    const identifiants = Array.from({ length: 60 }, (_, index) => `animal-${index}`)
    const utilises = new Set(identifiants.map((id) => animalAvatarGradient(id).from))

    expect(utilises.size).toBe(ANIMAL_AVATAR_GRADIENTS.length)
  })

  it('rend malgré tout un dégradé de la palette pour un identifiant vide', () => {
    expect(ANIMAL_AVATAR_GRADIENTS).toContainEqual(animalAvatarGradient(''))
  })

  it('exprime le dégradé en CSS', () => {
    const { from, to } = animalAvatarGradient('milo')

    expect(animalAvatarGradientCss('milo')).toBe(`linear-gradient(160deg, ${from}, ${to})`)
  })
})
