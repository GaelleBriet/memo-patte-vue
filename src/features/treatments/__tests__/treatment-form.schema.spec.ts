import { describe, expect, it } from 'vitest'

import {
  treatmentCreationSchema,
  treatmentEditionSchema,
  treatmentResumptionSchema,
  treatmentRhythmSchema,
} from '../schema/treatment-form.schema'
import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'

const REGLAGES = {
  frequency: { value: 1, unit: 'day' },
  times: ['08:00', '20:00'],
  doseQuantity: 0.5,
  doseUnit: 'ml',
  endsOn: '2026-10-10',
} as const

const CREATION = {
  animalId: '11111111-1111-4111-8111-111111111111',
  name: 'Métacam',
  type: 'medication',
  firstDoseOn: '2026-09-28',
  ...REGLAGES,
} as const

const EDITION = {
  name: 'Métacam',
  type: 'medication',
  ...REGLAGES,
  nextDoseOn: '2026-09-29',
} as const

const REPRISE = { firstDoseOn: '2026-11-03', ...REGLAGES, endsOn: '2026-11-07' } as const

function refus(
  schema: {
    safeParse(input: unknown): {
      success: boolean
      error?: { issues: { path: PropertyKey[]; message: string }[] }
    }
  },
  input: unknown,
): string[] {
  const result = schema.safeParse(input)
  return (result.error?.issues ?? []).map((issue) => `${String(issue.path[0])}:${issue.message}`)
}

describe('treatmentRhythmSchema', () => {
  it('rend les réglages tels quels, heures, posologie et date de fin facultatives', () => {
    expect(treatmentRhythmSchema.parse(REGLAGES)).toEqual(REGLAGES)
    const sans = { ...REGLAGES, times: [], doseQuantity: null, doseUnit: null, endsOn: null }
    expect(treatmentRhythmSchema.parse(sans)).toEqual(sans)
  })

  it('exige la quantité et l’unité ensemble', () => {
    expect(refus(treatmentRhythmSchema, { ...REGLAGES, doseUnit: null })).toEqual([
      'doseUnit:incomplete',
    ])
    expect(refus(treatmentRhythmSchema, { ...REGLAGES, doseQuantity: null })).toEqual([
      'doseUnit:incomplete',
    ])
  })

  it('refuse une quantité nulle, une unité hors des onze, une heure en double et une fréquence hors bornes', () => {
    const accepte = (changes: object) =>
      treatmentRhythmSchema.safeParse({ ...REGLAGES, ...changes }).success

    expect(accepte({ doseQuantity: 0 })).toBe(false)
    expect(accepte({ doseQuantity: Number.NaN })).toBe(false)
    expect(accepte({ doseUnit: 'cuillère' })).toBe(false)
    expect(accepte({ times: ['08:00', '08:00'] })).toBe(false)
    expect(accepte({ times: ['8 h'] })).toBe(false)
    expect(accepte({ frequency: { value: 366, unit: 'day' } })).toBe(false)
    expect(accepte({ frequency: { value: 1.5, unit: 'day' } })).toBe(false)
    expect(accepte({ endsOn: '2026-02-30' })).toBe(false)
  })

  it('garde le rappel choisi : un des quatre moments, ou une heure, ou rien (RA-7, RA-8)', () => {
    const accepte = (changes: object) =>
      treatmentRhythmSchema.safeParse({ ...REGLAGES, ...changes }).success

    for (const reminderOffsetMinutes of [0, 15, 30, 60, null]) {
      expect(accepte({ reminderOffsetMinutes })).toBe(true)
    }
    expect(accepte({ reminderOffsetMinutes: 45 })).toBe(false)
    expect(accepte({ reminderTime: '07:30' })).toBe(true)
    expect(accepte({ reminderTime: null })).toBe(true)
    expect(accepte({ reminderTime: '7 h 30' })).toBe(false)
    expect(
      treatmentRhythmSchema.parse({ ...REGLAGES, reminderOffsetMinutes: 30, reminderTime: null }),
    ).toEqual({ ...REGLAGES, reminderOffsetMinutes: 30, reminderTime: null })
  })

  it('laisse le rappel absent : la période garde alors le sien', () => {
    expect(treatmentRhythmSchema.parse(REGLAGES)).not.toHaveProperty('reminderOffsetMinutes')
    expect(treatmentRhythmSchema.parse(REGLAGES)).not.toHaveProperty('reminderTime')
  })
})

