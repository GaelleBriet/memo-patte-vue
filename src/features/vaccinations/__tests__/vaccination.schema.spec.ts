import { describe, expect, it } from 'vitest'
import { vaccinationInputSchema } from '../vaccination.schema'

const validInput = {
  animalId: '11111111-1111-4111-8111-111111111111',
  name: 'CHPPi',
  lastInjectionDate: '2025-06-12',
} as const

describe('vaccinationInputSchema', () => {
  it('complète les champs facultatifs à null', () => {
    expect(vaccinationInputSchema.parse(validInput)).toEqual({
      animalId: '11111111-1111-4111-8111-111111111111',
      name: 'CHPPi',
      lastInjectionDate: '2025-06-12',
      dueDate: null,
    })
  })

  it('supprime les espaces autour du nom du vaccin', () => {
    expect(vaccinationInputSchema.parse({ ...validInput, name: '  CHPPi  ' }).name).toBe('CHPPi')
  })

  it('rejette un nom vide ou seulement composé d’espaces', () => {
    expect(vaccinationInputSchema.safeParse({ ...validInput, name: '   ' }).success).toBe(false)
  })

  it('rejette un identifiant d’animal qui n’est pas un UUID', () => {
    expect(vaccinationInputSchema.safeParse({ ...validInput, animalId: 'a1' }).success).toBe(false)
  })

  it('rejette une date de dernière injection future, absente ou mal formée', () => {
    expect(
      vaccinationInputSchema.safeParse({ ...validInput, lastInjectionDate: '2099-01-01' }).success,
    ).toBe(false)
    expect(
      vaccinationInputSchema.safeParse({ ...validInput, lastInjectionDate: '12/06/2025' }).success,
    ).toBe(false)
    expect(
      vaccinationInputSchema.safeParse({ ...validInput, lastInjectionDate: null }).success,
    ).toBe(false)
  })

  it('accepte une date de dernière injection passée ou aujourd’hui', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(
      vaccinationInputSchema.safeParse({ ...validInput, lastInjectionDate: today }).success,
    ).toBe(true)
  })

  it('accepte une échéance future ou absente, rejette une échéance mal formée', () => {
    expect(vaccinationInputSchema.safeParse({ ...validInput, dueDate: '2099-06-12' }).success).toBe(
      true,
    )
    expect(vaccinationInputSchema.safeParse({ ...validInput, dueDate: null }).success).toBe(true)
    expect(vaccinationInputSchema.safeParse({ ...validInput, dueDate: '06/2026' }).success).toBe(
      false,
    )
  })

  // Un vaccin en retard est le cas central du produit : contrairement à la date
  // d'injection, l'échéance ne doit jamais être contrainte au futur.
  it('accepte une échéance passée, y compris hier', () => {
    const hier = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    expect(vaccinationInputSchema.safeParse({ ...validInput, dueDate: '2020-01-15' }).success).toBe(
      true,
    )
    expect(vaccinationInputSchema.safeParse({ ...validInput, dueDate: hier }).success).toBe(true)
    expect(vaccinationInputSchema.parse({ ...validInput, dueDate: '2020-01-15' }).dueDate).toBe(
      '2020-01-15',
    )
  })
})
