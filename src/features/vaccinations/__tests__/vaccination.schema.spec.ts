import { afterEach, describe, expect, it, vi } from 'vitest'
import { vaccinationInputSchema, vaccinationUpdateSchema } from '../schema/vaccination.schema'
import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'

afterEach(() => {
  vi.useRealTimers()
})

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

  it('borne le nom à 80 caractères, en création comme en modification', () => {
    const limite = 'a'.repeat(MAX_NAME_LENGTH)

    for (const schema of [vaccinationInputSchema, vaccinationUpdateSchema]) {
      expect(schema.safeParse({ ...validInput, name: limite }).success).toBe(true)
      expect(schema.safeParse({ ...validInput, name: `${limite}a` }).success).toBe(false)
    }
  })

  it('rejette un identifiant d’animal qui n’est pas un UUID', () => {
    expect(vaccinationInputSchema.safeParse({ ...validInput, animalId: 'a1' }).success).toBe(false)
  })

  it('rejette une date de dernière injection future ou mal formée', () => {
    expect(
      vaccinationInputSchema.safeParse({ ...validInput, lastInjectionDate: '2099-01-01' }).success,
    ).toBe(false)
    expect(
      vaccinationInputSchema.safeParse({ ...validInput, lastInjectionDate: '12/06/2025' }).success,
    ).toBe(false)
  })

  it('accepte un vaccin sans injection avec son rendez-vous prévu', () => {
    const { lastInjectionDate: _injection, ...prevu } = validInput

    expect(vaccinationInputSchema.parse({ ...prevu, dueDate: '2026-10-05' })).toMatchObject({
      lastInjectionDate: null,
      dueDate: '2026-10-05',
    })
    expect(
      vaccinationInputSchema.safeParse({ ...prevu, lastInjectionDate: null, dueDate: '2026-10-05' })
        .success,
    ).toBe(true)
  })

  it('refuse un vaccin sans injection ni prochain rappel, l’erreur sur le prochain rappel', () => {
    const result = vaccinationInputSchema.safeParse({ ...validInput, lastInjectionDate: null })

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['dueDate']])
  })

  it.each([
    ['0 h 30', new Date(2026, 9, 8, 0, 30)],
    ['23 h 30', new Date(2026, 9, 8, 23, 30)],
  ])(
    'accepte une date de dernière injection passée ou aujourd’hui, refuse demain (à %s)',
    (_heure, now) => {
      vi.useFakeTimers({ toFake: ['Date'], now })
      const valid = (lastInjectionDate: string) =>
        vaccinationInputSchema.safeParse({ ...validInput, lastInjectionDate }).success
      expect(valid('2026-10-08')).toBe(true)
      expect(valid('2026-10-09')).toBe(false)
    },
  )

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
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 8, 0, 30) })
    const hier = '2026-10-07'
    expect(vaccinationInputSchema.safeParse({ ...validInput, dueDate: '2020-01-15' }).success).toBe(
      true,
    )
    expect(vaccinationInputSchema.safeParse({ ...validInput, dueDate: hier }).success).toBe(true)
    expect(vaccinationInputSchema.parse({ ...validInput, dueDate: '2020-01-15' }).dueDate).toBe(
      '2020-01-15',
    )
  })
})

describe('vaccinationUpdateSchema', () => {
  it('ne porte que le nom et le prochain rappel : la date d’injection ne se change pas ici', () => {
    expect(
      vaccinationUpdateSchema.parse({
        name: ' Rage ',
        lastInjectionDate: '2025-06-12',
        dueDate: null,
      }),
    ).toEqual({ name: 'Rage', dueDate: null })
  })
})
