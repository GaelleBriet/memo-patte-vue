import { App, type BackButtonListenerEvent } from '@capacitor/app'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import { installBackButton, onBackButton } from '../back-button'

type AddBackListener = (
  event: string,
  callback: (event: BackButtonListenerEvent) => void,
) => Promise<PluginListenerHandle>

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn<AddBackListener>(),
    minimizeApp: vi.fn<() => Promise<void>>(async () => {}),
  },
}))

const addListener = App.addListener as unknown as Mock<AddBackListener>
const minimizeApp = App.minimizeApp as unknown as Mock<() => Promise<void>>
const remove = vi.fn<() => Promise<void>>(async () => {})
let emitBack: ((event: BackButtonListenerEvent) => void) | null = null
const cleanups: Array<() => void> = []

function track(stop: () => void): () => void {
  cleanups.push(stop)
  return stop
}

beforeEach(() => {
  addListener.mockReset()
  addListener.mockImplementation(async (_event, callback) => {
    emitBack = callback
    return { remove }
  })
  minimizeApp.mockClear()
  remove.mockClear()
  emitBack = null
})

afterEach(() => {
  for (const stop of cleanups.splice(0)) stop()
  vi.restoreAllMocks()
})

describe('installBackButton — navigateur', () => {
  it('n’écoute pas le plugin natif', () => {
    track(installBackButton())

    expect(addListener).not.toHaveBeenCalled()
  })
})

describe('installBackButton — natif', () => {
  beforeEach(() => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
  })

  function pressBack(canGoBack: boolean): void {
    if (!emitBack) throw new Error('écouteur backButton absent')
    emitBack({ canGoBack })
  }

  it('écoute backButton une seule fois, même installé deux fois', () => {
    track(installBackButton())
    track(installBackButton())

    expect(addListener).toHaveBeenCalledExactlyOnceWith('backButton', expect.any(Function))
  })

  it('revient à l’écran précédent quand rien n’est à fermer', () => {
    track(installBackButton())
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})

    pressBack(true)

    expect(back).toHaveBeenCalledOnce()
    expect(minimizeApp).not.toHaveBeenCalled()
  })

  it('met l’app en arrière-plan sans historique', () => {
    track(installBackButton())
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})

    pressBack(false)

    expect(minimizeApp).toHaveBeenCalledOnce()
    expect(back).not.toHaveBeenCalled()
  })

  it('confie le retour au dernier gestionnaire inscrit, sans naviguer', () => {
    track(installBackButton())
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const first = vi.fn<() => void>()
    const second = vi.fn<() => void>()
    track(onBackButton(first))
    track(onBackButton(second))

    pressBack(true)

    expect(second).toHaveBeenCalledOnce()
    expect(first).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
    expect(minimizeApp).not.toHaveBeenCalled()
  })

  it('rend la main au gestionnaire précédent puis au comportement par défaut après désinscription', () => {
    track(installBackButton())
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const first = vi.fn<() => void>()
    const stopFirst = track(onBackButton(first))
    const stopSecond = track(onBackButton(vi.fn<() => void>()))

    stopSecond()
    pressBack(true)
    expect(first).toHaveBeenCalledOnce()

    stopFirst()
    pressBack(true)
    expect(first).toHaveBeenCalledOnce()
    expect(back).toHaveBeenCalledOnce()
  })

  it('ne retire que le gestionnaire désinscrit, même inscrit deux fois', () => {
    track(installBackButton())
    const handler = vi.fn<() => void>()
    const other = vi.fn<() => void>()
    track(onBackButton(handler))
    track(onBackButton(other))
    const stopAgain = track(onBackButton(handler))

    stopAgain()
    stopAgain()
    pressBack(true)

    expect(other).toHaveBeenCalledOnce()
    expect(handler).not.toHaveBeenCalled()
  })

  it('retire l’écoute du plugin à la désinstallation', async () => {
    const stop = installBackButton()

    stop()

    await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce())
  })

  it('ne laisse pas de rejet non géré si le plugin refuse l’écoute', async () => {
    addListener.mockRejectedValueOnce(new Error('plugin absent'))
    const unhandled = vi.fn<(reason: unknown) => void>()
    process.on('unhandledRejection', unhandled)

    installBackButton()()
    await new Promise((resolve) => setTimeout(resolve, 0))

    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })
})
