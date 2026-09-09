import { describe, expect, it } from 'vitest'
import {
  FREQUENCY_UNITS,
  TREATMENT_TYPES,
  treatmentInputSchema,
  treatmentSchema,
  treatmentUpdateSchema,
} from '../treatment.schema'

const validInput = {
  animalId: '11111111-1111-4111-8111-111111111111',
  name: 'Bravecto',
  type: 'antiparasitic',
  frequency: { value: 3, unit: 'month' },
  lastDoseDate: '2026-03-01',
} as const

describe('listes fermées', () => {
  it('expose deux types et trois unités', () => {
    expect(TREATMENT_TYPES).toEqual(['deworming', 'antiparasitic'])
    expect(FREQUENCY_UNITS).toEqual(['day', 'week', 'month'])
  })
})

describe('treatmentInputSchema', () => {
  it('accepte un traitement valide tel quel', () => {
    expect(treatmentInputSchema.parse(validInput)).toEqual(validInput)
  })

  it('nettoie le nom et rejette un nom vide', () => {
    expect(treatmentInputSchema.parse({ ...validInput, name: '  Milbemax ' }).name).toBe('Milbemax')
    expect(treatmentInputSchema.safeParse({ ...validInput, name: '   ' }).success).toBe(false)
  })

  it('rejette un type hors liste', () => {
    expect(treatmentInputSchema.safeParse({ ...validInput, type: 'vaccine' }).success).toBe(false)
    expect(treatmentInputSchema.safeParse({ ...validInput, type: 'Antiparasitaire' }).success).toBe(
      false,
    )
  })

  it('rejette une fréquence nulle, négative ou décimale', () => {
    for (const value of [0, -1, 1.5]) {
      expect(
        treatmentInputSchema.safeParse({ ...validInput, frequency: { value, unit: 'month' } })
          .success,
      ).toBe(false)
    }
  })

  it('rejette une unité de fréquence hors liste', () => {
    expect(
      treatmentInputSchema.safeParse({ ...validInput, frequency: { value: 1, unit: 'year' } })
        .success,
    ).toBe(false)
  })

  it('accepte chaque unité de la liste', () => {
    for (const unit of FREQUENCY_UNITS) {
      expect(
        treatmentInputSchema.safeParse({ ...validInput, frequency: { value: 2, unit } }).success,
      ).toBe(true)
    }
  })

  it('rejette une date de dernière prise future, absente ou mal formée', () => {
    expect(
      treatmentInputSchema.safeParse({ ...validInput, lastDoseDate: '2099-01-01' }).success,
    ).toBe(false)
    expect(
      treatmentInputSchema.safeParse({ ...validInput, lastDoseDate: '01/03/2026' }).success,
    ).toBe(false)
    expect(treatmentInputSchema.safeParse({ ...validInput, lastDoseDate: null }).success).toBe(
      false,
    )
  })

  it('accepte une date de dernière prise passée ou aujourd’hui', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(
      treatmentInputSchema.safeParse({ ...validInput, lastDoseDate: '2020-01-15' }).success,
    ).toBe(true)
    expect(treatmentInputSchema.safeParse({ ...validInput, lastDoseDate: today }).success).toBe(
      true,
    )
  })

  it('rejette un identifiant d’animal qui n’est pas un UUID', () => {
    expect(treatmentInputSchema.safeParse({ ...validInput, animalId: 'a1' }).success).toBe(false)
  })

  it('ignore une échéance fournie : elle est calculée, jamais saisie', () => {
    expect(treatmentInputSchema.parse({ ...validInput, nextDueDate: '2030-01-01' })).toEqual(
      validInput,
    )
  })
})

describe('treatmentUpdateSchema', () => {
  it('ignore un animalId fourni : le rattachement est figé', () => {
    expect(treatmentUpdateSchema.parse({ ...validInput, name: 'Milbemax' })).toEqual({
      name: 'Milbemax',
      type: 'antiparasitic',
      frequency: { value: 3, unit: 'month' },
      lastDoseDate: '2026-03-01',
    })
  })
})

describe('treatmentSchema', () => {
  it('exige l’échéance calculée et les métadonnées', () => {
    const treatment = {
      ...validInput,
      id: '22222222-2222-4222-8222-222222222222',
      nextDueDate: '2026-06-01',
      createdAt: '2026-03-01T10:00:00.000Z',
      updatedAt: '2026-03-01T10:00:00.000Z',
      deletedAt: null,
    }
    expect(treatmentSchema.parse(treatment)).toEqual(treatment)
    expect(treatmentSchema.safeParse({ ...treatment, nextDueDate: undefined }).success).toBe(false)
  })
})
