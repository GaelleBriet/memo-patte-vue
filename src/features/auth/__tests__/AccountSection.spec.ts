import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AccountSection from '../AccountSection.vue'
import { authRepository, type AuthRepository } from '../auth.repository'
import { writePlusAccount } from '../plus-account-storage'
import { memoryStorage, USER_ID } from './auth-fixture'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import router from '@/router'

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

vi.mock('@/shared/auth-available', () => ({ authAvailable: () => true }))

let wrapper: VueWrapper | null = null

beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('visualViewport', {
    addEventListener() {},
    removeEventListener() {},
    width: 412,
    height: 915,
    offsetTop: 0,
  })
  setActivePinia(createPinia())
  await router.push({ name: 'settings' })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

async function monter() {
  wrapper = mount(AccountSection, {
    global: { plugins: [vuetify, i18n, router] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function dialogue(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(
    '.sign-out-confirm-overlay.v-overlay--active .sign-out-confirm',
  )
}

function boutonDuDialogue(classe: string): HTMLButtonElement | null {
  return dialogue()?.querySelector<HTMLButtonElement>(classe) ?? null
}

async function cliquer(element: HTMLElement | null) {
  element!.click()
  await flushPromises()
}

describe('AccountSection — sans compte Plus', () => {
  it('ne rend rien', async () => {
    const wrapper = await monter()

    expect(wrapper.find('.section-card').exists()).toBe(false)
  })
})

describe('AccountSection — avec un compte Plus', () => {
  beforeEach(() => {
    writePlusAccount({ userId: USER_ID })
  })

  it('affiche la section Compte avec la déconnexion', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.section-card__title').text()).toBe('Compte')
    expect(wrapper.get('.settings-row--sign-out').text()).toBe('Se déconnecter')
  })

  it('ouvre une confirmation avant de se déconnecter', async () => {
    const wrapper = await monter()

    await wrapper.get('.settings-row--sign-out').trigger('click')

    expect(dialogue()?.textContent).toContain('Se déconnecter ?')
    expect(repository.signOut).not.toHaveBeenCalled()
  })

  it('annule sans se déconnecter', async () => {
    const wrapper = await monter()

    await wrapper.get('.settings-row--sign-out').trigger('click')
    await cliquer(boutonDuDialogue('.sign-out-confirm__cancel'))

    expect(repository.signOut).not.toHaveBeenCalled()
    expect(dialogue()).toBeNull()
  })

  it('confirme la déconnexion et retourne à la connexion', async () => {
    const wrapper = await monter()

    await wrapper.get('.settings-row--sign-out').trigger('click')
    await cliquer(boutonDuDialogue('.sign-out-confirm__submit'))
    await vi.waitFor(() => expect(repository.signOut).toHaveBeenCalledOnce())
    await vi.waitFor(() =>
      expect(router.currentRoute.value.fullPath).toBe('/sign-in?from=settings'),
    )

    expect(wrapper.find('.section-card').exists()).toBe(false)
  })
})
