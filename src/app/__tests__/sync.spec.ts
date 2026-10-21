import type { PluginListenerHandle } from '@capacitor/core'
import { Network } from '@capacitor/network'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { nextTick, ref } from 'vue'
import { simulateWebResume } from '@/core/app-lifecycle/__tests__/simulate-resume'
import { SYNC_DEBOUNCE_MS } from '@/core/sync/service/sync-scheduler'
import type { SyncCycleOutbox } from '@/core/sync/service/sync-cycle'
import type { AccountBackupCheck } from '@/features/settings/service/account-backup.service'
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

function fakeOutbox(pending: number): SyncDependencies['outbox'] {
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
    setLastSyncedAt: vi.fn<SyncCycleOutbox['setLastSyncedAt']>(async () => {}),
    forgetAccount: vi.fn<SyncDependencies['outbox']['forgetAccount']>(async () => {}),
    recordFailedPush: vi.fn<SyncCycleOutbox['recordFailedPush']>(async () => {}),
  }
}

function fakeRestoreFlow(resume: () => Promise<boolean> = async () => false) {
  const restored = new Set<() => void>()
  return {
    offer: vi.fn<SyncDependencies['restoreFlow']['offer']>(),
    unreachable: vi.fn<() => void>(),
    reset: vi.fn<() => void>(),
    resume: vi.fn<() => Promise<boolean>>(async () => {
      const done = await resume()
      if (done) for (const listener of restored) listener()
      return done
    }),
    onRestored(listener: () => void) {
      restored.add(listener)
      return () => restored.delete(listener)
    },
  }
}

