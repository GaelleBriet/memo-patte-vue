import { describe, expect, it } from 'vitest'

import { isSameVaccineName } from '../logic/vaccination-name'

describe('isSameVaccineName', () => {
  it('reconnaît le même vaccin sans tenir compte des espaces en bord, de la casse ni des accents', () => {
    expect(isSameVaccineName('Carré', 'Carré')).toBe(true)
    expect(isSameVaccineName('Carré', '  carre ')).toBe(true)
    expect(isSameVaccineName('CHPPiL', 'chppil')).toBe(true)
    expect(isSameVaccineName('Leishmaniose', 'LEÏSHMANIOSE')).toBe(true)
  })

  it('distingue deux noms différents, même proches', () => {
    expect(isSameVaccineName('Carré', 'Carré parvo')).toBe(false)
    expect(isSameVaccineName('Rage', 'Rages')).toBe(false)
    expect(isSameVaccineName('Typhus coryza', 'Typhus  coryza')).toBe(false)
  })
})
