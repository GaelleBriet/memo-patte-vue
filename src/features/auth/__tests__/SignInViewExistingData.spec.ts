import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { authRepository, type AuthRepository } from '../repository/auth.repository'
import { signInWithGoogle } from '../service/google-sign-in.service'
import { provideAuthRepository } from '../store/auth.store'
import SignInView from '../views/SignInView.vue'
import { USER_ID } from './auth-fixture'
import { provideExportCopy } from '@/core/export-copy/export-copy-port'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import type { AnimalsRepository } from '@/features/animals/repository/animals.repository'
import { provideAnimalsRepository } from '@/features/animals/store/animals.store'

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
    onSessionUnreadable: vi.fn<AuthRepository['onSessionUnreadable']>(),
  },
}))
vi.mock('../service/google-sign-in.service', () => ({
  signInWithGoogle: vi.fn<typeof signInWithGoogle>(),
}))

const repository = vi.mocked(authRepository)
const googleSignIn = vi.mocked(signInWithGoogle)
const list = vi.fn<AnimalsRepository['list']>()
const exportCopy = vi.fn<() => Promise<void>>(async () => {})
const Vide = { render: () => null }

async function monter(adresse = '/sign-in?from=plus-account'): Promise<VueWrapper> {
  const routeur = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/sign-in', name: 'sign-in', component: Vide },
      { path: '/plus', name: 'plus', component: Vide },
      { path: '/plus/account', name: 'plus-account', component: Vide },
      { path: '/sign-in/password-reset', name: 'password-reset', component: Vide },
    ],
  })
  await routeur.replace(adresse)
  const wrapper = mount(SignInView, {
    attachTo: document.body,
    global: { plugins: [vuetify, i18n, routeur], stubs: { transition: false } },
  })
  await flushPromises()
  return wrapper
}

function dialogue(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('.confirm-dialog__panel')
}

function boutonDuDialogue(texte: string): HTMLButtonElement {
  const bouton = [
    ...document.body.querySelectorAll<HTMLButtonElement>('.confirm-dialog button'),
  ].find((candidat) => candidat.textContent?.trim() === texte)
  if (!bouton) throw new Error(`Bouton « ${texte} » absent du dialogue`)
  return bouton
}

async function toucher(bouton: HTMLElement): Promise<void> {
  bouton.click()
  await flushPromises()
}

async function envoyerEmail(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('#sign-in-email').setValue('sophie.martin@example.com')
  await wrapper.get('#sign-in-password').setValue('motdepasse')
  const confirmation = wrapper.find('#sign-in-confirmation')
  if (confirmation.exists()) await confirmation.setValue('motdepasse')
  await wrapper.get('.sign-in__form').trigger('submit')
  await flushPromises()
}

async function basculerEnCreation(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('.sign-in__toggle-action').trigger('click')
}

beforeEach(() => {
  vi.stubGlobal('visualViewport', {
    addEventListener() {},
    removeEventListener() {},
    width: 412,
    height: 915,
    offsetTop: 0,
  })
  localStorage.clear()
  vi.clearAllMocks()
  setActivePinia(createPinia())
  provideAuthRepository(() => authRepository)
  provideAnimalsRepository(() => ({ list }) as unknown as AnimalsRepository)
  provideExportCopy(() => ({ isPreparing: ref(false), exportCopy }))
  list.mockResolvedValue([{ id: 'milo' } as never])
  repository.signIn.mockResolvedValue({ userId: USER_ID })
  repository.signUp.mockResolvedValue({ kind: 'signed-in', session: { userId: USER_ID } })
  googleSignIn.mockResolvedValue({ kind: 'signed-in', session: { userId: USER_ID } })
})

afterEach(() => {
  document.body.innerHTML = ''
  provideExportCopy(null)
  vi.unstubAllGlobals()
})

describe('SignInView : un carnet est déjà sur le téléphone', () => {
  it('prévient avant la connexion par e-mail, sans rien envoyer', async () => {
    const wrapper = await monter()

    await envoyerEmail(wrapper)

    expect(dialogue()?.textContent).toContain('Ce téléphone a déjà un carnet')
    expect(dialogue()?.textContent).toContain('Ne te connecte que sur ton propre téléphone.')
    expect(repository.signIn).not.toHaveBeenCalled()
  })

  it('« Continuer » poursuit la connexion par e-mail', async () => {
    const wrapper = await monter()
    await envoyerEmail(wrapper)

    await toucher(boutonDuDialogue('Continuer'))

    expect(repository.signIn).toHaveBeenCalledWith('sophie.martin@example.com', 'motdepasse')
  })

  it('« Annuler » ne connecte pas', async () => {
    const wrapper = await monter()
    await envoyerEmail(wrapper)

    await toucher(boutonDuDialogue('Annuler'))

    expect(repository.signIn).not.toHaveBeenCalled()
    expect(wrapper.find('.sign-in__form').exists()).toBe(true)
  })

  it('« Exporter une copie » exporte puis laisse le dialogue ouvert, sans connecter', async () => {
    const wrapper = await monter()
    await envoyerEmail(wrapper)

    await toucher(boutonDuDialogue('Exporter une copie'))

    expect(exportCopy).toHaveBeenCalledOnce()
    expect(dialogue()).not.toBeNull()
    expect(repository.signIn).not.toHaveBeenCalled()
  })

  it('prévient aussi avant la création d’un compte', async () => {
    const wrapper = await monter()
    await basculerEnCreation(wrapper)
    await envoyerEmail(wrapper)

    expect(dialogue()).not.toBeNull()
    expect(repository.signUp).not.toHaveBeenCalled()

    await toucher(boutonDuDialogue('Continuer'))
    expect(repository.signUp).toHaveBeenCalled()
  })

  it('prévient avant Google, et « Continuer » ouvre Google', async () => {
    const wrapper = await monter()

    await wrapper.get('.sign-in__google').trigger('click')
    await flushPromises()
    expect(dialogue()).not.toBeNull()
    expect(googleSignIn).not.toHaveBeenCalled()

    await toucher(boutonDuDialogue('Continuer'))
    expect(googleSignIn).toHaveBeenCalledOnce()
  })

  it('« Annuler » avant Google ne l’ouvre pas', async () => {
    const wrapper = await monter()
    await wrapper.get('.sign-in__google').trigger('click')
    await flushPromises()

    await toucher(boutonDuDialogue('Annuler'))

    expect(googleSignIn).not.toHaveBeenCalled()
  })

  it('ne prévient pas sur un téléphone sans animal', async () => {
    list.mockResolvedValue([])
    const wrapper = await monter()

    await envoyerEmail(wrapper)

    expect(dialogue()).toBeNull()
    expect(repository.signIn).toHaveBeenCalled()
  })
})
