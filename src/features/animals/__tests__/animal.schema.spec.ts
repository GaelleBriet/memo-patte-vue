import { describe, expect, it } from 'vitest'
import { animalInputSchema } from '../animal.schema'

const validInput = { name: 'Miette', species: 'cat' } as const

describe('animalInputSchema', () => {
  it('complète les champs facultatifs à null', () => {
    expect(animalInputSchema.parse(validInput)).toEqual({
      name: 'Miette',
      species: 'cat',
      breed: null,
      birthDate: null,
      initialWeightKg: null,
      photoPath: null,
    })
  })

  it('supprime les espaces autour du nom', () => {
    expect(animalInputSchema.parse({ ...validInput, name: '  Miette  ' }).name).toBe('Miette')
  })

  it('rejette un nom vide ou seulement composé d’espaces', () => {
    expect(animalInputSchema.safeParse({ ...validInput, name: '   ' }).success).toBe(false)
  })

  it('rejette une espèce hors chien/chat', () => {
    expect(animalInputSchema.safeParse({ ...validInput, species: 'rabbit' }).success).toBe(false)
  })

  it('accepte chien et chat', () => {
    expect(animalInputSchema.safeParse({ ...validInput, species: 'dog' }).success).toBe(true)
    expect(animalInputSchema.safeParse({ ...validInput, species: 'cat' }).success).toBe(true)
  })

  it('rejette un poids nul ou négatif mais accepte l’absence de poids', () => {
    expect(animalInputSchema.safeParse({ ...validInput, initialWeightKg: 0 }).success).toBe(false)
    expect(animalInputSchema.safeParse({ ...validInput, initialWeightKg: -2 }).success).toBe(false)
    expect(animalInputSchema.safeParse({ ...validInput, initialWeightKg: 4.2 }).success).toBe(true)
    expect(animalInputSchema.safeParse({ ...validInput, initialWeightKg: null }).success).toBe(true)
  })

  it('rejette une date de naissance dans le futur ou mal formée', () => {
    expect(animalInputSchema.safeParse({ ...validInput, birthDate: '2099-01-01' }).success).toBe(
      false,
    )
    expect(animalInputSchema.safeParse({ ...validInput, birthDate: '01/02/2020' }).success).toBe(
      false,
    )
  })

  it('accepte une date de naissance passée ou aujourd’hui', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(animalInputSchema.safeParse({ ...validInput, birthDate: '2020-02-29' }).success).toBe(
      true,
    )
    expect(animalInputSchema.safeParse({ ...validInput, birthDate: today }).success).toBe(true)
  })
})