const withoutSession = {
  sessionActive: () => false,
  checkAccountBackup: vi.fn<() => Promise<AccountBackupCheck>>(async () => ({ kind: 'active' })),
  restoreFlow: fakeRestoreFlow(),
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
    const deps: SyncDependencies = {
      outbox: fakeOutbox(0),
      runCycle,
      userId: () => 'user-1',
      ...withoutSession,
    }

    await installSync(deps)
    await runDebounce()

    expect(runCycle).toHaveBeenCalledOnce()
  })

  it('déclenche aussi un cycle au lancement quand la file contient des entrées (resumePendingSync)', async () => {
    const runCycle = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const deps: SyncDependencies = {
      outbox: fakeOutbox(3),
      runCycle,
      userId: () => 'user-1',
      ...withoutSession,
    }

    await installSync(deps)
    await runDebounce()

    expect(runCycle).toHaveBeenCalled()
  })

  it('déclenche un cycle au retour au premier plan', async () => {
    const runCycle = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const stop = await installSync({
      outbox: fakeOutbox(0),
      runCycle,
      userId: () => 'user-1',
      ...withoutSession,
    })
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
    const stop = await installSync({
      outbox: fakeOutbox(0),
      runCycle,
      userId: () => 'user-1',
      ...withoutSession,
    })
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
      ...withoutSession,
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
      ...withoutSession,
    })
    await runDebounce()
    runCycle.mockClear()

    userId.value = null
    await nextTick()
    await runDebounce()

    expect(runCycle).not.toHaveBeenCalled()
    stop()
  })

  describe('déconnexion explicite', () => {
    it('désactive la synchro et oublie la file et les curseurs dès que le compte disparaît', async () => {
      const outbox = fakeOutbox(2)
      const userId = ref<string | null>('user-1')
      const stop = await installSync({
        outbox,
        runCycle: vi.fn<() => Promise<void>>(),
        userId: () => userId.value,
        ...withoutSession,
      })

      userId.value = null

      expect(outbox.forgetAccount).toHaveBeenCalledOnce()
      stop()
    })

    it('n’oublie rien au lancement sans compte', async () => {
      const outbox = fakeOutbox(0)
      const stop = await installSync({
        outbox,
        runCycle: vi.fn<() => Promise<void>>(),
        userId: () => null,
        ...withoutSession,
      })
      await runDebounce()

      expect(outbox.forgetAccount).not.toHaveBeenCalled()
      stop()
    })

    it('n’oublie plus rien une fois désinstallé', async () => {
      const outbox = fakeOutbox(0)
      const userId = ref<string | null>('user-1')
      const stop = await installSync({
        outbox,
        runCycle: vi.fn<() => Promise<void>>(),
        userId: () => userId.value,
        ...withoutSession,
      })

      stop()
      userId.value = null

      expect(outbox.forgetAccount).not.toHaveBeenCalled()
    })
  })

  describe('contrôle de la sauvegarde du compte', () => {
    function accountSetup(
      outcome: AccountBackupCheck = {
        kind: 'backup-found',
        summary: { animalCount: 1, lastBackupAt: '2026-10-20T19:04:00.000Z' },
      },
    ) {
      const outbox = fakeOutbox(0)
      const userId = ref<string | null>(null)
      const active = ref(false)
      const steps: string[] = []
      vi.mocked(outbox.forgetAccount).mockImplementation(async () => {
        steps.push('forget')
      })
      const checkAccountBackup = vi.fn<() => Promise<AccountBackupCheck>>(async () => {
        steps.push(`check:${userId.value}`)
        return outcome
      })
      const runCycle = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
      const restoreFlow = fakeRestoreFlow(async () => {
        steps.push('restore')
        return true
      })
      const deps: SyncDependencies = {
        outbox,
        runCycle,
        userId: () => userId.value,
        sessionActive: () => active.value,
        checkAccountBackup,
        restoreFlow,
      }
      return { deps, outbox, userId, active, steps, checkAccountBackup, runCycle, restoreFlow }
    }

    it('contrôle la sauvegarde dès que la session du compte est active, une fois par lancement', async () => {
      const { deps, userId, active, checkAccountBackup } = accountSetup()
      userId.value = 'user-1'
      const stop = await installSync(deps)
      expect(checkAccountBackup).not.toHaveBeenCalled()

      active.value = true
      await vi.advanceTimersByTimeAsync(0)
      active.value = false
      active.value = true
      await vi.advanceTimersByTimeAsync(0)

      expect(checkAccountBackup).toHaveBeenCalledOnce()
      stop()
    })

    it('contrôle au lancement quand la session est déjà active', async () => {
      const { deps, userId, active, checkAccountBackup } = accountSetup()
      userId.value = 'user-1'
      active.value = true

      const stop = await installSync(deps)
      await vi.advanceTimersByTimeAsync(0)

      expect(checkAccountBackup).toHaveBeenCalledOnce()
      stop()
    })

    it('après l’amorçage d’un compte sans sauvegarde, programme un cycle', async () => {
      const { deps, userId, active, runCycle } = accountSetup({ kind: 'seeded' })
      const stop = await installSync(deps)
      await runDebounce()
      runCycle.mockClear()

      userId.value = 'user-1'
      active.value = true
      await vi.advanceTimersByTimeAsync(0)
      await runDebounce()

      expect(runCycle).toHaveBeenCalled()
      stop()
    })

    it('serveur injoignable : recontrôle au prochain retour de la session active', async () => {
      const { deps, userId, active, checkAccountBackup } = accountSetup({ kind: 'unreachable' })
      userId.value = 'user-1'
      active.value = true
      const stop = await installSync(deps)
      await vi.advanceTimersByTimeAsync(0)

      active.value = false
      active.value = true
      await vi.advanceTimersByTimeAsync(0)

      expect(checkAccountBackup).toHaveBeenCalledTimes(2)
      stop()
    })

    it('une restauration à reprendre part dès le contrôle, puis un cycle est programmé', async () => {
      const { deps, userId, active, steps, runCycle } = accountSetup({
        kind: 'restore-pending',
        mode: 'replace',
      })
      userId.value = 'user-1'
      active.value = true
      const stop = await installSync(deps)
      await runDebounce()
      runCycle.mockClear()
      await vi.advanceTimersByTimeAsync(0)

      expect(steps).toEqual(['check:user-1', 'restore'])
      stop()
    })

    it('au retour du réseau, reprend une restauration interrompue', async () => {
      let emit!: NetworkListener
      addNetworkListener.mockImplementation(async (_event, listener) => {
        emit = listener
        return { remove: vi.fn<() => Promise<void>>(async () => {}) }
      })
      const { deps, restoreFlow } = accountSetup()
      const stop = await installSync(deps)

      emit({ connected: true, connectionType: 'wifi' })
      await vi.advanceTimersByTimeAsync(0)
      emit({ connected: true, connectionType: 'wifi' })
      await vi.advanceTimersByTimeAsync(0)

      expect(restoreFlow.resume).toHaveBeenCalledTimes(2)
      stop()
    })

    it('après chaque restauration réussie, programme un cycle', async () => {
      const { deps, runCycle, restoreFlow } = accountSetup()
      const stop = await installSync(deps)
      await runDebounce()
      runCycle.mockClear()

      await restoreFlow.resume()
      await runDebounce()

      expect(runCycle).toHaveBeenCalledOnce()
      stop()
    })

    it('propose le choix avec le résumé quand le compte a une sauvegarde et le téléphone un carnet', async () => {
      const { deps, userId, active, restoreFlow } = accountSetup()
      userId.value = 'user-1'
      active.value = true

      const stop = await installSync(deps)
      await vi.advanceTimersByTimeAsync(0)

      expect(restoreFlow.offer).toHaveBeenCalledWith({
        animalCount: 1,
        lastBackupAt: '2026-10-20T19:04:00.000Z',
      })
      stop()
    })

    it('serveur injoignable : attend le réseau, puis recontrôle à son retour', async () => {
      let emit!: NetworkListener
      addNetworkListener.mockImplementation(async (_event, listener) => {
        emit = listener
        return { remove: vi.fn<() => Promise<void>>(async () => {}) }
      })
      const { deps, userId, active, checkAccountBackup, restoreFlow } = accountSetup({
        kind: 'unreachable',
      })
      userId.value = 'user-1'
      active.value = true
      const stop = await installSync(deps)
      await vi.advanceTimersByTimeAsync(0)
      expect(restoreFlow.unreachable).toHaveBeenCalledOnce()

      emit({ connected: true, connectionType: 'wifi' })
      await vi.advanceTimersByTimeAsync(0)

      expect(checkAccountBackup).toHaveBeenCalledTimes(2)
      stop()
    })

    it('rien à restaurer ou compte changé : le parcours de restauration repart de rien', async () => {
      const { deps, userId, active, restoreFlow } = accountSetup({ kind: 'seeded' })
      userId.value = 'user-1'
      active.value = true
      const stop = await installSync(deps)
      await vi.advanceTimersByTimeAsync(0)
      expect(restoreFlow.reset).toHaveBeenCalledOnce()

      userId.value = 'user-2'
      await vi.advanceTimersByTimeAsync(0)

      expect(restoreFlow.reset).toHaveBeenCalledTimes(3)
      stop()
    })

    it('un autre compte qui remplace le premier : la file du premier est oubliée, puis sa sauvegarde contrôlée', async () => {
      const { deps, userId, active, steps } = accountSetup()
      userId.value = 'user-1'
      active.value = true
      const stop = await installSync(deps)
      await vi.advanceTimersByTimeAsync(0)

      userId.value = 'user-2'
      await vi.advanceTimersByTimeAsync(0)

      expect(steps).toEqual(['check:user-1', 'forget', 'check:user-2'])
      stop()
    })
  })

  it('arrête les déclencheurs une fois désinstallé', async () => {
    const runCycle = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const stop = await installSync({
      outbox: fakeOutbox(0),
      runCycle,
      userId: () => 'user-1',
      ...withoutSession,
    })
    await runDebounce()
    runCycle.mockClear()

    stop()
    simulateWebResume()
    await runDebounce()

    expect(runCycle).not.toHaveBeenCalled()
  })
})
