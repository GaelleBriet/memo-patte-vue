import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import AccountRestoreView from '../views/AccountRestoreView.vue'
import { memoryStorage, USER_ID } from '@/features/auth/__tests__/auth-fixture'
import { writePlusAccount } from '@/features/auth/logic/plus-account-storage'
import { authRepository } from '@/features/auth/repository/auth.repository'
import { provideAuthRepository } from '@/features/auth/store/auth.store'
import { provideExportCopy } from '@/core/export-copy/export-copy-port'
import i18n from '@/core/i18n'
import {
  createRestoreFlow,
  provideRestoreFlow,
  type RestoreFlow,
  type RestoreRunner,
} from '@/core/sync/service/restore-flow'
import vuetify from '@/core/theme/vuetify'
import router from '@/router'
import { plain } from '@/shared/__tests__/plain'

const showToast = vi.hoisted(() => vi.fn<(message: string) => void>())

vi.mock('@/shared/utils/toast', () => ({ showToast }))
vi.mock('@/shared/utils/auth-available', () => ({ authAvailable: () => true }))
vi.mock('@/core/app-lifecycle/app-resume', () => ({
  useAppResume: () => {},
  onAppResume: () => () => {},
}))

provideAuthRepository(() => authRepository)

const runner: RestoreRunner = {
  pendingMode: async () => null,
  start: async () => {},
  run: async () => 'restored',
  progress: { done: 0, total: 0 },
  onProgress: () => () => {},
}

let flow: RestoreFlow
let signOut: ReturnType<typeof vi.fn<() => Promise<void>>>
let wrapper: VueWrapper | null = null

beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubGlobal('visualViewport', {
    addEventListener() {},
    removeEventListener() {},
    width: 411,
    height: 815,
    offsetTop: 0,
  })
  vi.stubGlobal('localStorage', memoryStorage())
  writePlusAccount({ userId: USER_ID })
  setActivePinia(createPinia())
  signOut = vi.fn<() => Promise<void>>(async () => {})
  flow = createRestoreFlow(runner, () => false, signOut)
  provideRestoreFlow(flow)
  provideExportCopy(() => ({ isPreparing: ref(false), exportCopy: async () => {} }))
  await router.push({ name: 'account-restore', query: { from: 'settings-plus' } })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  provideRestoreFlow(null)
  provideExportCopy(null)
  document.body.innerHTML = ''
  i18n.global.locale.value = 'fr'
  showToast.mockReset()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function monter() {
  wrapper = mount(AccountRestoreView, {
    global: { plugins: [vuetify, i18n, router], stubs: { transition: false } },
    attachTo: document.body,
  })
  await flushPromises()
}

function dialogue(): string {
  const parts = document.querySelectorAll(
    '.confirm-dialog h2, .confirm-dialog p, .confirm-dialog button',
  )
  return plain([...parts].map((part) => part.textContent?.trim()).join(' '))
}

function bouton(libelle: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (element) => element.textContent?.trim() === libelle,
  )
}

describe('Envoyer le carnet du téléphone dans un compte sans sauvegarde', () => {
  it('un animal : le titre, le nom de l’animal et les deux boutons', async () => {
    flow.askSend({ animalCount: 1, firstName: 'Milo' })
    await monter()

    expect(dialogue()).toBe(
      plain(
        'Envoyer le carnet de ce téléphone dans ton compte ? Le carnet de Milo sera sauvegardé dans le cloud de ce compte. Annuler Envoyer',
      ),
    )
  })

  it('plusieurs animaux : le nombre d’animaux', async () => {
    flow.askSend({ animalCount: 2, firstName: 'Milo' })
    await monter()

    expect(dialogue()).toContain(
      'Les carnets de tes 2 animaux seront sauvegardés dans le cloud de ce compte.',
    )
  })

  it('en anglais, un animal puis plusieurs', async () => {
    i18n.global.locale.value = 'en'
    flow.askSend({ animalCount: 1, firstName: 'Milo' })
    await monter()

    expect(dialogue()).toBe(
      'Send this phone’s health record to your account? Milo’s health record will be backed up in this account’s cloud. Cancel Send',
    )
    wrapper?.unmount()
    flow.reset()
    flow.askSend({ animalCount: 3, firstName: 'Milo' })
    await monter()
    expect(dialogue()).toContain(
      'Your 3 animals’ health records will be backed up in this account’s cloud.',
    )
  })

  it('ne dit rien et n’envoie rien tant que la question n’est pas posée', async () => {
    await monter()

    expect(document.querySelector('.confirm-dialog')).toBeNull()
  })

  it('« Envoyer » demande l’envoi, une seule fois même touché deux fois', async () => {
    const confirmed = vi.fn<() => void>()
    flow.onSendConfirmed(confirmed)
    flow.askSend({ animalCount: 1, firstName: 'Milo' })
    await monter()
    const envoyer = bouton('Envoyer')

    envoyer?.click()
    envoyer?.click()
    await flushPromises()

    expect(confirmed).toHaveBeenCalledOnce()
    expect(signOut).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
  })

  it('« Annuler » déconnecte, prévient et ne touche à rien d’autre, même touché deux fois', async () => {
    const confirmed = vi.fn<() => void>()
    flow.onSendConfirmed(confirmed)
    flow.askSend({ animalCount: 1, firstName: 'Milo' })
    await monter()
    const annuler = bouton('Annuler')

    annuler?.click()
    annuler?.click()
    await flushPromises()

    expect(signOut).toHaveBeenCalledOnce()
    expect(showToast).toHaveBeenCalledExactlyOnceWith('Connexion annulée.')
    expect(confirmed).not.toHaveBeenCalled()
    expect(flow.state.value).toEqual({ step: 'idle' })
  })

  it('fermer la question autrement qu’avec un bouton compte comme « Annuler »', async () => {
    flow.askSend({ animalCount: 1, firstName: 'Milo' })
    await monter()

    wrapper?.findComponent({ name: 'ConfirmDialog' }).vm.$emit('update:modelValue', false)
    await flushPromises()

    expect(signOut).toHaveBeenCalledOnce()
    expect(flow.state.value).toEqual({ step: 'idle' })
  })
})
