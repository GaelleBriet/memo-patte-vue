import { Network } from '@capacitor/network'
import type { PluginListenerHandle } from '@capacitor/core'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { isNetworkConnected, onNetworkOnline } from '../service/network-status'

type StatusListener = (status: { connected: boolean; connectionType: string }) => void
type AddListener = (event: string, listener: StatusListener) => Promise<PluginListenerHandle>
type GetStatus = () => Promise<{ connected: boolean; connectionType: string }>

vi.mock('@capacitor/network', () => ({
  Network: { addListener: vi.fn<AddListener>(), getStatus: vi.fn<GetStatus>() },
}))

const addListener = Network.addListener as unknown as Mock<AddListener>
const getStatus = Network.getStatus as unknown as Mock<GetStatus>

beforeEach(() => {
  getStatus.mockReturnValue(new Promise(() => {}))
})

afterEach(() => {
  vi.restoreAllMocks()
  addListener.mockReset()
  getStatus.mockReset()
})

function captureEmit(): () => StatusListener {
  let emit: StatusListener | undefined
  addListener.mockImplementation(async (_event, listener) => {
    emit = listener
    return { remove: async () => {} }
  })
  return () => emit!
}

const ONLINE = { connected: true, connectionType: 'wifi' }
const OFFLINE = { connected: false, connectionType: 'none' }

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

  it('prévient au premier « en ligne » quand l’état de départ n’est pas encore connu', async () => {
    const emit = captureEmit()
    const listener = vi.fn<() => void>()

    onNetworkOnline(listener)
    await Promise.resolve()
    emit()(ONLINE)

    expect(listener).toHaveBeenCalledOnce()
  })

  it('prévient au premier « en ligne » quand l’état de départ n’a pas pu être lu', async () => {
    getStatus.mockRejectedValue(new Error('plugin indisponible'))
    const emit = captureEmit()
    const listener = vi.fn<() => void>()

    onNetworkOnline(listener)
    await vi.waitFor(() => expect(getStatus).toHaveBeenCalledOnce())
    await Promise.resolve()
    emit()(ONLINE)
    emit()(ONLINE)

    expect(listener).toHaveBeenCalledOnce()
  })

  it('ne prévient pas quand l’app démarre en ligne et que le plugin répète « en ligne »', async () => {
    getStatus.mockResolvedValue(ONLINE)
    const emit = captureEmit()
    const listener = vi.fn<() => void>()

    onNetworkOnline(listener)
    await vi.waitFor(() => expect(getStatus).toHaveBeenCalledOnce())
    await Promise.resolve()
    emit()(ONLINE)
    emit()({ connected: true, connectionType: 'cellular' })

    expect(listener).not.toHaveBeenCalled()

    emit()(OFFLINE)
    emit()(ONLINE)
    expect(listener).toHaveBeenCalledOnce()
  })

  it('prévient au retour du réseau quand l’app démarre hors ligne', async () => {
    getStatus.mockResolvedValue(OFFLINE)
    const emit = captureEmit()
    const listener = vi.fn<() => void>()

    onNetworkOnline(listener)
    await vi.waitFor(() => expect(getStatus).toHaveBeenCalledOnce())
    await Promise.resolve()
    emit()(ONLINE)
    emit()(ONLINE)

    expect(listener).toHaveBeenCalledOnce()
  })

  it('garde l’état vu par un événement quand la lecture de départ répond après lui', async () => {
    let answer!: (status: { connected: boolean; connectionType: string }) => void
    getStatus.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const emit = captureEmit()
    const listener = vi.fn<() => void>()

    onNetworkOnline(listener)
    await Promise.resolve()
    emit()(OFFLINE)
    answer(ONLINE)
    await Promise.resolve()
    await Promise.resolve()
    emit()(ONLINE)

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

describe('isNetworkConnected', () => {
  it('lit l’état du réseau donné par le plugin natif', async () => {
    getStatus.mockResolvedValueOnce({ connected: false, connectionType: 'none' })
    await expect(isNetworkConnected()).resolves.toBe(false)

    getStatus.mockResolvedValueOnce({ connected: true, connectionType: 'wifi' })
    await expect(isNetworkConnected()).resolves.toBe(true)
  })
})
