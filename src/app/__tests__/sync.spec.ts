import type { PluginListenerHandle } from '@capacitor/core'
import { Network } from '@capacitor/network'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { nextTick, ref } from 'vue'
import { simulateWebResume } from '@/core/app-lifecycle/__tests__/simulate-resume'
import { SYNC_DEBOUNCE_MS } from '@/core/sync/service/sync-scheduler'
import type { SyncCycleOutbox } from '@/core/sync/service/sync-cycle'
import { installSync, type SyncDependencies } from '../sync'

type NetworkListener = (status: { connected: boolean; connectionType: string }) => void
type AddNetworkListener = (
  event: string,
  listener: NetworkListener,
) => Promise<PluginListenerHandle>

vi.mock('@capacitor/network', () => ({
  Network: { addListener: vi.fn<AddNetworkListener>() },
}))

const addNetworkListener = Network.addListener as unknown as Mock<AddNetworkListener>

function fakeOutbox(pending: number): SyncCycleOutbox {
  return {
    listPending: vi.fn<SyncCycleOutbox['listPending']>(async () =>
      Array.from({ length: pending }, (_, index) => ({
        entity: 'animal',
        entityId: `a${index}`,
        queuedAt: '2026-01-01T00:00:00.000Z',
        attempts: 0,
      })),
    ),
    removeIfUnchanged: vi.fn<SyncCycleOutbox['removeIfUnchanged']>(async () => {}),
    getLastPulledAt: vi.fn<SyncCycleOutbox['getLastPulledAt']>(async () => null),
    setLastPulledAt: vi.fn<SyncCycleOutbox['setLastPulledAt']>(async () => {}),
    isEnabled: vi.fn<SyncCycleOutbox['isEnabled']>(async () => true),
  }
}

async function runDebounce(): Promise<void> {
  await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS)
}

beforeEach(() => {
  vi.useFakeTimers()
  addNetworkListener.mockImplementation(async () => ({
    remove: vi.fn<() => Promise<void>>(async () => {}),
  }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('installSync', () => {
  it('déclenche un cycle au lancement même sans entrée en attente', async () => {
    const runCycle = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const deps: SyncDependencies = { outbox: fakeOutbox(0), runCycle, userId: () => 'user-1' }

    await installSync(deps)
    await runDebounce()

    expect(runCycle).toHaveBeenCalledOnce()
  })

  it('déclenche aussi un cycle au lancement quand la file contient des entrées (resumePendingSync)', async () => {
    const runCycle = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const deps: SyncDependencies = { outbox: fakeOutbox(3), runCycle, userId: () => 'user-1' }

    await installSync(deps)
    await runDebounce()

    expect(runCycle).toHaveBeenCalled()
  })

  it('déclenche un cycle au retour au premier plan', async () => {
    const runCycle = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const stop = await installSync({ outbox: fakeOutbox(0), runCycle, userId: () => 'user-1' })
    await runDebounce()
    runCycle.mockClear()

    simulateWebResume()
    await runDebounce()

    expect(runCycle).toHaveBeenCalledOnce()
    stop()
  })

  it('déclenche un cycle au retour du réseau', async () => {
    let emit!: NetworkListener
    addNetworkListener.mockImplementation(async (_event, listener) => {
      emit = listener
      return { remove: vi.fn<() => Promise<void>>(async () => {}) }
    })
    const runCycle = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const stop = await installSync({ outbox: fakeOutbox(0), runCycle, userId: () => 'user-1' })
    await runDebounce()
    runCycle.mockClear()

    emit({ connected: true, connectionType: 'wifi' })
    await runDebounce()

    expect(runCycle).toHaveBeenCalledOnce()
    stop()
  })

  it('déclenche un cycle quand la connexion réussit (userId passe de null à défini)', async () => {
    const runCycle = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const userId = ref<string | null>(null)
    const stop = await installSync({
      outbox: fakeOutbox(0),
      runCycle,
      userId: () => userId.value,
    })
    await runDebounce()
    runCycle.mockClear()

    userId.value = 'user-1'
    await nextTick()
    await runDebounce()

    expect(runCycle).toHaveBeenCalledOnce()
    stop()
  })

  it('ne déclenche rien à la déconnexion (userId passe à null)', async () => {
    const runCycle = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const userId = ref<string | null>('user-1')
    const stop = await installSync({
      outbox: fakeOutbox(0),
      runCycle,
      userId: () => userId.value,
    })
    await runDebounce()
    runCycle.mockClear()

    userId.value = null
    await nextTick()
    await runDebounce()

    expect(runCycle).not.toHaveBeenCalled()
    stop()
  })

  it('arrête les déclencheurs une fois désinstallé', async () => {
    const runCycle = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const stop = await installSync({ outbox: fakeOutbox(0), runCycle, userId: () => 'user-1' })
    await runDebounce()
    runCycle.mockClear()

    stop()
    simulateWebResume()
    await runDebounce()

    expect(runCycle).not.toHaveBeenCalled()
  })
})
