import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'

import { photoDisplayUrl } from '../photo-storage'
import { forgetPhotoUrls, usePhotoUrls } from '../use-photo-urls'

vi.mock('../photo-storage', () => ({
  photoDisplayUrl: vi.fn<(name: string) => Promise<string>>(async (name) => `url:${name}`),
}))

const resolve = vi.mocked(photoDisplayUrl)

beforeEach(() => {
  vi.clearAllMocks()
  forgetPhotoUrls()
})

function monter(paths: () => (string | null)[]) {
  const scope = effectScope()
  const photoUrl = scope.run(() => usePhotoUrls(paths))!
  return { photoUrl, scope }
}

describe('usePhotoUrls', () => {
  it('rend null tant que l’URL n’est pas résolue, puis l’URL', async () => {
    const { photoUrl } = monter(() => ['milo.jpg'])

    expect(photoUrl('milo.jpg')).toBeNull()
    await flushPromises()

    expect(photoUrl('milo.jpg')).toBe('url:milo.jpg')
  })

  it('rend null pour un animal sans photo, sans rien résoudre', async () => {
    const { photoUrl } = monter(() => [null])
    await flushPromises()

    expect(photoUrl(null)).toBeNull()
    expect(resolve).not.toHaveBeenCalled()
  })

  it('résout une nouvelle photo apparue dans la liste', async () => {
    const paths = ref<(string | null)[]>(['milo.jpg'])
    const { photoUrl } = monter(() => paths.value)
    await flushPromises()

    paths.value = ['milo.jpg', 'luna.jpg']
    await flushPromises()

    expect(photoUrl('luna.jpg')).toBe('url:luna.jpg')
    expect(resolve).toHaveBeenCalledTimes(2)
  })

  it('ne résout qu’une fois la même photo, d’un écran à l’autre', async () => {
    monter(() => ['milo.jpg'])
    await flushPromises()
    const { photoUrl } = monter(() => ['milo.jpg'])
    await flushPromises()

    expect(photoUrl('milo.jpg')).toBe('url:milo.jpg')
    expect(resolve).toHaveBeenCalledOnce()
  })

  it('reste sur le dégradé si le fichier est illisible', async () => {
    resolve.mockRejectedValueOnce(new Error('fichier absent'))
    const { photoUrl } = monter(() => ['perdue.jpg'])
    await flushPromises()

    expect(photoUrl('perdue.jpg')).toBeNull()
  })
})
