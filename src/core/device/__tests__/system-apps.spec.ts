import { afterEach, describe, expect, it, vi } from 'vitest'

import { androidVersion, openInExternalApp } from '../system-apps'

const plugins = vi.hoisted(() => ({
  getInfo: vi.fn<() => Promise<{ platform: string; osVersion: string }>>(),
  openUrl: vi.fn<(options: { url: string }) => Promise<{ completed: boolean }>>(),
}))

vi.mock('@capacitor/device', () => ({ Device: { getInfo: plugins.getInfo } }))
vi.mock('@capacitor/app-launcher', () => ({ AppLauncher: { openUrl: plugins.openUrl } }))

afterEach(() => {
  vi.resetAllMocks()
})

describe('androidVersion', () => {
  it('donne la version d’Android', async () => {
    plugins.getInfo.mockResolvedValue({ platform: 'android', osVersion: '16' })

    expect(await androidVersion()).toBe('16')
  })

  it('ne donne rien hors d’Android', async () => {
    plugins.getInfo.mockResolvedValue({ platform: 'web', osVersion: '10.0' })

    expect(await androidVersion()).toBeNull()
  })

  it('ne donne rien quand l’appareil ne répond pas', async () => {
    plugins.getInfo.mockRejectedValue(new Error('indisponible'))

    expect(await androidVersion()).toBeNull()
  })
})

describe('openInExternalApp', () => {
  it('confirme qu’une app a ouvert le lien', async () => {
    plugins.openUrl.mockResolvedValue({ completed: true })

    expect(await openInExternalApp('mailto:a@b.fr')).toBe(true)
    expect(plugins.openUrl).toHaveBeenCalledWith({ url: 'mailto:a@b.fr' })
  })

  it('signale qu’aucune app ne sait ouvrir le lien', async () => {
    plugins.openUrl.mockResolvedValue({ completed: false })

    expect(await openInExternalApp('mailto:a@b.fr')).toBe(false)
  })

  it('signale un échec du plugin comme une absence d’app', async () => {
    plugins.openUrl.mockRejectedValue(new Error('plugin absent'))

    expect(await openInExternalApp('mailto:a@b.fr')).toBe(false)
  })
})
