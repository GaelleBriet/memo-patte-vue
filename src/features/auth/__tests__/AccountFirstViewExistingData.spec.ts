import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { authRepository, type AuthRepository } from '../repository/auth.repository'
import { signInWithGoogle } from '../service/google-sign-in.service'
import { provideAuthRepository } from '../store/auth.store'
import AccountFirstView from '../views/AccountFirstView.vue'
import { USER_ID } from './auth-fixture'
import { provideExportCopy } from '@/core/export-copy/export-copy-port'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import type { AnimalsRepository } from '@/features/animals/repository/animals.repository'
import { usePurchaseStore } from '@/features/purchase/store/purchase.store'
import { provideAnimalsRepository } from '@/features/animals/store/animals.store'

vi.mock('../repository/auth.repository', () => ({
  authRepository: { onSessionChange: vi.fn<AuthRepository['onSessionChange']>() },
}))
vi.mock('../service/google-sign-in.service', () => ({
  signInWithGoogle: vi.fn<typeof signInWithGoogle>(),
}))

const googleSignIn = vi.mocked(signInWithGoogle)
const list = vi.fn<AnimalsRepository['list']>()
const Vide = { render: () => null }

async function monter(): Promise<VueWrapper> {
  const purchase = usePurchaseStore()
  purchase.offers = [{ plan: 'annual', priceString: '14,99 $' }]
  purchase.rememberCheckout('annual')
  const routeur = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/plus', name: 'plus', component: Vide },
      { path: '/plus/account', name: 'plus-account', component: Vide },
      { path: '/sign-in', name: 'sign-in', component: Vide },
    ],
  })
  await routeur.push('/plus/account')
  const wrapper = mount(AccountFirstView, {
    attachTo: document.body,
    global: { plugins: [vuetify, i18n, routeur], stubs: { transition: false } },
  })
  await flushPromises()
  return wrapper
}

function bouton(texte: string): HTMLButtonElement {
  const trouve = [
    ...document.body.querySelectorAll<HTMLButtonElement>('.confirm-dialog button'),
  ].find((candidat) => candidat.textContent?.trim() === texte)
  if (!trouve) throw new Error(`Bouton « ${texte} » absent du dialogue`)
  return trouve
}

async function toucherGoogle(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('.google-button').trigger('click')
  await flushPromises()
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
  provideExportCopy(() => ({ isPreparing: ref(false), exportCopy: async () => {} }))
  list.mockResolvedValue([{ id: 'milo' } as never])
  googleSignIn.mockResolvedValue({ kind: 'signed-in', session: { userId: USER_ID } })
})

afterEach(() => {
  document.body.innerHTML = ''
  provideExportCopy(null)
  vi.unstubAllGlobals()
})

describe('AccountFirstView : un carnet est déjà sur le téléphone', () => {
  it('prévient avant d’ouvrir Google', async () => {
    const wrapper = await monter()

    await toucherGoogle(wrapper)

    expect(document.body.querySelector('.confirm-dialog')?.textContent).toContain(
      'Ce téléphone a déjà un carnet',
    )
    expect(googleSignIn).not.toHaveBeenCalled()
  })

  it('« Annuler » n’ouvre pas Google', async () => {
    const wrapper = await monter()
    await toucherGoogle(wrapper)

    bouton('Annuler').click()
    await flushPromises()

    expect(googleSignIn).not.toHaveBeenCalled()
  })

  it('« Continuer » ouvre Google', async () => {
    const wrapper = await monter()
    await toucherGoogle(wrapper)

    bouton('Continuer').click()
    await flushPromises()

    expect(googleSignIn).toHaveBeenCalledOnce()
  })
})