describe('treatmentCreationSchema', () => {
  it('accepte une création complète et nettoie le nom', () => {
    expect(treatmentCreationSchema.parse({ ...CREATION, name: ' Métacam ' })).toEqual(CREATION)
  })

  it.each(['2026-09-03', '2026-09-28', '2027-01-15'])(
    'accepte une première prise passée, du jour ou future (%s)',
    (firstDoseOn) => {
      expect(
        treatmentCreationSchema.safeParse({ ...CREATION, firstDoseOn, endsOn: null }).success,
      ).toBe(true)
    },
  )

  it('accepte les trois types et refuse les autres', () => {
    for (const type of ['deworming', 'antiparasitic', 'medication']) {
      expect(treatmentCreationSchema.safeParse({ ...CREATION, type }).success).toBe(true)
    }
    expect(treatmentCreationSchema.safeParse({ ...CREATION, type: 'vaccine' }).success).toBe(false)
  })

  it('borne le nom de 1 à 80 caractères', () => {
    const limite = 'a'.repeat(MAX_NAME_LENGTH)

    expect(treatmentCreationSchema.safeParse({ ...CREATION, name: limite }).success).toBe(true)
    expect(treatmentCreationSchema.safeParse({ ...CREATION, name: `${limite}a` }).success).toBe(
      false,
    )
    expect(treatmentCreationSchema.safeParse({ ...CREATION, name: '   ' }).success).toBe(false)
  })

  it('refuse une date de fin avant la première prise, égale acceptée', () => {
    expect(refus(treatmentCreationSchema, { ...CREATION, endsOn: '2026-09-27' })).toEqual([
      'endsOn:beforeFirstDose',
    ])
    expect(treatmentCreationSchema.safeParse({ ...CREATION, endsOn: '2026-09-28' }).success).toBe(
      true,
    )
  })

  it('exige un animal et une première prise', () => {
    expect(treatmentCreationSchema.safeParse({ ...CREATION, animalId: 'milo' }).success).toBe(false)
    expect(treatmentCreationSchema.safeParse({ ...CREATION, firstDoseOn: '' }).success).toBe(false)
  })
})

describe('treatmentEditionSchema', () => {
  it('modifie le nom, le type, les réglages et la prochaine dose, jamais l’animal', () => {
    expect(treatmentEditionSchema.parse({ ...EDITION, animalId: CREATION.animalId })).toEqual(
      EDITION,
    )
  })

  it('accepte une prochaine dose absente et refuse une date illisible', () => {
    expect(treatmentEditionSchema.safeParse({ ...EDITION, nextDoseOn: null }).success).toBe(true)
    expect(treatmentEditionSchema.safeParse({ ...EDITION, nextDoseOn: '' }).success).toBe(false)
  })
})

describe('treatmentResumptionSchema', () => {
  it('reprend avec une première prise et des réglages, sans nom ni type', () => {
    expect(
      treatmentResumptionSchema.parse({ ...REPRISE, name: 'Autre', type: 'deworming' }),
    ).toEqual(REPRISE)
  })

  it('reprend avec le rappel saisi', () => {
    const avecRappel = { ...REPRISE, reminderOffsetMinutes: 60, reminderTime: '08:00' }
    expect(treatmentResumptionSchema.parse(avecRappel)).toEqual(avecRappel)
  })

  it('exige la première prise et refuse une date de fin qui la précède', () => {
    expect(treatmentResumptionSchema.safeParse({ ...REPRISE, firstDoseOn: '' }).success).toBe(false)
    expect(refus(treatmentResumptionSchema, { ...REPRISE, endsOn: '2026-11-02' })).toEqual([
      'endsOn:beforeFirstDose',
    ])
  })
})
