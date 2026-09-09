import { describe, expect, it } from 'vitest'
import { weightEntryInputSchema, weightEntryUpdateSchema } from '../weight.schema'

const validInput = {
  animalId: '11111111-1111-4111-8111-111111111111',
  weightKg: 24.7,
  measuredOn: '2026-03-01',
} as const

describe('weightEntryInputSchema', () => {
  it('accepte une pesée valide telle quelle', () => {
    expect(weightEntryInputSchema.parse(validInput)).toEqual(validInput)
  })

  it('rejette un poids nul ou négatif', () => {
    expect(weightEntryInputSchema.safeParse({ ...validInput, weightKg: 0 }).success).toBe(false)
    expect(weightEntryInputSchema.safeParse({ ...validInput, weightKg: -3 }).success).toBe(false)
  })

  it('rejette un poids absent ou non numérique', () => {
    expect(weightEntryInputSchema.safeParse({ ...validInput, weightKg: '24,7' }).success).toBe(
      false,
    )
    expect(weightEntryInputSchema.safeParse({ ...validInput, weightKg: null }).success).toBe(false)
  })

  it('rejette un identifiant d’animal qui n’est pas un UUID', () => {
    expect(weightEntryInputSchema.safeParse({ ...validInput, animalId: 'a1' }).success).toBe(false)
  })

  it('rejette une date de pesée future, absente ou mal formée', () => {
    expect(
      weightEntryInputSchema.safeParse({ ...validInput, measuredOn: '2099-01-01' }).success,
    ).toBe(false)
    expect(
      weightEntryInputSchema.safeParse({ ...validInput, measuredOn: '01/03/2026' }).success,
    ).toBe(false)
    expect(weightEntryInputSchema.safeParse({ ...validInput, measuredOn: null }).success).toBe(
      false,
    )
  })

  it('accepte une date de pesée passée ou aujourd’hui', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(
      weightEntryInputSchema.safeParse({ ...validInput, measuredOn: '2020-01-15' }).success,
    ).toBe(true)
    expect(weightEntryInputSchema.safeParse({ ...validInput, measuredOn: today }).success).toBe(
      true,
    )
  })
})

describe('weightEntryUpdateSchema', () => {
  it('ignore un animalId fourni : le rattachement est figé', () => {
    expect(weightEntryUpdateSchema.parse({ ...validInput, weightKg: 25 })).toEqual({
      weightKg: 25,
      measuredOn: '2026-03-01',
    })
  })
})
