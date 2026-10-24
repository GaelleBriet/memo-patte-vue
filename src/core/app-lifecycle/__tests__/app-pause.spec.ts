import { App } from '@capacitor/app'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'

import { onAppPause } from '../app-pause'

type AddListener = (event: string, callback: () => void) => Promise<PluginListenerHandle>

vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn<AddListener>() },
}))

const addListener = App.addListener as unknown as Mock<AddListener>

function setVisibility(state: DocumentVisibilityState): void {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
  document.dispatchEvent(new Event('visibilitychange'))
}

afterEach(() => {
  vi.restoreAllMocks()
  addListener.mockReset()
})

describe('onAppPause — navigateur', () => {
  it('prévient quand la page passe en arrière-plan, pas quand elle revient', () => {
    const listener = vi.fn<() => void>()
    const stop = onAppPause(listener)

    setVisibility('visible')
    expect(listener).not.toHaveBeenCalled()
    setVisibility('hidden')
    expect(listener).toHaveBeenCalledOnce()

    stop()
    setVisibility('hidden')
    expect(listener).toHaveBeenCalledOnce()
  })
})

describe('onAppPause — natif', () => {
  it('écoute l’événement pause du plugin App et retire l’écoute à l’arrêt', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    const remove = vi.fn<() => Promise<void>>(async () => {})
    let emitPause!: () => void
    addListener.mockImplementation(async (_event, callback) => {
      emitPause = callback
      return { remove }
    })
    const listener = vi.fn<() => void>()

    const stop = onAppPause(listener)
    emitPause()
    setVisibility('hidden')

    expect(addListener).toHaveBeenCalledExactlyOnceWith('pause', expect.any(Function))
    expect(listener).toHaveBeenCalledOnce()
    stop()
    await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce())
  })
})
