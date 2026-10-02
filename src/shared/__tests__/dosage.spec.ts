import { afterEach, describe, expect, it } from 'vitest'

import {
  DOSE_UNITS,
  TABLET_SHORTCUTS,
  dosageText,
  doseUnitText,
  formatDoseQuantity,
} from '../domain/dosage'
import i18n, { applyLocale } from '@/core/i18n'

const t = i18n.global.t
const NBSP = '\u00a0'

afterEach(() => applyLocale('fr'))

describe('DOSE_UNITS', () => {
  it('liste les onze unités de posologie', () => {
    expect(DOSE_UNITS).toEqual([
      'tablet',
      'capsule',
      'pipette',
      'collar',
      'ml',
      'drop',
      'g',
      'sachet',
      'spray',
      'application',
      'dose',
    ])
  })
})

describe('formatDoseQuantity', () => {
  it('écrit les comprimés en fractions, l’entier séparé par une insécable', () => {
    expect(formatDoseQuantity(0.25, 'tablet')).toBe('¼')
    expect(formatDoseQuantity(0.5, 'tablet')).toBe('½')
    expect(formatDoseQuantity(0.75, 'tablet')).toBe('¾')
    expect(formatDoseQuantity(1, 'tablet')).toBe('1')
    expect(formatDoseQuantity(1.5, 'tablet')).toBe(`1${NBSP}½`)
    expect(formatDoseQuantity(2.25, 'tablet')).toBe(`2${NBSP}¼`)
  })

  it('garde les décimales d’un comprimé qui ne tombe pas sur un quart', () => {
    expect(formatDoseQuantity(0.3, 'tablet')).toBe('0,3')
  })

  it('écrit les autres unités en décimales, au séparateur de la langue', () => {
    expect(formatDoseQuantity(0.5, 'ml')).toBe('0,5')
    expect(formatDoseQuantity(1.5, 'pipette')).toBe('1,5')

    applyLocale('en')
    expect(formatDoseQuantity(0.5, 'ml')).toBe('0.5')
  })

  it('propose les raccourcis « ¼ ½ ¾ 1 1 ½ » des comprimés', () => {
    expect(TABLET_SHORTCUTS.map((quantity) => formatDoseQuantity(quantity, 'tablet'))).toEqual([
      '¼',
      '½',
      '¾',
      '1',
      `1${NBSP}½`,
    ])
  })
})

describe('doseUnitText', () => {
  it('accorde l’unité à partir de deux', () => {
    expect(doseUnitText(t, 'tablet', 0.5)).toBe('comprimé')
    expect(doseUnitText(t, 'tablet', 1)).toBe('comprimé')
    expect(doseUnitText(t, 'tablet', 1.5)).toBe('comprimé')
    expect(doseUnitText(t, 'tablet', 2)).toBe('comprimés')
    expect(doseUnitText(t, 'spray', 3)).toBe('pulvérisations')
  })

  it('laisse « ml » et « g » invariables', () => {
    expect(doseUnitText(t, 'ml', 5)).toBe('ml')
    expect(doseUnitText(t, 'g', 5)).toBe('g')
  })

  it('nomme les onze unités en français et en anglais', () => {
    const noms = () => DOSE_UNITS.map((unit) => doseUnitText(t, unit, 1))

    expect(noms()).toEqual([
      'comprimé',
      'gélule',
      'pipette',
      'collier',
      'ml',
      'goutte',
      'g',
      'sachet',
      'pulvérisation',
      'application',
      'dose',
    ])
    applyLocale('en')
    expect(noms()).toEqual([
      'tablet',
      'capsule',
      'pipette',
      'collar',
      'ml',
      'drop',
      'g',
      'sachet',
      'spray',
      'application',
      'dose',
    ])
    expect(doseUnitText(t, 'tablet', 2)).toBe('tablets')
    expect(doseUnitText(t, 'drop', 10)).toBe('drops')
  })
})

describe('dosageText', () => {
  it('écrit la quantité et l’unité, séparées par une insécable', () => {
    expect(dosageText(t, { doseQuantity: 0.5, doseUnit: 'tablet' })).toBe(`½${NBSP}comprimé`)
    expect(dosageText(t, { doseQuantity: 1.5, doseUnit: 'tablet' })).toBe(
      `1${NBSP}½${NBSP}comprimé`,
    )
    expect(dosageText(t, { doseQuantity: 2, doseUnit: 'tablet' })).toBe(`2${NBSP}comprimés`)
    expect(dosageText(t, { doseQuantity: 0.3, doseUnit: 'ml' })).toBe(`0,3${NBSP}ml`)
    expect(dosageText(t, { doseQuantity: 1, doseUnit: 'pipette' })).toBe(`1${NBSP}pipette`)
  })

  it('écrit la posologie en anglais', () => {
    applyLocale('en')

    expect(dosageText(t, { doseQuantity: 0.5, doseUnit: 'tablet' })).toBe(`½${NBSP}tablet`)
    expect(dosageText(t, { doseQuantity: 1.5, doseUnit: 'tablet' })).toBe(`1${NBSP}½${NBSP}tablet`)
    expect(dosageText(t, { doseQuantity: 0.3, doseUnit: 'ml' })).toBe(`0.3${NBSP}ml`)
    expect(dosageText(t, { doseQuantity: 10, doseUnit: 'drop' })).toBe(`10${NBSP}drops`)
  })

  it('ne rend rien sans posologie', () => {
    expect(dosageText(t, { doseQuantity: null, doseUnit: null })).toBeNull()
  })
})
