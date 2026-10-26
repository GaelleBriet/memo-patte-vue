import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { createMemoryHistory, createRouter, createWebHistory, type Router } from 'vue-router'

import { authRepository, type AuthRepository } from '../repository/auth.repository'
import { signInWithGoogle } from '../service/google-sign-in.service'
import { writePlusAccount } from '../logic/plus-account-storage'
import { provideAuthRepository } from '../store/auth.store'
import AccountFirstView from '../views/AccountFirstView.vue'
import { memoryStorage, USER_ID } from './auth-fixture'
import { GoogleCredentialError } from '@/core/google-sign-in/google-credentials'
import i18n from '@/core/i18n'
import { getMsIconPath } from '@/core/theme/icons'
import vuetify from '@/core/theme/vuetify'
import { usePurchaseStore } from '@/features/purchase/store/purchase.store'

vi.mock('../repository/auth.repository', () => ({
  authRepository: {
    signUp: vi.fn<AuthRepository['signUp']>(),
    signIn: vi.fn<AuthRepository['signIn']>(),
    signOut: vi.fn<AuthRepository['signOut']>(async () => {}),
    restoreSession: vi.fn<AuthRepository['restoreSession']>(),
    refreshSession: vi.fn<AuthRepository['refreshSession']>(),
    onSessionChange: vi.fn<AuthRepository['onSessionChange']>(),
  },
}))

vi.mock('../service/google-sign-in.service', () => ({
  signInWithGoogle: vi.fn<typeof signInWithGoogle>(),
}))

const googleSignIn = vi.mocked(signInWithGoogle)
provideAuthRepository(() => authRepository)
const Vide = { render: () => null }

// Prix volontairement différents des tarifs français : seul Google Play les fournit.
const OFFRES = [
  { plan: 'monthly', priceString: '2,49 $' },
  { plan: 'annual', priceString: '14,99 $' },
  { plan: 'lifetime', priceString: '34,99 $' },
] as const

let routeur: Router
let back: MockInstance
let push: MockInstance
let replace: MockInstance

const ROUTES = [
  { path: '/plus', name: 'plus', component: Vide },
  { path: '/plus/account', name: 'plus-account', component: Vide },
  { path: '/sign-in', name: 'sign-in', component: Vide },
]

function routeurHistorique(): Router {
  return createRouter({ history: createWebHistory(), routes: ROUTES })
}

function routeurMemoire(): Router {
  return createRouter({ history: createMemoryHistory(), routes: ROUTES })
}

function choisir(plan: 'monthly' | 'annual' | 'lifetime' | null): void {
  const purchase = usePurchaseStore()
  purchase.offers = OFFRES.map((offer) => ({ ...offer }))
  if (plan) purchase.rememberCheckout(plan)
}

async function monter(): Promise<VueWrapper> {
  await routeur.push('/plus')
  await routeur.push('/plus/account')
  back = vi.spyOn(routeur, 'back').mockImplementation(() => {})
  push = vi.spyOn(routeur, 'push').mockResolvedValue()
  replace = vi.spyOn(routeur, 'replace').mockResolvedValue()
  const wrapper = mount(AccountFirstView, {
    attachTo: document.body,
    global: { plugins: [vuetify, i18n, routeur] },
  })
  await flushPromises()
  return wrapper
}

function traceIcone(element: ReturnType<VueWrapper['get']>) {
  return element.get('svg path').attributes('d')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', memoryStorage())
  setActivePinia(createPinia())
  routeur = routeurHistorique()
})

