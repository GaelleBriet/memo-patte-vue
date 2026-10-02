import { describe, expect, it } from 'vitest'

import {
  treatmentPeriodSettingsSchema,
  type TreatmentPeriodSettings,
} from '../schema/treatment-period.schema'
import { MAX_TIMES_PER_DAY } from '@/shared/domain/clock-time'

const REGLAGES: TreatmentPeriodSettings = {
  startsOn: '2026-09-28',
  firstDueOn: '2026-09-29',
  endsOn: '2026-10-10',
  frequency: { value: 1, unit: 'day' },
  times: ['08:00', '20:00'],
  doseQuantity: 0.5,
  doseUnit: 'tablet',
  reminderOffsetMinutes: 30,
  reminderTime: null,
}

function accepte(changes: Partial<TreatmentPeriodSettings>): boolean {
  return treatmentPeriodSettingsSchema.safeParse({ ...REGLAGES, ...changes }).success
}

function champRefuse(changes: Partial<TreatmentPeriodSettings>): PropertyKey | undefined {
  const result = treatmentPeriodSettingsSchema.safeParse({ ...REGLAGES, ...changes })
  return result.success ? undefined : result.error.issues[0]?.path[0]
}

describe('treatmentPeriodSettingsSchema', () => {
  it('rend des réglages complets tels quels', () => {
    expect(treatmentPeriodSettingsSchema.parse(REGLAGES)).toEqual(REGLAGES)
  })

  it('accepte une période sans fin, sans heure, sans posologie ni moment du rappel', () => {
    expect(
      accepte({
        endsOn: null,
        times: [],
        doseQuantity: null,
        doseUnit: null,
        reminderOffsetMinutes: null,
      }),
    ).toBe(true)
  })

  it('exige la quantité et l’unité ensemble', () => {
    expect(champRefuse({ doseQuantity: 2, doseUnit: null })).toBe('doseUnit')
    expect(champRefuse({ doseQuantity: null, doseUnit: 'ml' })).toBe('doseUnit')
  })

  it('refuse une quantité nulle ou négative et une unité hors liste', () => {
    expect(accepte({ doseQuantity: 0 })).toBe(false)
    expect(accepte({ doseQuantity: -1 })).toBe(false)
    expect(accepte({ doseUnit: 'cuillère' as never })).toBe(false)
  })

  it('refuse une heure mal écrite, une heure en double et plus de 24 heures', () => {
    expect(champRefuse({ times: ['8:00'] })).toBe('times')
    expect(champRefuse({ times: ['08:00', '08:00'] })).toBe('times')
    const heures = Array.from(
      { length: MAX_TIMES_PER_DAY },
      (_, hour) => `${String(hour).padStart(2, '0')}:00`,
    )
    expect(accepte({ times: heures })).toBe(true)
    expect(champRefuse({ times: [...heures, '00:30'] })).toBe('times')
  })

  it('refuse une première échéance avant le début de la période', () => {
    expect(champRefuse({ firstDueOn: '2026-09-27' })).toBe('firstDueOn')
    expect(accepte({ firstDueOn: '2026-09-28' })).toBe(true)
  })

  it('refuse une date de fin avant la première échéance, égale acceptée', () => {
    expect(champRefuse({ endsOn: '2026-09-28' })).toBe('endsOn')
    expect(accepte({ endsOn: '2026-09-29' })).toBe(true)
  })

  it('borne la fréquence de 1 à 365', () => {
    expect(accepte({ frequency: { value: 0, unit: 'day' } })).toBe(false)
    expect(accepte({ frequency: { value: 365, unit: 'day' } })).toBe(true)
    expect(accepte({ frequency: { value: 366, unit: 'day' } })).toBe(false)
  })

  it('refuse une date qui n’existe pas ou hors du calendrier', () => {
    expect(accepte({ endsOn: '2026-02-30' })).toBe(false)
    expect(accepte({ endsOn: '2200-01-01' })).toBe(false)
  })

  it('refuse un moment du rappel hors liste et une heure de rappel mal écrite', () => {
    expect(accepte({ reminderOffsetMinutes: 45 as never })).toBe(false)
    expect(accepte({ reminderTime: '9h' })).toBe(false)
  })
})
