import { describe, expect, it } from 'vitest'

import { numberOrNull } from '../form/number-input'

describe('numberOrNull', () => {
  it('donne null pour un champ vide ou fait d’espaces', () => {
    expect(numberOrNull('')).toBeNull()
    expect(numberOrNull('   ')).toBeNull()
  })

  it('lit un nombre à virgule comme à point, espaces autour retirés', () => {
    expect(numberOrNull(' 4,2 ')).toBe(4.2)
    expect(numberOrNull('4.2')).toBe(4.2)
    expect(numberOrNull('12')).toBe(12)
  })

  it('ne remplace que la première virgule', () => {
    expect(numberOrNull('1,2,3')).toBeNaN()
  })

  it('donne NaN pour une saisie illisible', () => {
    expect(numberOrNull('abc')).toBeNaN()
  })
})
