import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { createMemoryHistory, createRouter, createWebHistory, type Router } from 'vue-router'

import { AccountError } from '../logic/account-error'
import { authRepository, type AuthRepository } from '../repository/auth.repository'
import { signInWithGoogle } from '../service/google-sign-in.service'
import { provideAuthRepository } from '../store/auth.store'
import SignInView from '../views/SignInView.vue'
import { memoryStorage, USER_ID, type MemoryStorage } from './auth-fixture'
import { GoogleCredentialError } from '@/core/google-sign-in/google-credentials'
import i18n from '@/core/i18n'
import {
  createRestoreFlow,
  provideRestoreFlow,
  type RestoreFlow,
} from '@/core/sync/service/restore-flow'
import vuetify from '@/core/theme/vuetify'

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

const repository = vi.mocked(authRepository)
const googleSignIn = vi.mocked(signInWithGoogle)
provideAuthRepository(() => authRepository)
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
      { path: '/', name: 'home', component: Vide },
      { path: '/settings/plus', name: 'settings-plus', component: Vide },
      { path: '/restore', name: 'account-restore', component: Vide },
      { path: '/plus/account', name: 'plus-account', component: Vide },
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

    expect(wrapper.get('h1').text()).toBe('Créer un compte')
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

  describe('création du compte (V25)', () => {
    it('donne la longueur minimale du mot de passe, à l’inscription seulement', async () => {
      const wrapper = await monter()

      expect(wrapper.find('.form-field__help').exists()).toBe(false)

      await basculer(wrapper)

      const aide = wrapper.get('.form-field__help')
      expect(aide.text()).toBe('Au moins 8 caractères.')
      expect(wrapper.get('#sign-in-password').attributes('aria-describedby')).toContain(
        aide.attributes('id'),
      )
    })

    it('remplace l’aide par l’erreur quand le mot de passe est trop court', async () => {
      const wrapper = await monter()

      await basculer(wrapper)
      await saisir(wrapper, 'sophie.martin@example.com', 'court')
      await envoyer(wrapper)

      expect(wrapper.text()).toContain('Choisis un mot de passe d’au moins 8 caractères.')
      expect(wrapper.find('.form-field__help').exists()).toBe(false)
    })

    it('dit l’âge requis et mène à la politique de confidentialité, avant le bouton', async () => {
      const wrapper = await monter()

      expect(wrapper.find('.account-legal').exists()).toBe(false)

      await basculer(wrapper)

      expect(wrapper.get('.account-legal__adults').text()).toBe(
        'MémoPatte s’adresse aux 18 ans et plus.',
      )
      const politique = wrapper.get('.account-legal__privacy')
      expect(politique.text()).toBe('Politique de confidentialité')
      expect(politique.attributes('href')).toBe('https://memopatte.app/confidentialite/')
      expect(politique.attributes('target')).toBe('_blank')
      const ordre = wrapper.findAll(
        '.sign-in__form .account-legal, .sign-in__form .sign-in__submit',
      )
      expect(ordre.map((element) => element.classes('sign-in__submit'))).toEqual([false, true])
    })

    it('se lit en anglais aussi', async () => {
      i18n.global.locale.value = 'en'
      try {
        const wrapper = await monter('/sign-in?mode=sign-up')

        expect(wrapper.get('h1').text()).toBe('Create an account')
        expect(wrapper.get('.form-field__help').text()).toBe('At least 8 characters.')
        expect(wrapper.get('.account-legal__adults').text()).toBe(
          'MémoPatte is for people aged 18 and over.',
        )
        expect(wrapper.get('.account-legal__privacy').attributes('href')).toBe(
          'https://memopatte.app/en/privacy/',
        )
      } finally {
        i18n.global.locale.value = 'fr'
      }
    })
  })

  it('connecte puis ramène au parcours d’origine', async () => {
    repository.signIn.mockResolvedValue({ userId: USER_ID })
    const wrapper = await monter('/sign-in?from=settings')

    await saisir(wrapper, ' sophie.martin@example.com ', 'motdepasse')
    await envoyer(wrapper)

    expect(repository.signIn).toHaveBeenCalledWith('sophie.martin@example.com', 'motdepasse')
    expect(replace).toHaveBeenCalledWith({ name: 'settings' })
  })

  describe('depuis « Étape 1 sur 2 »', () => {
    let historique: Router

    beforeEach(async () => {
      historique = createRouter({ history: createWebHistory(), routes: routeur.options.routes })
      await historique.push('/plus/account')
      await historique.push('/sign-in?from=plus-account&mode=sign-up')
      routeur = historique
    })

    afterEach(() => {
      historique.options.history.destroy()
    })

    it('s’ouvre directement sur la création du compte', async () => {
      const wrapper = await monter('/sign-in?from=plus-account&mode=sign-up')

      expect(wrapper.get('h1').text()).toBe('Créer un compte')
      expect(wrapper.get('.sign-in__submit').text()).toBe('Créer mon compte')
    })

    it('y revient par l’historique, sans doubler l’écran', async () => {
      const back = vi.spyOn(routeur, 'back').mockImplementation(() => {})
      const wrapper = await monter('/sign-in?from=plus-account&mode=sign-up')

      await wrapper.get('.pushed-screen__back').trigger('click')

      expect(back).toHaveBeenCalledOnce()
      expect(replace).not.toHaveBeenCalled()
    })

    it('y revient aussi une fois le compte créé, pour reprendre le paiement', async () => {
      repository.signUp.mockResolvedValue({ kind: 'signed-in', session: { userId: USER_ID } })
      const back = vi.spyOn(routeur, 'back').mockImplementation(() => {})
      const wrapper = await monter('/sign-in?from=plus-account&mode=sign-up')

      await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse')
      await envoyer(wrapper)

      expect(repository.signUp).toHaveBeenCalledWith('sophie.martin@example.com', 'motdepasse')
      expect(back).toHaveBeenCalledOnce()
      expect(replace).not.toHaveBeenCalled()
    })
  })

  describe('vers la restauration du carnet', () => {
    let flow: RestoreFlow

    beforeEach(() => {
      flow = createRestoreFlow({
        pendingMode: async () => null,
        start: async () => {},
        run: async () => {},
        progress: { done: 0, total: 0 },
        onProgress: () => () => {},
      })
      provideRestoreFlow(flow)
    })

    afterEach(() => {
      provideRestoreFlow(null)
    })

    it('attend le contrôle de la sauvegarde, bouton occupé, puis ouvre « Restaurer mon carnet »', async () => {
      repository.signIn.mockImplementation(async () => {
        flow.checking()
        return { userId: USER_ID }
      })
      const wrapper = await monter('/sign-in?from=settings-plus&restore=1')

      await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse')
      await envoyer(wrapper)
      expect(replace).not.toHaveBeenCalled()
      expect(wrapper.find('.sign-in__loading').exists()).toBe(true)

      flow.offer({ animalCount: 3, lastBackupAt: '2026-10-20T19:04:00.000Z' })
      await flushPromises()

      expect(replace).toHaveBeenCalledWith({
        name: 'account-restore',
        query: { from: 'settings-plus' },
      })
    })

    it('sans réponse du serveur à temps : le message habituel et « Réessayer », la connexion reste faite', async () => {
      repository.signIn.mockImplementation(async () => {
        flow.checking()
        return { userId: USER_ID }
      })
      const retried = vi.fn<() => void>()
      flow.onRetryCheck(retried)
      const wrapper = await monter('/sign-in?from=settings-plus&restore=1')
      await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse')
      await envoyer(wrapper)

      flow.noAnswer()
      await flushPromises()

      expect(replace).not.toHaveBeenCalled()
      expect(wrapper.get('.sign-in__no-answer [role="alert"]').text()).toBe(
        'Quelque chose s’est mal passé. Réessaie dans un instant.',
      )
      expect(wrapper.find('.sign-in__form').exists()).toBe(false)
      expect(wrapper.get('.sign-in__no-answer-retry').text()).toBe('Réessayer')
      await wrapper.get('.sign-in__no-answer-retry').trigger('click')
      await flushPromises()
      expect(retried).toHaveBeenCalledOnce()
      expect(wrapper.find('.sign-in__loading').exists()).toBe(true)

      flow.offer({ animalCount: 3, lastBackupAt: '2026-10-20T19:04:00.000Z' })
      await flushPromises()
      expect(replace).toHaveBeenCalledWith({
        name: 'account-restore',
        query: { from: 'settings-plus' },
      })
      expect(repository.signOut).not.toHaveBeenCalled()
    })

    it('par Google aussi : attend le contrôle, puis ouvre « Restaurer mon carnet »', async () => {
      googleSignIn.mockImplementation(async () => {
        flow.checking()
        return { kind: 'signed-in', session: { userId: USER_ID } }
      })
      const wrapper = await monter('/sign-in?from=home&restore=1')

      await wrapper.get('.sign-in__google').trigger('click')
      await flushPromises()
      expect(replace).not.toHaveBeenCalled()
      expect(wrapper.find('.sign-in__loading').exists()).toBe(true)

      flow.offer({ animalCount: 3, lastBackupAt: '2026-10-20T19:04:00.000Z' })
      await flushPromises()

      expect(replace).toHaveBeenCalledWith({ name: 'account-restore', query: { from: 'home' } })
    })

    it('sans sauvegarde, ramène à l’écran d’origine', async () => {
      repository.signIn.mockImplementation(async () => {
        flow.checking()
        return { userId: USER_ID }
      })
      const wrapper = await monter('/sign-in?from=home&restore=1')

      await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse')
      await envoyer(wrapper)
      flow.reset()
      await flushPromises()

      expect(replace).toHaveBeenCalledWith({ name: 'home' })
    })
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

  describe('Continuer avec Google', () => {
    it('met le bouton Google avant le formulaire e-mail, séparé par un trait', async () => {
      const wrapper = await monter()

      const google = wrapper.get('.sign-in__google')
      expect(google.text()).toBe('Continuer avec Google')
      expect(google.attributes('type')).toBe('button')
      expect(google.find('svg').exists()).toBe(true)
      const position = (name: string): number =>
        Array.from(wrapper.get('.sign-in__panel').element.children).findIndex((element) =>
          element.classList.contains(name),
        )
      expect(position('sign-in__google')).toBeGreaterThan(position('sign-in__intro'))
      expect(position('sign-in__google')).toBeLessThan(position('sign-in__separator'))
      expect(position('sign-in__separator')).toBeLessThan(position('sign-in__form'))
    })

    it('reste au même endroit et au même libellé à l’inscription', async () => {
      const wrapper = await monter()

      await basculer(wrapper)

      expect(wrapper.get('.sign-in__google').text()).toBe('Continuer avec Google')
    })

    it('connecte puis ramène au parcours d’origine', async () => {
      googleSignIn.mockResolvedValue({ kind: 'signed-in', session: { userId: USER_ID } })
      const wrapper = await monter('/sign-in?from=settings')

      await wrapper.get('.sign-in__google').trigger('click')
      await flushPromises()

      expect(replace).toHaveBeenCalledWith({ name: 'settings' })
    })

    it('ne change rien quand le sélecteur est fermé sans choisir', async () => {
      googleSignIn.mockResolvedValue({ kind: 'cancelled' })
      const wrapper = await monter()

      await wrapper.get('.sign-in__google').trigger('click')
      await flushPromises()

      expect(replace).not.toHaveBeenCalled()
      expect(wrapper.find('.sign-in__error').exists()).toBe(false)
      expect(wrapper.get('.sign-in__google').text()).toBe('Continuer avec Google')
    })

    it.each([
      [
        new GoogleCredentialError('no-google-account'),
        'Aucun compte Google sur ce téléphone. Ajoute-le dans les réglages d’Android, ou continue avec une adresse e-mail.',
      ],
      [
        new GoogleCredentialError('unavailable'),
        'La connexion avec Google n’est pas disponible sur ce téléphone. Continue avec une adresse e-mail.',
      ],
      [
        new GoogleCredentialError('failed'),
        'Quelque chose s’est mal passé. Réessaie dans un instant.',
      ],
      [new AccountError('offline'), 'Pas de connexion internet. Vérifie ton réseau et réessaie.'],
    ])('annonce l’échec %#', async (cause, message) => {
      googleSignIn.mockRejectedValue(cause)
      const wrapper = await monter()

      await wrapper.get('.sign-in__google').trigger('click')
      await flushPromises()

      expect(wrapper.get('.sign-in__error').text()).toBe(message)
    })

    it('annonce la connexion en cours et n’ouvre le sélecteur qu’une fois', async () => {
      let terminer = (): void => {}
      googleSignIn.mockReturnValue(
        new Promise((resolve) => {
          terminer = () => resolve({ kind: 'cancelled' })
        }),
      )
      const wrapper = await monter()
      await basculer(wrapper)

      await wrapper.get('.sign-in__google').trigger('click')
      await flushPromises()

      expect(wrapper.get('.sign-in__loading').text()).toContain('Connexion en cours…')

      terminer()
      await flushPromises()

      expect(googleSignIn).toHaveBeenCalledTimes(1)
      expect(wrapper.find('.sign-in__loading').exists()).toBe(false)
    })
  })
})
