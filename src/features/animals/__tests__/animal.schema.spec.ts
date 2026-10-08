import { afterEach, describe, expect, it, vi } from 'vitest'
import { animalCreationInputSchema, animalInputSchema } from '../schema/animal.schema'
import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'

afterEach(() => {
  vi.useRealTimers()
})

const validInput = { name: 'Miette', species: 'cat' } as const

describe('animalInputSchema', () => {
  it('complète les champs facultatifs à null', () => {
    expect(animalInputSchema.parse(validInput)).toEqual({
      name: 'Miette',
      species: 'cat',
      breed: null,
      birthDate: null,
      birthDateApproximate: false,
      photoPath: null,
    })
  })

  it('supprime les espaces autour du nom', () => {
    expect(animalInputSchema.parse({ ...validInput, name: '  Miette  ' }).name).toBe('Miette')
  })

  it('rejette un nom vide ou seulement composé d’espaces', () => {
    expect(animalInputSchema.safeParse({ ...validInput, name: '   ' }).success).toBe(false)
  })

  it('borne le nom et la race à 80 caractères, espaces du bord non comptés', () => {
    const limite = 'a'.repeat(MAX_NAME_LENGTH)
    const accepte = (champs: object) => animalInputSchema.safeParse({ ...validInput, ...champs })

    expect(MAX_NAME_LENGTH).toBe(80)
    expect(accepte({ name: limite }).success).toBe(true)
    expect(accepte({ name: `  ${limite}  ` }).success).toBe(true)
    expect(accepte({ name: `${limite}a` }).success).toBe(false)
    expect(accepte({ breed: limite }).success).toBe(true)
    expect(accepte({ breed: `${limite}a` }).success).toBe(false)
  })

  it('rejette une espèce hors chien/chat', () => {
    expect(animalInputSchema.safeParse({ ...validInput, species: 'rabbit' }).success).toBe(false)
  })

  it('accepte chien et chat', () => {
    expect(animalInputSchema.safeParse({ ...validInput, species: 'dog' }).success).toBe(true)
    expect(animalInputSchema.safeParse({ ...validInput, species: 'cat' }).success).toBe(true)
  })

  it('rejette une date de naissance dans le futur ou mal formée', () => {
    expect(animalInputSchema.safeParse({ ...validInput, birthDate: '2099-01-01' }).success).toBe(
      false,
    )
    expect(animalInputSchema.safeParse({ ...validInput, birthDate: '01/02/2020' }).success).toBe(
      false,
    )
  })

  it.each([
    ['0 h 30', new Date(2026, 9, 8, 0, 30)],
    ['23 h 30', new Date(2026, 9, 8, 23, 30)],
  ])('accepte une date de naissance passée ou aujourd’hui, refuse demain (à %s)', (_heure, now) => {
    vi.useFakeTimers({ toFake: ['Date'], now })
    const valid = (birthDate: string) =>
      animalInputSchema.safeParse({ ...validInput, birthDate }).success
    expect(valid('2020-02-29')).toBe(true)
    expect(valid('2026-10-08')).toBe(true)
    expect(valid('2026-10-09')).toBe(false)
  })
})

describe('animalCreationInputSchema', () => {
  const creation = (weightKg: number | null) =>
    animalCreationInputSchema.safeParse({ ...validInput, weightKg }).success

  it('ne porte pas de poids : il est réservé à la création', () => {
    expect(animalInputSchema.parse({ ...validInput, weightKg: 4.2 })).not.toHaveProperty('weightKg')
  })

  it('rejette un poids nul ou négatif mais accepte l’absence de poids', () => {
    expect(creation(0)).toBe(false)
    expect(creation(-2)).toBe(false)
    expect(creation(4.2)).toBe(true)
    expect(creation(null)).toBe(true)
    expect(animalCreationInputSchema.parse(validInput).weightKg).toBeNull()
  })

  it('rejette un poids hors de toute échelle animale', () => {
    expect(creation(1e308)).toBe(false)
    expect(creation(200.5)).toBe(false)
    expect(creation(200)).toBe(true)
  })
})