afterEach(() => {
  routeur.options.history.destroy()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AccountFirstView — écran « Étape 1 sur 2 » (V25 quater)', () => {
  it('annonce l’étape, le compte à créer et ce qu’il apporte', async () => {
    choisir('annual')
    const wrapper = await monter()

    expect(wrapper.get('h1').text()).toBe('Étape 1 sur 2')
    expect(traceIcone(wrapper.get('.account-first__hero-icon'))).toBe(
      getMsIconPath('account_circle')!.path,
    )
    expect(wrapper.get('.account-first__headline').text()).toBe('Crée ton compte MémoPatte')
    expect(wrapper.get('.account-first__body').text()).toBe(
      'Ton accès Plus est lié à ton compte\u00a0: tu le retrouves sur tous tes appareils, avec ton carnet.',
    )
  })

  it('rappelle l’offre choisie au prix de Google Play, et le paiement qui suit', async () => {
    choisir('annual')
    const wrapper = await monter()

    expect(traceIcone(wrapper.get('.account-first__offer'))).toBe(getMsIconPath('star')!.path)
    expect(wrapper.get('.account-first__offer-name').text()).toBe('Plus annuel · 14,99 $/an')
    expect(wrapper.get('.account-first__offer-payment').text()).toBe(
      'Paiement à l’étape suivante, dans Google Play.',
    )
  })

  it.each([
    ['monthly', 'Plus mensuel · 2,49 $/mois'],
    ['lifetime', 'Plus à vie · 34,99 $'],
  ] as const)('rappelle l’offre %s, seul texte qui change', async (plan, rappel) => {
    choisir(plan)
    const wrapper = await monter()

    expect(wrapper.get('.account-first__offer-name').text()).toBe(rappel)
    expect(wrapper.get('.account-first__body').text()).toContain('Ton accès Plus est lié')
  })

  it('propose Google, une adresse e-mail et la connexion, puis l’âge et la politique', async () => {
    choisir('annual')
    const wrapper = await monter()

    expect(wrapper.get('.google-button').text()).toBe('Continuer avec Google')
    expect(wrapper.get('.account-first__email').text()).toBe('Continuer avec une adresse e-mail')
    expect(traceIcone(wrapper.get('.account-first__email'))).toBe(getMsIconPath('mail')!.path)
    expect(wrapper.get('.account-first__sign-in').text()).toBe('J’ai déjà un compte · Se connecter')
    expect(wrapper.get('.account-legal__adults').text()).toBe(
      'MémoPatte s’adresse aux 18 ans et plus.',
    )
    const politique = wrapper.get('.account-legal__privacy')
    expect(politique.text()).toBe('Politique de confidentialité')
    expect(politique.attributes('href')).toBe('https://memopatte.app/confidentialite/')
    expect(politique.attributes('target')).toBe('_blank')
  })

  it('se lit en anglais aussi', async () => {
    i18n.global.locale.value = 'en'
    try {
      choisir('annual')
      const wrapper = await monter()

      expect(wrapper.get('h1').text()).toBe('Step 1 of 2')
      expect(wrapper.get('.account-first__headline').text()).toBe('Create your MémoPatte account')
      expect(wrapper.get('.account-first__body').text()).toBe(
        'Your Plus access is linked to your account: you get it on all your devices, with your health record.',
      )
      expect(wrapper.get('.account-first__offer-name').text()).toBe('Annual Plus · 14,99 $/year')
      expect(wrapper.get('.account-first__offer-payment').text()).toBe(
        'Payment at the next step, in Google Play.',
      )
      expect(wrapper.get('.google-button').text()).toBe('Continue with Google')
      expect(wrapper.get('.account-first__email').text()).toBe('Continue with an email address')
      expect(wrapper.get('.account-first__sign-in').text()).toBe(
        'I already have an account · Sign in',
      )
      expect(wrapper.get('.account-legal__adults').text()).toBe(
        'MémoPatte is for people aged 18 and over.',
      )
      expect(wrapper.get('.account-legal__privacy').text()).toBe('Privacy policy')
      expect(wrapper.get('.account-legal__privacy').attributes('href')).toBe(
        'https://memopatte.app/en/privacy/',
      )
    } finally {
      i18n.global.locale.value = 'fr'
    }
  })

  it('rappelle l’offre mensuelle en anglais sous le nom déjà employé par l’app', async () => {
    i18n.global.locale.value = 'en'
    try {
      choisir('monthly')
      const wrapper = await monter()

      expect(wrapper.get('.account-first__offer-name').text()).toBe('Monthly Plus · 2,49 $/month')
    } finally {
      i18n.global.locale.value = 'fr'
    }
  })
})

