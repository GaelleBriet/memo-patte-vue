import { afterEach, describe, expect, it } from 'vitest'

import { periodRhythmText, periodSettingsText } from '../logic/treatment-rhythm'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import i18n, { applyLocale } from '@/core/i18n'
import { plain } from '@/shared/__tests__/plain'

const t = i18n.global.t
const NBSP = '\u00a0'
const TODAY = '2026-09-28'
const QUOTIDIEN: Pick<
  TreatmentPeriodRecord,
  'frequency' | 'times' | 'endsOn' | 'doseQuantity' | 'doseUnit'
> = {
  frequency: { value: 1, unit: 'day' },
  times: [],
  endsOn: null,
  doseQuantity: null,
  doseUnit: null,
}

afterEach(() => applyLocale('fr'))

describe('periodRhythmText', () => {
  it('donne la fréquence seule sans heure ni date de fin', () => {
    expect(plain(periodRhythmText(t, QUOTIDIEN, TODAY))).toBe('Tous les jours')
    expect(
      periodRhythmText(t, { ...QUOTIDIEN, frequency: { value: 3, unit: 'month' } }, TODAY),
    ).toBe('Tous les 3 mois')
  })

  it('ajoute la date de fin', () => {
    expect(plain(periodRhythmText(t, { ...QUOTIDIEN, endsOn: '2026-10-05' }, TODAY))).toBe(
      'Tous les jours · jusqu’au 5 oct.',
    )
  })

  it('ajoute les heures, puis la date de fin', () => {
    const period = { ...QUOTIDIEN, times: ['20:00'], endsOn: '2026-10-10' }

    expect(plain(periodRhythmText(t, period, TODAY))).toBe(
      'Tous les jours · 20 h · jusqu’au 10 oct.',
    )
    expect(plain(periodRhythmText(t, { ...QUOTIDIEN, times: ['08:00', '20:00'] }, TODAY))).toBe(
      'Tous les jours · 8 h et 20 h',
    )
  })

  it('précise l’année d’une date de fin d’une autre année', () => {
    expect(plain(periodRhythmText(t, { ...QUOTIDIEN, endsOn: '2027-01-05' }, TODAY))).toBe(
      'Tous les jours · jusqu’au 5 janv. 2027',
    )
  })

  it('s’écrit en anglais', () => {
    applyLocale('en')
    const period = { ...QUOTIDIEN, times: ['08:00', '20:00'], endsOn: '2026-10-10' }

    expect(plain(periodRhythmText(t, period, TODAY))).toBe(
      'Every day · 8 am and 8 pm · until Oct 10',
    )
  })
})

describe('periodSettingsText', () => {
  it('donne la fréquence, les heures et la posologie d’une période de l’historique', () => {
    const period = {
      ...QUOTIDIEN,
      times: ['08:00', '20:00'],
      doseQuantity: 0.3,
      doseUnit: 'ml' as const,
    }

    expect(periodSettingsText(t, period)).toBe(
      `Tous les jours · 8${NBSP}h et 20${NBSP}h · 0,3${NBSP}ml`,
    )
  })

  it('se passe des heures et de la posologie absentes', () => {
    expect(periodSettingsText(t, { ...QUOTIDIEN, frequency: { value: 15, unit: 'day' } })).toBe(
      'Tous les 15 jours',
    )
    expect(
      periodSettingsText(t, {
        ...QUOTIDIEN,
        frequency: { value: 1, unit: 'week' },
        doseQuantity: 1,
        doseUnit: 'pipette',
      }),
    ).toBe(`Toutes les semaines · 1${NBSP}pipette`)
  })

  it('s’écrit en anglais', () => {
    applyLocale('en')
    const period = { ...QUOTIDIEN, times: ['08:00'], doseQuantity: 0.5, doseUnit: 'ml' as const }

    expect(periodSettingsText(t, period)).toBe(`Every day · 8${NBSP}am · 0.5${NBSP}ml`)
  })
})
