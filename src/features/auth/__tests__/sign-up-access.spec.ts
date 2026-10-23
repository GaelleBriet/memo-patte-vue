import { describe, expect, it } from 'vitest'
import type { LocationQuery } from 'vue-router'

import { ACCOUNT_FIRST_ORIGIN, initialSignInMode, offersSignUp } from '../logic/sign-up-access'

const DEJA_PLUS: { origine: string; query: LocationQuery }[] = [
  { origine: 'l’écran Plus', query: { from: 'plus', restore: '1' } },
  { origine: 'l’accueil de bienvenue', query: { from: 'home', restore: '1' } },
  { origine: 'Paramètres', query: { from: 'settings-plus', restore: '1' } },
]

const AUTRES: { origine: string; query: LocationQuery }[] = [
  { origine: 'une session refusée au paiement', query: { from: 'plus' } },
  { origine: 'la déconnexion', query: { from: 'settings' } },
  { origine: 'aucun parcours', query: {} },
  { origine: 'un parcours inconnu', query: { from: 'ailleurs' } },
  { origine: 'un parcours en double', query: { from: ['plus-account', 'plus-account'] } },
]

describe('création d’un compte depuis la connexion', () => {
  it.each(DEJA_PLUS)(
    '« J’ai déjà MémoPatte Plus » depuis $origine : connexion seule',
    ({ query }) => {
      expect(offersSignUp(query)).toBe(false)
      expect(initialSignInMode({ ...query, mode: 'sign-up' })).toBe('sign-in')
    },
  )

  it.each(AUTRES)('depuis $origine : connexion seule, même par un lien profond', ({ query }) => {
    expect(offersSignUp(query)).toBe(false)
    expect(initialSignInMode({ ...query, mode: 'sign-up' })).toBe('sign-in')
  })

  it('l’étape 1 de l’achat propose la création du compte', () => {
    expect(offersSignUp({ from: ACCOUNT_FIRST_ORIGIN })).toBe(true)
    expect(offersSignUp({ from: ACCOUNT_FIRST_ORIGIN, restore: '1' })).toBe(true)
  })

  it('l’étape 1 de l’achat s’ouvre sur la création quand elle la demande, sinon sur la connexion', () => {
    expect(initialSignInMode({ from: ACCOUNT_FIRST_ORIGIN, mode: 'sign-up' })).toBe('sign-up')
    expect(initialSignInMode({ from: ACCOUNT_FIRST_ORIGIN })).toBe('sign-in')
  })

  it('l’étape 1 de l’achat est l’écran « plus-account »', () => {
    expect(ACCOUNT_FIRST_ORIGIN).toBe('plus-account')
  })
})
