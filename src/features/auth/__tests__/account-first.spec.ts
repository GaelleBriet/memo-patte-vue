import { describe, expect, it } from 'vitest'

import { accountFirstOffer, leavesAccountFirst } from '../logic/account-first'

const OFFRES = [
  { plan: 'monthly', priceString: '1,49 €' },
  { plan: 'annual', priceString: '9,99 €' },
] as const

describe('accountFirstOffer', () => {
  it('retrouve l’offre choisie parmi celles de Google Play', () => {
    expect(accountFirstOffer('annual', OFFRES)).toEqual({ plan: 'annual', priceString: '9,99 €' })
  })

  it('ne rend rien sans offre choisie, ou quand Google Play ne la propose plus', () => {
    expect(accountFirstOffer(null, OFFRES)).toBeNull()
    expect(accountFirstOffer('lifetime', OFFRES)).toBeNull()
  })
})

describe('leavesAccountFirst', () => {
  it('ne montre l’écran qu’à qui n’a pas de compte et a choisi une offre', () => {
    const offre = OFFRES[1]

    expect(leavesAccountFirst(false, offre)).toBe(false)
    expect(leavesAccountFirst(true, offre)).toBe(true)
    expect(leavesAccountFirst(false, null)).toBe(true)
  })
})
