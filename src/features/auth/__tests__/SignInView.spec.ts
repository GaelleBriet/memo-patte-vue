import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import { AccountError } from '../account-error'
import { authRepository, type AuthRepository } from '../auth.repository'
import SignInView from '../SignInView.vue'
import { memoryStorage, USER_ID, type MemoryStorage } from './auth-fixture'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

vi.mock('../auth.repository', () => ({
  authRepository: {
    signUp: vi.fn<AuthRepository['signUp']>(),
    signIn: vi.fn<AuthRepository['signIn']>(),
    signOut: vi.fn<AuthRepository['signOut']>(async () => {}),
    restoreSession: vi.fn<AuthRepository['restoreSession']>(),
    refreshSession: vi.fn<AuthRepository['refreshSession']>(),
    onSessionChange: vi.fn<AuthRepository['onSessionChange']>(),
  },
}))

const repository = vi.mocked(authRepository)
const Vide = { render: () => null }

let routeur: Router
let replace: MockInstance
let stockage: MemoryStorage

function routeurMemoire(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/plus', name: 'plus', component: Vide },
      { path: '/settings', name: 'settings', component: Vide },
      { path: '/sign-in', name: 'sign-in', component: Vide },
    ],
  })
}

async function monter(adresse = '/sign-in'): Promise<VueWrapper> {
  await routeur.replace(adresse)
  replace = vi.spyOn(routeur, 'replace').mockResolvedValue()
  const wrapper = mount(SignInView, {
    attachTo: document.body,
    global: { plugins: [vuetify, i18n, routeur] },
  })
  await flushPromises()
  return wrapper
}

async function saisir(wrapper: VueWrapper, email: string, password: string): Promise<void> {
  await wrapper.get('#sign-in-email').setValue(email)
  await wrapper.get('#sign-in-password').setValue(password)
}

async function envoyer(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('.sign-in__form').trigger('submit')
  await flushPromises()
}

