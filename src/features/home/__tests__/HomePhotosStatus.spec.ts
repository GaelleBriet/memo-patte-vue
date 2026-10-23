import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import HomePhotosStatus from '../views/HomePhotosStatus.vue'
import i18n, { applyLocale } from '@/core/i18n'
import type {
  DownloadedPhotoFiles,
  PhotoDownloadPort,
} from '@/core/sync/service/photo-download-port'
import { createPhotoRestore } from '@/core/sync/service/photo-restore'
import { providePhotoRestoreStatus } from '@/core/sync/service/photo-restore-status'
import vuetify from '@/core/theme/vuetify'

const MILO_PHOTO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])

function setup() {
  const waiting: Array<(bytes: Uint8Array | null) => void> = []
  const failure: { cause: unknown } = { cause: null }
  const downloads: PhotoDownloadPort = {
    download: () => {
      if (failure.cause !== null) return Promise.reject(failure.cause)
      return new Promise((resolve) => waiting.push(resolve))
    },
  }
  const files: DownloadedPhotoFiles = { exists: async () => false, write: async () => {} }
  const account = { current: 'user-A' }
  const restore = createPhotoRestore({
    carnetPhotos: async () => [MILO_PHOTO],
    files,
    downloads,
    isAccountCurrent: (userId) => account.current === userId,
  })
  providePhotoRestoreStatus(restore.isRunning)
  const wrapper = mount(HomePhotosStatus, { global: { plugins: [vuetify, i18n] } })
  return { restore, waiting, failure, account, wrapper }
}

afterEach(() => {
  providePhotoRestoreStatus(null)
  applyLocale('fr')
  vi.restoreAllMocks()
})

describe('ligne « photos en cours de téléchargement » de l’accueil', () => {
  it('ne montre rien tant qu’aucune photo ne se télécharge, sans retirer la ligne du flux', () => {
    const { wrapper } = setup()

    expect(wrapper.text()).toBe('')
    expect(wrapper.find('p[role="status"]').exists()).toBe(true)
  })

  it('Milo : le texte s’affiche pendant le téléchargement et disparaît quand la photo est arrivée', async () => {
    const { restore, waiting, wrapper } = setup()

    const pass = restore.restoreMissing('user-A', { visible: true })
    await flushPromises()
    expect(wrapper.text()).toBe('Photos en cours de téléchargement…')

    waiting.shift()?.(JPEG)
    await pass
    await flushPromises()
    expect(wrapper.text()).toBe('')
  })

  it('le texte est en anglais avec la langue anglaise', async () => {
    applyLocale('en')
    const { restore, wrapper } = setup()

    void restore.restoreMissing('user-A', { visible: true })
    await flushPromises()

    expect(wrapper.text()).toBe('Downloading photos…')
  })

  it('le texte disparaît après un échec, sans rien montrer de plus', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { restore, failure, wrapper } = setup()
    failure.cause = new Error('réseau lent')

    await restore.restoreMissing('user-A', { visible: true })
    await flushPromises()

    expect(wrapper.text()).toBe('')
  })

  it('le texte disparaît quand le compte change pendant la passe', async () => {
    const { restore, waiting, account, wrapper } = setup()

    const pass = restore.restoreMissing('user-A', { visible: true })
    await flushPromises()
    account.current = 'user-B'
    waiting.shift()?.(JPEG)
    await pass
    await flushPromises()

    expect(wrapper.text()).toBe('')
  })

  it('ne montre rien quand la synchro n’est pas branchée', async () => {
    providePhotoRestoreStatus(null)
    const wrapper = mount(HomePhotosStatus, { global: { plugins: [vuetify, i18n] } })

    expect(wrapper.text()).toBe('')
  })
})
