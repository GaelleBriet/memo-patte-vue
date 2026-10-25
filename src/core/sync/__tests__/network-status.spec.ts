import { Network } from '@capacitor/network'
import type { PluginListenerHandle } from '@capacitor/core'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { isNetworkConnected, onNetworkOnline } from '../service/network-status'

type StatusListener = (status: { connected: boolean; connectionType: string }) => void
type AddListener = (event: string, listener: StatusListener) => Promise<PluginListenerHandle>
type GetStatus = () => Promise<{ connected: boolean; connectionType: string }>

vi.mock('@capacitor/network', () => ({
  Network: { addListener: vi.fn<AddListener>(), getStatus: vi.fn<GetStatus>() },
}))

const addListener = Network.addListener as unknown as Mock<AddListener>
const getStatus = Network.getStatus as unknown as Mock<GetStatus>

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

  it('ne prévient qu’une fois tant que le réseau reste là, puis à chaque vrai retour', async () => {
    let emit!: StatusListener
    addListener.mockImplementation(async (_event, listener) => {
      emit = listener
      return { remove: async () => {} }
    })
    const listener = vi.fn<() => void>()

    onNetworkOnline(listener)
    await Promise.resolve()
    emit({ connected: true, connectionType: 'cellular' })
    emit({ connected: true, connectionType: 'cellular' })
    emit({ connected: true, connectionType: 'wifi' })
    expect(listener).toHaveBeenCalledOnce()

    emit({ connected: false, connectionType: 'none' })
    emit({ connected: true, connectionType: 'wifi' })
    expect(listener).toHaveBeenCalledTimes(2)
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

describe('isNetworkConnected', () => {
  it('lit l’état du réseau donné par le plugin natif', async () => {
    getStatus.mockResolvedValueOnce({ connected: false, connectionType: 'none' })
    await expect(isNetworkConnected()).resolves.toBe(false)

    getStatus.mockResolvedValueOnce({ connected: true, connectionType: 'wifi' })
    await expect(isNetworkConnected()).resolves.toBe(true)
  })
})
