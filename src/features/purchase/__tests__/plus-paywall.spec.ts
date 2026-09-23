// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  checkoutBar,
  orderedOffers,
  pitchBenefits,
  plusOriginOf,
  PRESELECTED_PLAN,
  selectablePlan,
} from '../logic/plus-paywall'
import type { PlusOffer } from '../service/billing.service'

const MENSUEL: PlusOffer = { plan: 'monthly', priceString: '1,49 €' }
const ANNUEL: PlusOffer = { plan: 'annual', priceString: '9,99 €' }
const A_VIE: PlusOffer = { plan: 'lifetime', priceString: '29,99 €' }

describe('plusOriginOf', () => {
  it('reconnaît une ouverture depuis l’export PDF', () => {
    expect(plusOriginOf('pdf')).toBe('pdf')
  })

  it.each([undefined, null, '', 'settings', 'PDF', ['pdf'], 42])(
    'retombe sur la version générale pour %j',
    (valeur) => {
      expect(plusOriginOf(valeur)).toBe('general')
    },
  )
})

describe('pitchBenefits', () => {
  it('met l’export PDF en tête et en avant quand on vient du PDF', () => {
    expect(pitchBenefits('pdf')).toEqual([
      { benefit: 'pdf', highlighted: true },
      { benefit: 'backup', highlighted: false },
      { benefit: 'devices', highlighted: false },
      { benefit: 'photos', highlighted: false },
    ])
  })

  it('garde l’ordre général, PDF en dernier et sans mise en avant, sinon', () => {
    expect(pitchBenefits('general')).toEqual([
      { benefit: 'backup', highlighted: false },
      { benefit: 'devices', highlighted: false },
      { benefit: 'photos', highlighted: false },
      { benefit: 'pdf', highlighted: false },
    ])
  })
})

describe('orderedOffers', () => {
  it('range l’annuel, le mensuel puis l’à vie, quel que soit l’ordre reçu', () => {
    expect(orderedOffers([A_VIE, MENSUEL, ANNUEL])).toEqual([ANNUEL, MENSUEL, A_VIE])
  })

  it('ne garde que les offres reçues', () => {
    expect(orderedOffers([A_VIE, MENSUEL])).toEqual([MENSUEL, A_VIE])
  })
})

describe('selectablePlan', () => {
  it('garde le choix courant quand l’offre existe', () => {
    expect(selectablePlan([ANNUEL, MENSUEL, A_VIE], 'lifetime')).toBe('lifetime')
  })

  it('retombe sur la première offre quand le choix courant manque', () => {
    expect(selectablePlan([MENSUEL, A_VIE], 'annual')).toBe('monthly')
  })

  it('présélectionne l’annuel', () => {
    expect(PRESELECTED_PLAN).toBe('annual')
  })

  it('garde l’offre présélectionnée tant qu’aucune offre n’est arrivée', () => {
    expect(selectablePlan([], 'lifetime')).toBe(PRESELECTED_PLAN)
  })
})

describe('checkoutBar', () => {
  const offres = [ANNUEL, MENSUEL, A_VIE]

  it('porte l’offre choisie dès que Google Play a répondu', () => {
    expect(
      checkoutBar({ offers: offres, selected: 'monthly', loading: false, answered: true }),
    ).toEqual({ kind: 'offer', offer: MENSUEL })
  })

  it('reste sur les offres pendant un nouveau chargement qui en a déjà', () => {
    expect(
      checkoutBar({ offers: offres, selected: 'annual', loading: true, answered: true }),
    ).toEqual({ kind: 'offer', offer: ANNUEL })
  })

  it('se connecte à Google Play avant la première réponse', () => {
    expect(checkoutBar({ offers: [], selected: 'annual', loading: true, answered: false })).toEqual(
      {
        kind: 'connecting',
      },
    )
  })

  it('annonce les offres indisponibles quand Google Play n’en a rendu aucune', () => {
    expect(checkoutBar({ offers: [], selected: 'annual', loading: false, answered: true })).toEqual(
      {
        kind: 'unavailable',
        retrying: false,
      },
    )
  })

  it('ne prétend pas se connecter quand aucun chargement n’est en cours', () => {
    expect(
      checkoutBar({ offers: [], selected: 'annual', loading: false, answered: false }),
    ).toEqual({ kind: 'unavailable', retrying: false })
  })

  it('garde l’état indisponible pendant le réessai', () => {
    expect(checkoutBar({ offers: [], selected: 'annual', loading: true, answered: true })).toEqual({
      kind: 'unavailable',
      retrying: true,
    })
  })

  it('se rabat sur la première offre quand le choix courant n’existe pas', () => {
    expect(
      checkoutBar({ offers: [MENSUEL, A_VIE], selected: 'annual', loading: false, answered: true }),
    ).toEqual({ kind: 'offer', offer: MENSUEL })
  })
})
