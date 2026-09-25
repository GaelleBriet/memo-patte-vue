import { afterEach, describe, expect, it } from 'vitest'

import {
  displayedWeight,
  weightLimitParams,
  weightNumber,
  weightText,
  weightUnitName,
  weightUnitText,
  withWeightUnit,
} from '../domain/weight-display'
import { toKg } from '../domain/weight-unit'
import { applyWeightUnit } from '../domain/weight-unit-preference'
import i18n, { applyLocale } from '@/core/i18n'

const t = i18n.global.t

afterEach(() => {
  applyWeightUnit('kg')
  applyLocale('fr')
})

describe('en kilos', () => {
  it('écrit le poids enregistré, l’unité collée par une insécable', () => {
    expect(displayedWeight(24.55)).toBe(24.55)
    expect(weightNumber(24.55)).toBe('24,6')
    expect(weightUnitText(t)).toBe('kg')
    expect(weightUnitName(t)).toBe('kilogrammes')
    expect(weightText(t, 24.5)).toBe('24,5 kg')
    expect(withWeightUnit(t, '+0,3')).toBe('+0,3 kg')
  })

  it('donne l’unité et la borne haute des messages d’erreur', () => {
    expect(weightLimitParams(t)).toEqual({ unit: 'kg', max: '200' })
  })
})

describe('en livres', () => {
  it('convertit chaque poids affiché', () => {
    applyWeightUnit('lb')

    expect(displayedWeight(24.5)).toBeCloseTo(54.013, 3)
    expect(weightNumber(24.5)).toBe('54,0')
    expect(weightUnitText(t)).toBe('lb')
    expect(weightUnitName(t)).toBe('livres')
    expect(weightText(t, toKg(54.2, 'lb'))).toBe('54,2 lb')
  })

  it('dit la borne haute convertie', () => {
    applyWeightUnit('lb')

    expect(weightLimitParams(t)).toEqual({ unit: 'lb', max: '440,9' })
  })

  it('suit la langue', () => {
    applyWeightUnit('lb')
    applyLocale('en')

    expect(weightText(t, 24.5)).toBe('54.0 lb')
    expect(weightLimitParams(t)).toEqual({ unit: 'lb', max: '440.9' })
  })
})