async function basculer(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('.sign-in__toggle-action').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  stockage = memoryStorage()
  vi.stubGlobal('localStorage', stockage)
  setActivePinia(createPinia())
  routeur = routeurMemoire()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('SignInView', () => {
  it('explique à quoi sert un compte et propose la connexion', async () => {
    const wrapper = await monter()

    expect(wrapper.get('h1').text()).toBe('Connexion')
    expect(wrapper.get('.sign-in__intro').text()).toBe(
      'Un compte MémoPatte sert à garder tes carnets en sécurité dans le cloud et à les retrouver sur tous tes appareils.',
    )
    expect(wrapper.get('.sign-in__submit').text()).toBe('Se connecter')
    expect(wrapper.get('.sign-in__toggle').text()).toBe('Pas encore de compte ? Créer un compte')
  })

  it('étiquette les champs et adapte le clavier', async () => {
    const wrapper = await monter()
    const email = wrapper.get('#sign-in-email')
    const password = wrapper.get('#sign-in-password')

    expect(wrapper.get('label[for="sign-in-email"]').text()).toContain('Adresse e-mail')
    expect(wrapper.get('label[for="sign-in-password"]').text()).toContain('Mot de passe')
    expect(email.attributes('type')).toBe('email')
    expect(email.attributes('autocomplete')).toBe('email')
    expect(password.attributes('type')).toBe('password')
    expect(password.attributes('autocomplete')).toBe('current-password')
  })

  it('bascule vers l’inscription puis revient à la connexion', async () => {
    const wrapper = await monter()

    await basculer(wrapper)

    expect(wrapper.get('h1').text()).toBe('Inscription')
    expect(wrapper.get('.sign-in__submit').text()).toBe('Créer mon compte')
    expect(wrapper.get('.sign-in__toggle').text()).toBe('Déjà un compte ? Se connecter')
    expect(wrapper.get('#sign-in-password').attributes('autocomplete')).toBe('new-password')

    await basculer(wrapper)

    expect(wrapper.get('h1').text()).toBe('Connexion')
  })

  it('ne contacte pas Supabase tant que les champs ne sont pas valides et focalise le premier fautif', async () => {
    const wrapper = await monter()

    await saisir(wrapper, 'sophie.martin', 'motdepasse')
    await envoyer(wrapper)

    expect(repository.signIn).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Cette adresse e-mail n’est pas valide.')
    expect(document.activeElement?.id).toBe('sign-in-email')
  })

  it('exige un mot de passe d’au moins huit caractères à l’inscription', async () => {
    const wrapper = await monter()

    await basculer(wrapper)
    await saisir(wrapper, 'sophie.martin@example.com', 'court')
    await envoyer(wrapper)

    expect(repository.signUp).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Choisis un mot de passe d’au moins 8 caractères.')
    expect(document.activeElement?.id).toBe('sign-in-password')
  })

  it('connecte puis ramène au parcours d’origine', async () => {
    repository.signIn.mockResolvedValue({ userId: USER_ID })
    const wrapper = await monter('/sign-in?from=settings')

    await saisir(wrapper, ' sophie.martin@example.com ', 'motdepasse')
    await envoyer(wrapper)

    expect(repository.signIn).toHaveBeenCalledWith('sophie.martin@example.com', 'motdepasse')
    expect(replace).toHaveBeenCalledWith({ name: 'settings' })
  })

  it('ramène à l’écran Plus quand aucun parcours d’origine n’est donné', async () => {
    repository.signIn.mockResolvedValue({ userId: USER_ID })
    const wrapper = await monter()

    await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse')
    await envoyer(wrapper)

    expect(replace).toHaveBeenCalledWith({ name: 'plus' })
  })

  it('annonce la connexion en cours et n’envoie qu’une fois', async () => {
    let terminer = (): void => {}
    repository.signIn.mockReturnValue(
      new Promise((resolve) => {
        terminer = () => resolve({ userId: USER_ID })
      }),
    )
    const wrapper = await monter()

    await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse')
    await wrapper.get('.sign-in__form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('.sign-in__loading').text()).toContain('Connexion en cours…')
    expect(wrapper.find('#sign-in-email').exists()).toBe(false)

    terminer()
    await flushPromises()

    expect(repository.signIn).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['invalid-credentials', 'E-mail ou mot de passe incorrect. Réessaie.'],
    ['offline', 'Pas de connexion internet. Vérifie ton réseau et réessaie.'],
    [
      'email-not-confirmed',
      'Ton adresse e-mail n’est pas encore confirmée. Ouvre le lien reçu par e-mail, puis réessaie.',
    ],
    ['unknown', 'Quelque chose s’est mal passé. Réessaie dans un instant.'],
  ] as const)('affiche un message clair pour la raison %s', async (raison, message) => {
    repository.signIn.mockRejectedValue(new AccountError(raison))
    const wrapper = await monter()

    await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse')
    await envoyer(wrapper)

    const erreur = wrapper.get('.sign-in__error')
    expect(erreur.text()).toBe(message)
    expect(erreur.attributes('role')).toBe('alert')
    expect(replace).not.toHaveBeenCalled()
    expect(wrapper.find('#sign-in-email').exists()).toBe(true)
  })

  it('dit pourquoi quand Supabase refuse un mot de passe que la validation locale a laissé passer', async () => {
    repository.signUp.mockRejectedValue(new AccountError('weak-password'))
    const wrapper = await monter()

    await basculer(wrapper)
    await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse')
    await envoyer(wrapper)

    expect(repository.signUp).toHaveBeenCalledOnce()
    expect(wrapper.get('.sign-in__error').text()).toBe(
      'Ce mot de passe est trop faible. Choisis-en un plus long ou moins courant.',
    )
  })

  it('signale une adresse déjà utilisée à l’inscription', async () => {
    repository.signUp.mockRejectedValue(new AccountError('email-taken'))
    const wrapper = await monter()

    await basculer(wrapper)
    await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse')
    await envoyer(wrapper)

    expect(wrapper.get('.sign-in__error').text()).toBe(
      'Un compte existe déjà avec cette adresse e-mail.',
    )
  })

  it('renvoie vers la boîte mail tant que l’inscription n’est pas confirmée', async () => {
    repository.signUp.mockResolvedValue({ kind: 'confirmation-pending' })
    const wrapper = await monter()

    await basculer(wrapper)
    await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse')
    await envoyer(wrapper)

    const confirmation = wrapper.get('.sign-in__confirmation')
    expect(confirmation.text()).toContain('Vérifie ta boîte mail')
    expect(confirmation.text()).toContain('sophie.martin@example.com')
    expect(replace).not.toHaveBeenCalled()

    await wrapper.get('.sign-in__confirmation-back').trigger('click')

    expect(wrapper.get('h1').text()).toBe('Connexion')
    expect(wrapper.find('#sign-in-email').exists()).toBe(true)
  })

  it('ramène au parcours d’origine quand l’inscription ouvre déjà une session', async () => {
    repository.signUp.mockResolvedValue({ kind: 'signed-in', session: { userId: USER_ID } })
    const wrapper = await monter('/sign-in?from=plus')

    await basculer(wrapper)
    await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse')
    await envoyer(wrapper)

    expect(replace).toHaveBeenCalledWith({ name: 'plus' })
  })

  it('ne laisse ni adresse ni mot de passe dans les traces', async () => {
    const traces = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
    ]
    repository.signIn.mockRejectedValue(new AccountError('unknown'))
    const wrapper = await monter()

    await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse')
    await envoyer(wrapper)

    const ecrit = traces.flatMap((trace) => trace.mock.calls.flat()).join(' ')
    expect(ecrit).not.toContain('sophie.martin@example.com')
    expect(ecrit).not.toContain('motdepasse')
    expect(stockage.keys()).toEqual([])
  })

  it('ne porte que ses deux boutons : ni Google ni « Oublié ? » avant la configuration native', async () => {
    const wrapper = await monter()

    expect(wrapper.findAll('.sign-in__panel .v-btn').map((bouton) => bouton.text())).toEqual([
      'Se connecter',
      'Créer un compte',
    ])
    expect(wrapper.findAll('.sign-in__panel a')).toEqual([])
  })

  it('oublie l’erreur du serveur en basculant de formulaire', async () => {
    repository.signIn.mockRejectedValue(new AccountError('invalid-credentials'))
    const wrapper = await monter()

    await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse')
    await envoyer(wrapper)
    expect(wrapper.find('.sign-in__error').exists()).toBe(true)

    await basculer(wrapper)

    expect(wrapper.find('.sign-in__error').exists()).toBe(false)
  })

  it('pose le focus sur le bandeau d’erreur du serveur', async () => {
    repository.signIn.mockRejectedValue(new AccountError('offline'))
    const wrapper = await monter()

    await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse')
    await envoyer(wrapper)

    expect(document.activeElement).toBe(wrapper.get('.sign-in__error').element)
  })

  it('garde l’adresse et efface le mot de passe au retour depuis la boîte mail', async () => {
    repository.signUp.mockResolvedValue({ kind: 'confirmation-pending' })
    const wrapper = await monter()

    await basculer(wrapper)
    await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse')
    await envoyer(wrapper)
    await wrapper.get('.sign-in__confirmation-back').trigger('click')

    expect((wrapper.get('#sign-in-email').element as HTMLInputElement).value).toBe(
      'sophie.martin@example.com',
    )
    expect((wrapper.get('#sign-in-password').element as HTMLInputElement).value).toBe('')
  })

  describe('écran quitté pendant l’appel réseau', () => {
    function suspendre<T>(resultat: T): { promesse: Promise<T>; terminer: () => void } {
      let terminer = (): void => {}
      const promesse = new Promise<T>((resolve) => {
        terminer = () => resolve(resultat)
      })
      return { promesse, terminer: () => terminer() }
    }

    it('ne ramène plus au parcours d’origine quand la connexion aboutit après coup', async () => {
      const { promesse, terminer } = suspendre({ userId: USER_ID })
      repository.signIn.mockReturnValue(promesse)
      const wrapper = await monter()
      await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse')
      await envoyer(wrapper)

      wrapper.unmount()
      terminer()
      await flushPromises()

      expect(replace).not.toHaveBeenCalled()
    })

    it('n’écrit rien quand l’inscription aboutit après coup', async () => {
      const { promesse, terminer } = suspendre({ kind: 'confirmation-pending' } as const)
      repository.signUp.mockReturnValue(promesse)
      const wrapper = await monter()
      await basculer(wrapper)
      await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse')
      await envoyer(wrapper)

      wrapper.unmount()
      terminer()
      await flushPromises()

      expect(replace).not.toHaveBeenCalled()
      expect(stockage.keys()).toEqual([])
      expect(document.body.textContent).not.toContain('Vérifie ta boîte mail')
    })
  })
})
