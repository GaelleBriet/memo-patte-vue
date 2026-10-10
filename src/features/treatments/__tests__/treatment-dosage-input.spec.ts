import { describe, expect, it } from 'vitest'

import {
  doseQuantityTextFor,
  parseDoseQuantity,
  tabletShortcuts,
} from '../logic/treatment-dosage-input'

describe('quantité de la posologie (TR-4)', () => {
  it.each([
    ['', null],
    ['  ', null],
    ['2', 2],
    ['0,5', 0.5],
    ['0.3', 0.3],
    ['½', 0.5],
    ['¼', 0.25],
    ['1 ½', 1.5],
    ['1\u00a0¾', 1.75],
  ])('lit « %s »', (text, quantity) => {
    expect(parseDoseQuantity(text)).toBe(quantity)
  })

  it.each(['un', '1/2', '-1', '1,', '½ 1'])('ne lit pas « %s »', (text) => {
    expect(parseDoseQuantity(text)).toBeNaN()
  })

  it('récrit la quantité pour l’unité choisie : fraction pour un comprimé, décimale sinon', () => {
    expect(doseQuantityTextFor('0,5', 'tablet')).toBe('½')
    expect(doseQuantityTextFor('½', 'ml')).toBe('0,5')
    expect(doseQuantityTextFor('1.5', 'tablet')).toBe('1\u00a0½')
    expect(doseQuantityTextFor('0,3', 'tablet')).toBe('0,3')
  })

  it('garde une saisie illisible, vide ou sans unité telle quelle', () => {
    expect(doseQuantityTextFor('un', 'tablet')).toBe('un')
    expect(doseQuantityTextFor('', 'tablet')).toBe('')
    expect(doseQuantityTextFor('0,5', null)).toBe('0,5')
  })

  it('propose les raccourcis « ¼ ½ ¾ 1 1 ½ » des comprimés', () => {
    expect(tabletShortcuts()).toEqual([
      { value: 0.25, label: '¼' },
      { value: 0.5, label: '½' },
      { value: 0.75, label: '¾' },
      { value: 1, label: '1' },
      { value: 1.5, label: '1\u00a0½' },
    ])
  })
})
