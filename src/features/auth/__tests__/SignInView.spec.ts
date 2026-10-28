import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { createMemoryHistory, createRouter, createWebHistory, type Router } from 'vue-router'

import { AccountError } from '../logic/account-error'
import { authRepository, type AuthRepository } from '../repository/auth.repository'
import { signInWithGoogle } from '../service/google-sign-in.service'
import type { AnimalsRepository } from '@/features/animals/repository/animals.repository'
import { provideAnimalsRepository } from '@/features/animals/store/animals.store'
import { provideAuthRepository } from '../store/auth.store'
import SignInView from '../views/SignInView.vue'
import PasswordField from '@/shared/form/PasswordField.vue'
import { memoryStorage, USER_ID, type MemoryStorage } from './auth-fixture'
import { GoogleCredentialError } from '@/core/google-sign-in/google-credentials'
import i18n from '@/core/i18n'
import {
  createRestoreFlow,
  provideRestoreFlow,
  type RestoreFlow,
} from '@/core/sync/service/restore-flow'
import vuetify from '@/core/theme/vuetify'
import { dismissToast, toastMessage } from '@/shared/utils/toast'

vi.mock('../repository/auth.repository', () => ({
  authRepository: {
    signUp: vi.fn<AuthRepository['signUp']>(),
    verifySignUpCode: vi.fn<AuthRepository['verifySignUpCode']>(),
    resendSignUpCode: vi.fn<AuthRepository['resendSignUpCode']>(),
    signIn: vi.fn<AuthRepository['signIn']>(),
    signOut: vi.fn<AuthRepository['signOut']>(async () => {}),
    restoreSession: vi.fn<AuthRepository['restoreSession']>(),
    refreshSession: vi.fn<AuthRepository['refreshSession']>(),
    onSessionChange: vi.fn<AuthRepository['onSessionChange']>(),
  },
}))

const retours = vi.hoisted(() => [] as Array<() => void>)

vi.mock('@/core/app-lifecycle/back-button', () => ({
  onBackButton: (handler: () => void) => {
    retours.push(handler)
    return () => {
      const index = retours.indexOf(handler)
      if (index !== -1) retours.splice(index, 1)
    }
  },
}))

async function retourAndroid(): Promise<boolean> {
  const handler = retours.at(-1)
  handler?.()
  await flushPromises()
  return handler !== undefined
}

vi.mock('../service/google-sign-in.service', () => ({
  signInWithGoogle: vi.fn<typeof signInWithGoogle>(),
}))

const repository = vi.mocked(authRepository)
const googleSignIn = vi.mocked(signInWithGoogle)
provideAuthRepository(() => authRepository)
provideAnimalsRepository(() => ({ list: async () => [] }) as unknown as AnimalsRepository)
const Vide = { render: () => null }
const ACHAT = '/sign-in?from=plus-account'
const DEJA_PLUS = [
  ['l’écran Plus', '/sign-in?from=plus&restore=1'],
  ['l’accueil de bienvenue', '/sign-in?from=home&restore=1'],
  ['Paramètres', '/sign-in?from=settings-plus&restore=1'],
]

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
      { path: '/sign-in/password-reset', name: 'password-reset', component: Vide },
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

async function saisir(
  wrapper: VueWrapper,
  email: string,
  password: string,
  confirmation = password,
): Promise<void> {
  await wrapper.get('#sign-in-email').setValue(email)
  await wrapper.get('#sign-in-password').setValue(password)
  const champ = wrapper.find('#sign-in-confirmation')
  if (champ.exists()) await champ.setValue(confirmation)
}

