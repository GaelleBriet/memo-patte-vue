import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { authRepository, type AuthRepository } from '../repository/auth.repository'
import { provideAuthRepository } from '../store/auth.store'
import PasswordResetView from '../views/PasswordResetView.vue'
import { provideExportCopy } from '@/core/export-copy/export-copy-port'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import type { AnimalsRepository } from '@/features/animals/repository/animals.repository'
import { provideAnimalsRepository } from '@/features/animals/store/animals.store'

vi.mock('../repository/auth.repository', () => ({
  authRepository: {
    sendPasswordResetCode: vi.fn<AuthRepository['sendPasswordResetCode']>(async () => {}),
    onSessionChange: vi.fn<AuthRepository['onSessionChange']>(),
  },
}))

const repository = vi.mocked(authRepository)
const list = vi.fn<AnimalsRepository['list']>()
const Vide = { render: () => null }

async function monter() {
  const routeur = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/sign-in', name: 'sign-in', component: Vide },
      { path: '/sign-in/password-reset', name: 'password-reset', component: Vide },
    ],
  })
  await routeur.replace({ name: 'password-reset', state: { email: 'sophie@exemple.fr' } })
  const wrapper = mount(PasswordResetView, {
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
})

afterEach(() => {
  document.body.innerHTML = ''
  provideExportCopy(null)
  vi.unstubAllGlobals()
})

describe('PasswordResetView : un carnet est déjà sur le téléphone', () => {
  it('prévient avant d’envoyer le code, et « Annuler » ne l’envoie pas', async () => {
    const wrapper = await monter()

    await wrapper.get('.password-reset__send').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('.confirm-dialog')?.textContent).toContain(
      'Ce téléphone a déjà un carnet',
    )
    expect(repository.sendPasswordResetCode).not.toHaveBeenCalled()

    bouton('Annuler').click()
    await flushPromises()
    expect(repository.sendPasswordResetCode).not.toHaveBeenCalled()
  })

  it('« Continuer » envoie le code', async () => {
    const wrapper = await monter()
    await wrapper.get('.password-reset__send').trigger('click')
    await flushPromises()

    bouton('Continuer').click()
    await flushPromises()

    expect(repository.sendPasswordResetCode).toHaveBeenCalledWith('sophie@exemple.fr')
  })
})