describe('AccountFirstView — enchaînement', () => {
  it('se ferme par une croix qui ramène à l’écran Plus', async () => {
    choisir('annual')
    const wrapper = await monter()
    const fermer = wrapper.get('.pushed-screen__back')

    expect(fermer.attributes('aria-label')).toBe('Fermer')
    expect(traceIcone(fermer)).toBe(getMsIconPath('close')!.path)

    await fermer.trigger('click')

    expect(back).toHaveBeenCalledTimes(1)
  })

  it('ouvre la création du compte par adresse e-mail, qui reviendra ici', async () => {
    choisir('annual')
    const wrapper = await monter()

    await wrapper.get('.account-first__email').trigger('click')

    expect(push).toHaveBeenCalledWith({
      name: 'sign-in',
      query: { from: 'plus-account', mode: 'sign-up' },
    })
  })

  it('ouvre la connexion pour qui a déjà un compte, qui reviendra ici', async () => {
    choisir('annual')
    const wrapper = await monter()

    await wrapper.get('.account-first__sign-in').trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'sign-in', query: { from: 'plus-account' } })
  })

  it('connecté par Google, revient à l’écran Plus où le paiement reprend', async () => {
    googleSignIn.mockResolvedValue({ kind: 'signed-in', session: { userId: USER_ID } })
    choisir('annual')
    const wrapper = await monter()

    await wrapper.get('.google-button').trigger('click')
    await flushPromises()

    expect(back).toHaveBeenCalledTimes(1)
    expect(usePurchaseStore().pendingCheckout).toBe('annual')
  })

  it('montre la connexion en cours, sans laisser relancer', async () => {
    googleSignIn.mockReturnValue(new Promise(() => {}))
    choisir('annual')
    const wrapper = await monter()

    await wrapper.get('.google-button').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="status"]').text()).toBe('Connexion en cours…')
    expect(wrapper.find('.google-button').exists()).toBe(false)
    expect(googleSignIn).toHaveBeenCalledTimes(1)
  })

  it('ne fait rien quand le sélecteur de Google est fermé sans choisir', async () => {
    googleSignIn.mockResolvedValue({ kind: 'cancelled' })
    choisir('annual')
    const wrapper = await monter()

    await wrapper.get('.google-button').trigger('click')
    await flushPromises()

    expect(back).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('.google-button').exists()).toBe(true)
  })

  it('dit pourquoi Google n’a pas abouti, et laisse l’adresse e-mail', async () => {
    googleSignIn.mockRejectedValue(new GoogleCredentialError('no-google-account'))
    choisir('annual')
    const wrapper = await monter()

    await wrapper.get('.google-button').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Aucun compte Google sur ce téléphone. Ajoute-le dans les réglages d’Android, ou continue avec une adresse e-mail.',
    )
    expect(wrapper.find('.account-first__email').exists()).toBe(true)
    expect(back).not.toHaveBeenCalled()
  })

  it('n’apparaît pas pour qui a déjà un compte : retour à l’écran Plus', async () => {
    writePlusAccount({ userId: USER_ID })
    setActivePinia(createPinia())
    choisir('annual')
    const wrapper = await monter()

    expect(back).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.account-first__content').exists()).toBe(false)
  })

  it('sans offre choisie, revient à l’écran Plus sans rien montrer', async () => {
    choisir(null)
    const wrapper = await monter()

    expect(back).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.account-first__content').exists()).toBe(false)
  })

  it('remplace l’écran par l’écran Plus quand celui-ci n’est pas derrière', async () => {
    choisir(null)
    routeur.options.history.destroy()
    routeur = routeurMemoire()
    await routeur.replace('/plus/account')
    replace = vi.spyOn(routeur, 'replace').mockResolvedValue()
    back = vi.spyOn(routeur, 'back').mockImplementation(() => {})
    mount(AccountFirstView, { global: { plugins: [vuetify, i18n, routeur] } })
    await flushPromises()

    expect(back).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith({ name: 'plus' })
  })
})
