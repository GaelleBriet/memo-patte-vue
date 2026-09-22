import { Network } from '@capacitor/network'
import type { PluginListenerHandle } from '@capacitor/core'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { onNetworkOnline } from '../service/network-status'

type StatusListener = (status: { connected: boolean; connectionType: string }) => void
type AddListener = (event: string, listener: StatusListener) => Promise<PluginListenerHandle>

vi.mock('@capacitor/network', () => ({
  Network: { addListener: vi.fn<AddListener>() },
}))

const addListener = Network.addListener as unknown as Mock<AddListener>

afterEach(() => {
  vi.restoreAllMocks()
  addListener.mockReset()
})

describe('onNetworkOnline', () => {
  it('prévient au retour du réseau, pas à la perte', async () => {
    let emit!: StatusListener
    const remove = vi.fn<() => Promise<void>>(async () => {})
    addListener.mockImplementation(async (_event, listener) => {
      emit = listener
      return { remove }
    })
    const listener = vi.fn<() => void>()

    onNetworkOnline(listener)
    await Promise.resolve()
    emit({ connected: false, connectionType: 'none' })
    expect(listener).not.toHaveBeenCalled()

    emit({ connected: true, connectionType: 'wifi' })
    expect(listener).toHaveBeenCalledOnce()
  })

  it('écoute networkStatusChange et retire l’écoute à l’arrêt', async () => {
    const remove = vi.fn<() => Promise<void>>(async () => {})
    addListener.mockResolvedValue({ remove })

    const stop = onNetworkOnline(vi.fn<() => void>())
    await Promise.resolve()
    stop()

    expect(addListener).toHaveBeenCalledExactlyOnceWith('networkStatusChange', expect.any(Function))
    await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce())
  })
})
