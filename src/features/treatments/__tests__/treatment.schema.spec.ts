import { describe, expect, it } from 'vitest'
import {
  FREQUENCY_UNITS,
  TREATMENT_TYPES,
  treatmentInputSchema,
  treatmentSchema,
} from '../schema/treatment.schema'
import { DOSE_STATUSES, treatmentDoseSchema } from '../schema/treatment-dose.schema'
import { treatmentPeriodSchema } from '../schema/treatment-period.schema'
import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'

const validInput = {
  animalId: '11111111-1111-4111-8111-111111111111',
  name: 'Bravecto',
  type: 'antiparasitic',
  frequency: { value: 3, unit: 'month' },
} as const

describe('listes fermées', () => {
  it('expose trois types et trois unités', () => {
    expect(TREATMENT_TYPES).toEqual(['deworming', 'antiparasitic', 'medication'])
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

  it('borne le nom à 80 caractères', () => {
    const limite = 'a'.repeat(MAX_NAME_LENGTH)

    expect(treatmentInputSchema.safeParse({ ...validInput, name: limite }).success).toBe(true)
    expect(treatmentInputSchema.safeParse({ ...validInput, name: `${limite}a` }).success).toBe(
      false,
    )
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

  it('rejette une fréquence démesurée, qui ferait échouer le calcul des échéances', () => {
    for (const value of [366, 10_000_000]) {
      expect(
        treatmentInputSchema.safeParse({ ...validInput, frequency: { value, unit: 'month' } })
          .success,
      ).toBe(false)
    }
    expect(
      treatmentInputSchema.safeParse({ ...validInput, frequency: { value: 365, unit: 'day' } })
        .success,
    ).toBe(true)
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

  it('rejette un identifiant d’animal qui n’est pas un UUID', () => {
    expect(treatmentInputSchema.safeParse({ ...validInput, animalId: 'a1' }).success).toBe(false)
  })

  it('ignore une échéance ou une dernière prise fournie : elles se lisent par le moteur', () => {
    expect(
      treatmentInputSchema.parse({
        ...validInput,
        lastDoseDate: '2026-03-01',
        nextDueDate: '2030-01-01',
      }),
    ).toEqual(validInput)
  })
})

describe('treatmentSchema', () => {
  it('exige sa période en cours et les métadonnées, sans échéance', () => {
    const treatment = {
      ...validInput,
      id: '22222222-2222-4222-8222-222222222222',
      periodId: '22222222-2222-4222-8222-222222222222',
      stoppedOn: null,
      createdAt: '2026-03-01T10:00:00.000Z',
      updatedAt: '2026-03-01T10:00:00.000Z',
      deletedAt: null,
    }
    expect(treatmentSchema.parse(treatment)).toEqual(treatment)
    expect(
      treatmentSchema.parse({
        ...treatment,
        lastDoseDate: '2026-03-01',
        nextDueDate: '2026-06-01',
      }),
    ).toEqual(treatment)
    expect(treatmentSchema.safeParse({ ...treatment, periodId: undefined }).success).toBe(false)
  })
})

describe('treatmentDoseSchema', () => {
  const dose = {
    id: '33333333-3333-4333-8333-333333333333',
    periodId: '22222222-2222-4222-8222-222222222222',
    treatmentId: '22222222-2222-4222-8222-222222222222',
    animalId: validInput.animalId,
    dueOn: '2026-06-01',
    dueTime: null,
    givenOn: '2026-06-02',
    status: 'given',
    nextDueDate: '2026-09-02',
    createdAt: '2026-06-02T10:00:00.000Z',
    updatedAt: '2026-06-02T10:00:00.000Z',
    deletedAt: null,
  } as const

  it('vise une échéance, jour et heure, sans fréquence recopiée', () => {
    expect(treatmentDoseSchema.parse({ ...dose, dueTime: '08:00' })).toEqual({
      ...dose,
      dueTime: '08:00',
    })
    expect(treatmentDoseSchema.parse({ ...dose, frequency: { value: 3, unit: 'month' } })).toEqual(
      dose,
    )
  })

  it('accepte les cinq états, et une prise sans date réelle', () => {
    expect(DOSE_STATUSES).toEqual(['given', 'missed', 'postponed', 'extra', 'shift'])
    expect(
      treatmentDoseSchema.safeParse({ ...dose, status: 'missed', givenOn: null }).success,
    ).toBe(true)
    expect(treatmentDoseSchema.safeParse({ ...dose, status: 'skipped' }).success).toBe(false)
  })
})

describe('treatmentPeriodSchema', () => {
  it('porte les réglages de la période : début, première échéance, fréquence, arrêt', () => {
    const period = {
      id: '22222222-2222-4222-8222-222222222222',
      treatmentId: '22222222-2222-4222-8222-222222222222',
      animalId: validInput.animalId,
      startsOn: '2026-03-01',
      firstDueOn: '2026-03-01',
      frequency: { value: 3, unit: 'month' },
      stoppedOn: null,
      createdAt: '2026-03-01T10:00:00.000Z',
      updatedAt: '2026-03-01T10:00:00.000Z',
      deletedAt: null,
    } as const

    expect(treatmentPeriodSchema.parse(period)).toEqual(period)
    expect(
      treatmentPeriodSchema.safeParse({ ...period, frequency: { value: 0, unit: 'month' } })
        .success,
    ).toBe(false)
  })
})