function erreurDeConfirmation(wrapper: VueWrapper): string | undefined {
  const champ = wrapper.get('#sign-in-confirmation').element.closest('.form-field')
  return champ?.querySelector('.form-field__error')?.textContent?.trim()
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
  dismissToast()
  retours.length = 0
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

function champsDeMotDePasse(w: VueWrapper): (string | undefined)[] {
  return w.findAllComponents(PasswordField).map((champ) => champ.get('input').attributes('id'))
}

describe('SignInView', () => {
  it('explique à quoi sert un compte et propose la connexion', async () => {
    const wrapper = await monter()

    expect(wrapper.get('h1').text()).toBe('Connexion')
    expect(wrapper.get('.sign-in__intro').text()).toBe(
      'Un compte MémoPatte sert à garder tes carnets en sécurité dans le cloud et à les retrouver sur tous tes appareils.',
    )
    expect(wrapper.get('.sign-in__submit').text()).toBe('Se connecter')
  })

  describe('« J’ai déjà MémoPatte Plus » : connexion seule', () => {
    it.each(DEJA_PLUS)('depuis %s, aucun moyen de créer un compte', async (_, adresse) => {
      const wrapper = await monter(adresse)

      expect(wrapper.get('h1').text()).toBe('Connexion')
      expect(wrapper.find('.sign-in__toggle').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('Créer un compte')
      expect(wrapper.findAll('.sign-in__panel .v-btn').map((bouton) => bouton.text())).toEqual([
        'Mot de passe oublié\u00a0?',
        'Se connecter',
      ])
    })

    it.each([
      ...DEJA_PLUS,
      ['la déconnexion', '/sign-in?from=settings'],
      ['aucun parcours', '/sign-in'],
    ])('depuis %s, un lien vers la création ouvre la connexion', async (_, adresse) => {
      const wrapper = await monter(`${adresse}${adresse.includes('?') ? '&' : '?'}mode=sign-up`)

      expect(wrapper.get('h1').text()).toBe('Connexion')
      expect(wrapper.get('.sign-in__submit').text()).toBe('Se connecter')
      expect(wrapper.find('.sign-in__toggle').exists()).toBe(false)
      expect(wrapper.find('.account-legal__adults').exists()).toBe(false)
      expect(wrapper.get('#sign-in-password').attributes('autocomplete')).toBe('current-password')
    })

    it('se connecte, sans jamais créer de compte', async () => {
      repository.signIn.mockResolvedValue({ userId: USER_ID })
      const wrapper = await monter('/sign-in?from=plus&restore=1&mode=sign-up')

      await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse')
      await envoyer(wrapper)

      expect(repository.signIn).toHaveBeenCalledWith('sophie.martin@example.com', 'motdepasse')
      expect(repository.signUp).not.toHaveBeenCalled()
    })
  })

  it('depuis l’étape 1 de l’achat, propose aussi la création du compte', async () => {
    const wrapper = await monter(ACHAT)

    expect(wrapper.get('h1').text()).toBe('Connexion')
    expect(wrapper.get('.sign-in__toggle').text()).toBe('Pas encore de compte ? Créer un compte')
  })

  it.each([
    ['à la connexion', '/sign-in'],
    ['à la création du compte', `${ACHAT}&mode=sign-up`],
  ])('porte le champ partagé avec l’icône œil %s', async (_, adresse) => {
    const wrapper = await monter(adresse)

    expect(champsDeMotDePasse(wrapper)[0]).toBe('sign-in-password')
  })

  it('porte aussi le champ partagé pour la confirmation, à la création du compte', async () => {
    expect(champsDeMotDePasse(await monter(`${ACHAT}&mode=sign-up`))).toEqual([
      'sign-in-password',
      'sign-in-confirmation',
    ])
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
    const wrapper = await monter(ACHAT)

    await basculer(wrapper)

    expect(wrapper.get('h1').text()).toBe('Créer un compte')
    expect(wrapper.get('.sign-in__submit').text()).toBe('Recevoir le code')
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
    const wrapper = await monter(ACHAT)

    await basculer(wrapper)
    await saisir(wrapper, 'sophie.martin@example.com', 'court')
    await envoyer(wrapper)

    expect(repository.signUp).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Choisis un mot de passe d’au moins 8 caractères.')
    expect(document.activeElement?.id).toBe('sign-in-password')
  })

  describe('création du compte (V25)', () => {
    describe('confirmation du mot de passe', () => {
      it('demande le mot de passe une seconde fois, juste après', async () => {
        const wrapper = await monter(`${ACHAT}&mode=sign-up`)

        expect(wrapper.get('label[for="sign-in-confirmation"]').text()).toContain(
          'Confirme le mot de passe',
        )
        expect(wrapper.get('#sign-in-confirmation').attributes('autocomplete')).toBe('new-password')
      })

      it('laisse « Recevoir le code » inactif tant que les deux saisies diffèrent', async () => {
        const wrapper = await monter(`${ACHAT}&mode=sign-up`)
        await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse', 'motdepasse ')

        expect(wrapper.get('.sign-in__submit').attributes('disabled')).toBeDefined()

        await wrapper.get('#sign-in-confirmation').setValue('motdepasse')
        expect(wrapper.get('.sign-in__submit').attributes('disabled')).toBeUndefined()
      })

      it('montre l’écart sous la confirmation une fois le champ quitté', async () => {
        const wrapper = await monter(`${ACHAT}&mode=sign-up`)
        await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse', 'Motdepasse')

        expect(erreurDeConfirmation(wrapper)).toBeUndefined()
        await wrapper.get('#sign-in-confirmation').trigger('blur')

        expect(erreurDeConfirmation(wrapper)).toBe('Les deux mots de passe ne sont pas identiques.')
      })

      it('refuse l’envoi par le clavier et focalise la confirmation', async () => {
        const wrapper = await monter(`${ACHAT}&mode=sign-up`)
        await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse', 'motdepass')

        await envoyer(wrapper)

        expect(repository.signUp).not.toHaveBeenCalled()
        expect(erreurDeConfirmation(wrapper)).toBe('Les deux mots de passe ne sont pas identiques.')
        expect(document.activeElement?.id).toBe('sign-in-confirmation')
      })

      it('n’envoie que l’adresse et le mot de passe', async () => {
        repository.signUp.mockResolvedValue({ kind: 'confirmation-pending' })
        const wrapper = await monter(`${ACHAT}&mode=sign-up`)
        await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse')

        await envoyer(wrapper)

        expect(repository.signUp.mock.calls).toEqual([
          ['sophie.martin@example.com', 'motdepasse', 'fr'],
        ])
      })

      it('remet l’œil du mot de passe en position masquée à chaque bascule', async () => {
        const wrapper = await monter(ACHAT)
        await wrapper.get('#sign-in-password').setValue('motdepasse')
        await wrapper.get('.password-field__toggle').trigger('click')
        expect(wrapper.get('#sign-in-password').attributes('type')).toBe('text')

        await basculer(wrapper)

        expect(wrapper.get('#sign-in-password').attributes('type')).toBe('password')
        expect((wrapper.get('#sign-in-password').element as HTMLInputElement).value).toBe(
          'motdepasse',
        )
      })

      it('efface la confirmation quand on bascule de formulaire', async () => {
        const wrapper = await monter(`${ACHAT}&mode=sign-up`)
        await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse')

        await basculer(wrapper)
        await basculer(wrapper)

        expect((wrapper.get('#sign-in-confirmation').element as HTMLInputElement).value).toBe('')
      })

      it('ne remontre pas l’écart dès la première frappe après une bascule', async () => {
        const wrapper = await monter(`${ACHAT}&mode=sign-up`)
        await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse', 'autre')
        await wrapper.get('#sign-in-confirmation').trigger('blur')
        expect(erreurDeConfirmation(wrapper)).toBe('Les deux mots de passe ne sont pas identiques.')

        await basculer(wrapper)
        await basculer(wrapper)
        await wrapper.get('#sign-in-confirmation').setValue('m')

        expect(erreurDeConfirmation(wrapper)).toBeUndefined()
      })

      it('ne remontre pas l’écart dès la première frappe après « Changer d’adresse »', async () => {
        repository.signUp.mockResolvedValue({ kind: 'confirmation-pending' })
        const wrapper = await monter(`${ACHAT}&mode=sign-up`)
        await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse')
        await wrapper.get('#sign-in-confirmation').trigger('blur')
        await envoyer(wrapper)
        await wrapper.get('.email-code__change').trigger('click')
        await flushPromises()

        await wrapper.get('#sign-in-password').setValue('motdepasse')
        await wrapper.get('#sign-in-confirmation').setValue('m')

        expect(wrapper.get('h1').text()).toBe('Créer un compte')
        expect(erreurDeConfirmation(wrapper)).toBeUndefined()
      })

      it('ne demande rien de plus à la connexion', async () => {
        const wrapper = await monter(ACHAT)

        expect(wrapper.find('#sign-in-confirmation').exists()).toBe(false)
        expect(wrapper.text()).not.toContain('Confirme le mot de passe')
      })

      it('se lit en anglais aussi', async () => {
        i18n.global.locale.value = 'en'
        try {
          const wrapper = await monter(`${ACHAT}&mode=sign-up`)
          expect(wrapper.get('label[for="sign-in-confirmation"]').text()).toContain(
            'Confirm the password',
          )
        } finally {
          i18n.global.locale.value = 'fr'
        }
      })
    })

    it('donne la longueur minimale du mot de passe, à l’inscription seulement', async () => {
      const wrapper = await monter(ACHAT)

      expect(wrapper.find('.form-field__help').exists()).toBe(false)

      await basculer(wrapper)

      const aide = wrapper.get('.form-field__help')
      expect(aide.text()).toBe('Au moins 8 caractères.')
      expect(wrapper.get('#sign-in-password').attributes('aria-describedby')).toContain(
        aide.attributes('id'),
      )
    })

    it('remplace l’aide par l’erreur quand le mot de passe est trop court', async () => {
      const wrapper = await monter(ACHAT)

      await basculer(wrapper)
      await saisir(wrapper, 'sophie.martin@example.com', 'court')
      await envoyer(wrapper)

      expect(wrapper.text()).toContain('Choisis un mot de passe d’au moins 8 caractères.')
      expect(wrapper.find('.form-field__help').exists()).toBe(false)
    })

    it('ouvre le formulaire par « Ton e-mail », sous le trait et le bouton Google', async () => {
      const wrapper = await monter(ACHAT)

      expect(wrapper.find('.sign-in__email-hero').exists()).toBe(false)

      await basculer(wrapper)

      const entete = wrapper.get('.sign-in__email-hero')
      expect(entete.get('h2').text()).toBe('Ton e-mail')
      expect(entete.get('p').text()).toBe(
        'Il sert à retrouver ton carnet et à sécuriser ton compte.',
      )
      expect(entete.find('.v-icon').exists()).toBe(true)
      const ordre = wrapper.findAll(
        '.google-button, .sign-in__separator, .sign-in__email-hero, #sign-in-email',
      )
      expect(
        ordre.map(
          (element) =>
            ['google-button', 'sign-in__separator', 'sign-in__email-hero'].find((classe) =>
              element.classes().includes(classe),
            ) ?? element.attributes('id'),
        ),
      ).toEqual(['google-button', 'sign-in__separator', 'sign-in__email-hero', 'sign-in-email'])
    })

    it('dit l’âge requis et mène à la politique de confidentialité, avant le bouton', async () => {
      const wrapper = await monter(ACHAT)

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
        const wrapper = await monter(`${ACHAT}&mode=sign-up`)

        expect(wrapper.get('h1').text()).toBe('Create an account')
        expect(wrapper.get('.form-field__help').text()).toBe('At least 8 characters.')
        expect(wrapper.get('.sign-in__email-hero h2').text()).toBe('Your email')
        expect(wrapper.get('.sign-in__email-hero p').text()).toBe(
          'It’s used to recover your health record and secure your account.',
        )
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
      expect(wrapper.get('.sign-in__submit').text()).toBe('Recevoir le code')
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

      expect(repository.signUp).toHaveBeenCalledWith(
        'sophie.martin@example.com',
        'motdepasse',
        'fr',
      )
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
        run: async () => 'restored',
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

    it('par un code après une adresse jamais confirmée : sans réponse, plus d’écran du code ni de « Confirmer »', async () => {
      repository.signIn.mockRejectedValue(new AccountError('email-not-confirmed'))
      repository.resendSignUpCode.mockResolvedValue()
      repository.verifySignUpCode.mockImplementation(async () => {
        flow.checking()
        return { userId: USER_ID }
      })
      const wrapper = await monter('/sign-in?from=settings-plus&restore=1')
      await saisir(wrapper, 'sophie@exemple.fr', 'motdepasse')
      await envoyer(wrapper)
      await wrapper.get('#email-code-input').setValue('12345678')
      await wrapper.get('.sign-in__confirm-code').trigger('click')
      await flushPromises()

      flow.noAnswer()
      await flushPromises()

      expect(wrapper.get('.sign-in__no-answer-retry').text()).toBe('Réessayer')
      expect(wrapper.get('h1').text()).not.toBe('Confirme ton e-mail')
      expect(wrapper.find('.email-code').exists()).toBe(false)
      expect(wrapper.find('.sign-in__confirm-code').exists()).toBe(false)
      expect(repository.verifySignUpCode).toHaveBeenCalledOnce()
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
    const wrapper = await monter(ACHAT)

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
    const wrapper = await monter(ACHAT)

    await basculer(wrapper)
    await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse')
    await envoyer(wrapper)

    expect(wrapper.get('.sign-in__error').text()).toBe(
      'Un compte existe déjà avec cette adresse e-mail.',
    )
  })

  it('ramène au parcours d’origine quand l’inscription ouvre déjà une session', async () => {
    repository.signUp.mockResolvedValue({ kind: 'signed-in', session: { userId: USER_ID } })
    const wrapper = await monter(ACHAT)

    await basculer(wrapper)
    await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse')
    await envoyer(wrapper)

    expect(replace).toHaveBeenCalledWith({ name: 'plus-account' })
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

  it('ne porte que ses boutons : « Mot de passe oublié ? », se connecter, créer un compte', async () => {
    const wrapper = await monter(ACHAT)

    expect(wrapper.findAll('.sign-in__panel .v-btn').map((bouton) => bouton.text())).toEqual([
      'Mot de passe oublié\u00a0?',
      'Se connecter',
      'Créer un compte',
    ])
    expect(wrapper.findAll('.sign-in__panel a')).toEqual([])
  })

  describe('« Mot de passe oublié ? » (PL-9)', () => {
    it('se place juste sous le mot de passe, à la connexion seulement', async () => {
      const wrapper = await monter(ACHAT)

      const lien = wrapper.get('.sign-in__fields .sign-in__forgot')
      expect(lien.text()).toBe('Mot de passe oublié\u00a0?')
      expect(lien.element.previousElementSibling?.querySelector('#sign-in-password')).not.toBeNull()

      await basculer(wrapper)
      expect(wrapper.find('.sign-in__forgot').exists()).toBe(false)
    })

    it('ouvre « Mot de passe oublié » avec l’adresse tapée, sans la mettre dans l’adresse de l’écran', async () => {
      const wrapper = await monter('/sign-in?from=plus-account&restore=1')
      const push = vi.spyOn(routeur, 'push').mockResolvedValue()
      await wrapper.get('#sign-in-email').setValue('  sophie@exemple.fr ')

      await wrapper.get('.sign-in__forgot').trigger('click')

      expect(push).toHaveBeenCalledWith({
        name: 'password-reset',
        query: { from: 'plus-account', restore: '1' },
        state: { email: 'sophie@exemple.fr' },
      })
    })

    it('se lit en anglais aussi', async () => {
      i18n.global.locale.value = 'en'
      try {
        const wrapper = await monter()
        expect(wrapper.get('.sign-in__forgot').text()).toBe('Forgot password?')
      } finally {
        i18n.global.locale.value = 'fr'
      }
    })
  })

  it('oublie l’erreur du serveur en basculant de formulaire', async () => {
    repository.signIn.mockRejectedValue(new AccountError('invalid-credentials'))
    const wrapper = await monter(ACHAT)

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

  describe('code à 8 chiffres (V25 bis)', () => {
    const ENVOI = new Date(2026, 9, 22, 18, 0)

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'], now: ENVOI })
      repository.signUp.mockResolvedValue({ kind: 'confirmation-pending' })
      repository.resendSignUpCode.mockResolvedValue()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    async function inscrire(adresse = ACHAT): Promise<VueWrapper> {
      const wrapper = await monter(adresse)
      await basculer(wrapper)
      await saisir(wrapper, 'sophie@exemple.fr', 'motdepasse')
      await envoyer(wrapper)
      return wrapper
    }

    async function taper(wrapper: VueWrapper, code: string): Promise<void> {
      await wrapper.get('#email-code-input').setValue(code)
    }

    async function confirmer(wrapper: VueWrapper): Promise<void> {
      await wrapper.get('.sign-in__confirm-code').trigger('click')
      await flushPromises()
    }

    it('« Recevoir le code » ouvre « Confirme ton e-mail » pour l’adresse saisie', async () => {
      const wrapper = await inscrire()

      expect(wrapper.get('h1').text()).toBe('Confirme ton e-mail')
      expect(wrapper.get('.email-code__message').text()).toBe(
        'Entre le code à 8 chiffres envoyé à sophie@exemple.fr.',
      )
      expect(wrapper.findAll('.email-code__box')).toHaveLength(8)
      expect(wrapper.get('.email-code__resend').text()).toBe('Renvoyer le code')
      expect(wrapper.get('.email-code__change').text()).toBe('Changer d’adresse')
      expect(wrapper.get('.sign-in__confirm-code').text()).toBe('Confirmer')
      expect(replace).not.toHaveBeenCalled()
      expect(stockage.keys()).toEqual([])
    })

    it('étiquette le champ du code par la phrase et adapte le clavier', async () => {
      const wrapper = await inscrire()
      const champ = wrapper.get('#email-code-input')

      expect(champ.attributes('aria-labelledby')).toBe(
        wrapper.get('.email-code__message').attributes('id'),
      )
      expect(champ.attributes('inputmode')).toBe('numeric')
      expect(champ.attributes('autocomplete')).toBe('one-time-code')
    })

    it('grise « Confirmer » tant qu’il manque un chiffre, et montre les chiffres tapés', async () => {
      const wrapper = await inscrire()

      await taper(wrapper, '1234')
      expect(wrapper.get('.sign-in__confirm-code').attributes('disabled')).toBeDefined()
      expect(wrapper.findAll('.email-code__box').map((chiffre) => chiffre.text())).toEqual([
        '1',
        '2',
        '3',
        '4',
        '',
        '',
        '',
        '',
      ])

      await taper(wrapper, '12345678')
      expect(wrapper.get('.sign-in__confirm-code').attributes('disabled')).toBeUndefined()
    })

    it('revient au formulaire par le retour d’Android, adresse gardée, mots de passe vidés, rien envoyé', async () => {
      const wrapper = await inscrire()
      await taper(wrapper, '1234')
      repository.signUp.mockClear()
      repository.resendSignUpCode.mockClear()

      expect(await retourAndroid()).toBe(true)

      expect(wrapper.find('.email-code').exists()).toBe(false)
      expect((wrapper.get('#sign-in-email').element as HTMLInputElement).value).toBe(
        'sophie@exemple.fr',
      )
      expect((wrapper.get('#sign-in-password').element as HTMLInputElement).value).toBe('')
      expect(repository.signUp).not.toHaveBeenCalled()
      expect(repository.resendSignUpCode).not.toHaveBeenCalled()
      expect(replace).not.toHaveBeenCalled()
    })

    it('laisse le retour d’Android quitter l’écran depuis le formulaire', async () => {
      await monter()

      expect(await retourAndroid()).toBe(false)
    })

    it('quitte l’écran, connecté, si le serveur accepte le code après un retour en arrière', async () => {
      let accepter: (value: { userId: string }) => void = () => {}
      repository.verifySignUpCode.mockReturnValue(new Promise((resolve) => (accepter = resolve)))
      const wrapper = await inscrire()
      await taper(wrapper, '12345678')
      await wrapper.get('.sign-in__confirm-code').trigger('click')

      await retourAndroid()
      accepter({ userId: USER_ID })
      await flushPromises()

      expect(replace).toHaveBeenCalledWith({ name: 'plus-account' })
      expect(replace).toHaveBeenCalledTimes(1)
    })

    it('ouvre le compte avec le bon code puis ramène au parcours d’origine', async () => {
      repository.verifySignUpCode.mockResolvedValue({ userId: USER_ID })
      const wrapper = await inscrire()

      await taper(wrapper, '12345678')
      await confirmer(wrapper)

      expect(repository.verifySignUpCode).toHaveBeenCalledWith('sophie@exemple.fr', '12345678')
      expect(replace).toHaveBeenCalledWith({ name: 'plus-account' })
    })

    it('dit « pas le bon » sous le code, dans l’heure', async () => {
      repository.verifySignUpCode.mockRejectedValue(new AccountError('invalid-code'))
      const wrapper = await inscrire()

      await taper(wrapper, '12345670')
      await confirmer(wrapper)

      expect(wrapper.get('.email-code__error').text()).toBe(
        'Ce code n’est pas le bon. Vérifie-le ou demande un nouveau code.',
      )
      expect(wrapper.get('#email-code-input').attributes('aria-invalid')).toBe('true')
      expect(replace).not.toHaveBeenCalled()
    })

    it('dit « a expiré » le lendemain, et met « Renvoyer le code » en avant', async () => {
      repository.verifySignUpCode.mockRejectedValue(new AccountError('invalid-code'))
      const wrapper = await inscrire()
      vi.setSystemTime(new Date(2026, 9, 23, 9, 0))

      await taper(wrapper, '12345678')
      await confirmer(wrapper)

      expect(wrapper.get('.email-code__error').text()).toBe(
        'Ce code a expiré. Demande un nouveau code.',
      )
      expect(wrapper.get('.email-code__resend').classes()).toContain('v-btn--variant-outlined')
    })

    it('fait attendre une minute avant de renvoyer le code', async () => {
      const wrapper = await inscrire()
      vi.setSystemTime(new Date(ENVOI.getTime() + 20_000))

      await wrapper.get('.email-code__resend').trigger('click')
      await flushPromises()

      expect(repository.resendSignUpCode).not.toHaveBeenCalled()
      expect(wrapper.get('.email-code__notice').text()).toBe(
        'Attends une minute avant de demander un nouveau code.',
      )
    })

    it('renvoie le code après une minute et le dit par un toast', async () => {
      const wrapper = await inscrire()
      await taper(wrapper, '12')
      vi.setSystemTime(new Date(ENVOI.getTime() + 61_000))

      await wrapper.get('.email-code__resend').trigger('click')
      await flushPromises()

      expect(repository.resendSignUpCode).toHaveBeenCalledWith('sophie@exemple.fr')
      expect(toastMessage.value).toBe('Nouveau code envoyé à sophie@exemple.fr.')
      expect((wrapper.get('#email-code-input').element as HTMLInputElement).value).toBe('')
    })

    it('grise « Confirmer » pendant le renvoi du code', async () => {
      let terminer: () => void = () => {}
      repository.resendSignUpCode.mockReturnValue(
        new Promise<void>((resolve) => (terminer = resolve)),
      )
      const wrapper = await inscrire()
      await taper(wrapper, '12345678')
      vi.setSystemTime(new Date(ENVOI.getTime() + 61_000))

      await wrapper.get('.email-code__resend').trigger('click')
      await flushPromises()

      expect(wrapper.get('.sign-in__confirm-code').attributes('disabled')).toBeDefined()
      terminer()
      await flushPromises()
    })

    it('dit d’attendre une minute quand Supabase refuse un envoi trop rapproché', async () => {
      repository.resendSignUpCode.mockRejectedValue(new AccountError('email-rate-limited'))
      const wrapper = await inscrire()
      vi.setSystemTime(new Date(ENVOI.getTime() + 61_000))

      await wrapper.get('.email-code__resend').trigger('click')
      await flushPromises()

      expect(wrapper.get('.email-code__notice').text()).toBe(
        'Attends une minute avant de demander un nouveau code.',
      )
      expect(wrapper.find('.email-code__error').exists()).toBe(false)
    })

    it.each([
      ['« Changer d’adresse »', '.email-code__change'],
      ['la flèche de retour', '.pushed-screen__back'],
    ])(
      '%s ramène à « Créer un compte », adresse remplie et mot de passe vidé',
      async (_, cible) => {
        const back = vi.spyOn(routeur, 'back')
        const wrapper = await inscrire()

        await wrapper.get(cible).trigger('click')
        await flushPromises()

        expect(wrapper.get('h1').text()).toBe('Créer un compte')
        expect((wrapper.get('#sign-in-email').element as HTMLInputElement).value).toBe(
          'sophie@exemple.fr',
        )
        expect((wrapper.get('#sign-in-password').element as HTMLInputElement).value).toBe('')
        expect(back).not.toHaveBeenCalled()
        expect(replace).not.toHaveBeenCalled()
      },
    )

    describe('connexion avec une adresse jamais confirmée', () => {
      beforeEach(() => {
        repository.signIn.mockRejectedValue(new AccountError('email-not-confirmed'))
      })

      async function connecter(): Promise<VueWrapper> {
        const wrapper = await monter('/sign-in?from=settings')
        await saisir(wrapper, 'sophie@exemple.fr', 'motdepasse')
        await envoyer(wrapper)
        return wrapper
      }

      it('renvoie un code et ouvre « Confirme ton e-mail »', async () => {
        repository.verifySignUpCode.mockResolvedValue({ userId: USER_ID })
        const wrapper = await connecter()

        expect(repository.resendSignUpCode).toHaveBeenCalledWith('sophie@exemple.fr')
        expect(wrapper.get('h1').text()).toBe('Confirme ton e-mail')
        expect(wrapper.find('.sign-in__error').exists()).toBe(false)

        await taper(wrapper, '12345678')
        await confirmer(wrapper)

        expect(replace).toHaveBeenCalledWith({ name: 'settings' })
      })

      it('revient à la connexion par la flèche, adresse remplie', async () => {
        const wrapper = await connecter()

        await wrapper.get('.pushed-screen__back').trigger('click')
        await flushPromises()

        expect(wrapper.get('h1').text()).toBe('Connexion')
        expect((wrapper.get('#sign-in-email').element as HTMLInputElement).value).toBe(
          'sophie@exemple.fr',
        )
      })

      it('reste sur la connexion et le dit quand le réseau manque', async () => {
        repository.resendSignUpCode.mockRejectedValue(new AccountError('offline'))
        const wrapper = await connecter()

        expect(wrapper.get('h1').text()).toBe('Connexion')
        expect(wrapper.get('.sign-in__error').text()).toBe(
          'Pas de connexion internet. Vérifie ton réseau et réessaie.',
        )
      })
    })

    it('se lit en anglais aussi', async () => {
      i18n.global.locale.value = 'en'
      try {
        repository.verifySignUpCode.mockRejectedValue(new AccountError('invalid-code'))
        const wrapper = await monter(`${ACHAT}&mode=sign-up`)
        expect(wrapper.get('.sign-in__submit').text()).toBe('Get the code')
        await saisir(wrapper, 'sophie@exemple.fr', 'motdepasse')
        await envoyer(wrapper)

        expect(wrapper.get('h1').text()).toBe('Confirm your email')
        expect(wrapper.get('.email-code__message').text()).toBe(
          'Enter the 8-digit code sent to sophie@exemple.fr.',
        )
        expect(wrapper.get('.email-code__resend').text()).toBe('Resend code')
        expect(wrapper.get('.email-code__change').text()).toBe('Change address')
        expect(wrapper.get('.sign-in__confirm-code').text()).toBe('Confirm')

        await taper(wrapper, '12345670')
        await confirmer(wrapper)
        expect(wrapper.get('.email-code__error').text()).toBe(
          'This code isn’t right. Check it or ask for a new code.',
        )

        vi.setSystemTime(new Date(2026, 9, 23, 9, 0))
        await taper(wrapper, '12345678')
        await confirmer(wrapper)
        expect(wrapper.get('.email-code__error').text()).toBe(
          'This code has expired. Ask for a new code.',
        )

        await wrapper.get('.email-code__resend').trigger('click')
        await flushPromises()
        expect(toastMessage.value).toBe('New code sent to sophie@exemple.fr.')
        vi.setSystemTime(new Date(2026, 9, 23, 9, 0, 10))
        await wrapper.get('.email-code__resend').trigger('click')
        await flushPromises()
        expect(wrapper.get('.email-code__notice').text()).toBe(
          'Wait a minute before asking for a new code.',
        )
      } finally {
        i18n.global.locale.value = 'fr'
      }
    })
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
      document.body.innerHTML = ''
      const wrapper = await monter(ACHAT)
      await basculer(wrapper)
      await saisir(wrapper, 'sophie.martin@example.com', 'motdepasse')
      await envoyer(wrapper)

      wrapper.unmount()
      terminer()
      await flushPromises()

      expect(replace).not.toHaveBeenCalled()
      expect(stockage.keys()).toEqual([])
      expect(document.body.textContent).not.toContain('Confirme ton e-mail')
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
      const wrapper = await monter(ACHAT)

      await basculer(wrapper)

      expect(wrapper.get('.sign-in__google').text()).toBe('Continuer avec Google')
    })

    it('connecte puis ramène au parcours d’origine', async () => {
      googleSignIn.mockResolvedValue({ kind: 'signed-in', session: { userId: USER_ID } })
      const wrapper = await monter('/sign-in?from=settings')

      await wrapper.get('.sign-in__google').trigger('click')
      await flushPromises()

      expect(replace).toHaveBeenCalledWith({ name: 'settings' })
      expect(toastMessage.value).toBe('Connexion avec Google réussie.')
    })

    it('garde le toast de réussite malgré la navigation qui suit', async () => {
      googleSignIn.mockResolvedValue({ kind: 'signed-in', session: { userId: USER_ID } })
      const wrapper = await monter('/sign-in?from=settings')

      await wrapper.get('.sign-in__google').trigger('click')
      await flushPromises()
      wrapper.unmount()

      expect(toastMessage.value).toBe('Connexion avec Google réussie.')
    })

    it('ne dit rien si l’écran est démonté avant la réponse de Google', async () => {
      let terminer = (): void => {}
      googleSignIn.mockReturnValue(
        new Promise((resolve) => {
          terminer = () => resolve({ kind: 'signed-in', session: { userId: USER_ID } })
        }),
      )
      const wrapper = await monter('/sign-in?from=settings')

      await wrapper.get('.sign-in__google').trigger('click')
      wrapper.unmount()
      terminer()
      await flushPromises()

      expect(toastMessage.value).toBeNull()
    })

    it('dit l’annulation par un toast, sans bandeau d’erreur', async () => {
      googleSignIn.mockResolvedValue({ kind: 'cancelled' })
      const wrapper = await monter()

      await wrapper.get('.sign-in__google').trigger('click')
      await flushPromises()

      expect(toastMessage.value).toBe('Connexion annulée.')
      expect(wrapper.find('.sign-in__error').exists()).toBe(false)
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
      expect(toastMessage.value).toBeNull()
    })

    it('annonce la connexion en cours et n’ouvre le sélecteur qu’une fois', async () => {
      let terminer = (): void => {}
      googleSignIn.mockReturnValue(
        new Promise((resolve) => {
          terminer = () => resolve({ kind: 'cancelled' })
        }),
      )
      const wrapper = await monter(ACHAT)
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
